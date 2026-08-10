/**
 * __tests__/find-ask-provider-errors.test.ts
 *
 * Issue #128: a real visitor hit the /find ask endpoint (then
 * /api/chat, now /api/find/ask — issue #170) in production and got a
 * raw 400 with vendor error text ("You have reached your specified API
 * usage limits. You will regain access on 2026-08-01 at 00:00 UTC.").
 * These tests mock the Anthropic call to fail in each of the ways a
 * provider can fail, and assert the client only ever sees one of the
 * small set of plain-language responses — never the upstream error.
 */

import type { NextRequest } from 'next/server'

const mockCreate = jest.fn()
const mockCaptureException = jest.fn()

jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  }))
})

jest.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}))

jest.mock('@/lib/rag', () => ({
  searchSchools: jest.fn().mockResolvedValue([
    {
      dbn: '01M001',
      name: 'Test High School',
      borough: 'Manhattan',
      score: 0.87,
      matchedChunkType: 'identity',
      chunk: 'Test High School is a small school in Manhattan.',
    },
  ]),
}))

import { POST } from '@/app/api/find/ask/route'

const FORBIDDEN_SUBSTRINGS = [
  'usage limit',
  'credit',
  'quota',
  'regain access',
  'request_id',
  'anthropic',
]

function fakeAskRequest(question: string, ip: string): NextRequest {
  return {
    headers: {
      get: (name: string) => (name.toLowerCase() === 'x-forwarded-for' ? ip : null),
    },
    json: async () => ({ question }),
  } as unknown as NextRequest
}

beforeEach(() => {
  mockCreate.mockReset()
  mockCaptureException.mockReset()
})

describe('/api/find/ask provider failure handling (issue #128)', () => {
  it('returns a plain-language unavailable response for a usage-limit error, and logs the real error to Sentry', async () => {
    const upstreamError = new Error(
      '400 {"type":"error","error":{"type":"invalid_request_error","message":"You have reached your specified API usage limits. You will regain access on 2026-08-01 at 00:00 UTC."}}, "request_id": "req_abc123"'
    )
    ;(upstreamError as unknown as { status: number }).status = 400
    mockCreate.mockRejectedValue(upstreamError)

    const res = await POST(fakeAskRequest('Which schools have strong STEM?', '10.0.0.1'))
    expect(res.status).toBe(503)

    const bodyText = await res.text()
    for (const forbidden of FORBIDDEN_SUBSTRINGS) {
      expect(bodyText.toLowerCase()).not.toContain(forbidden)
    }
    const body = JSON.parse(bodyText)
    expect(typeof body.error).toBe('string')
    expect(body.error.length).toBeGreaterThan(0)

    expect(mockCaptureException).toHaveBeenCalledWith(upstreamError)
  })

  it('returns a plain-language unavailable response for a provider outage (5xx)', async () => {
    const upstreamError = new Error('Internal server error')
    ;(upstreamError as unknown as { status: number }).status = 529
    mockCreate.mockRejectedValue(upstreamError)

    const res = await POST(fakeAskRequest('Which schools have strong STEM?', '10.0.0.2'))
    expect(res.status).toBe(503)
    const body = await res.json()
    const serialized = JSON.stringify(body).toLowerCase()
    for (const forbidden of FORBIDDEN_SUBSTRINGS) {
      expect(serialized).not.toContain(forbidden)
    }
  })

  it('preserves the existing 429 rate-limit response when the provider itself rate-limits', async () => {
    const upstreamError = new Error('429 rate_limit_error')
    ;(upstreamError as unknown as { status: number }).status = 429
    mockCreate.mockRejectedValue(upstreamError)

    const res = await POST(fakeAskRequest('Which schools have strong STEM?', '10.0.0.3'))
    expect(res.status).toBe(429)
    const body = await res.json()
    expect(body.error).toBe(
      "You're sending requests too quickly — please wait a moment and try again."
    )
  })

  it('returns a generic failure message for an unrecognized error', async () => {
    const upstreamError = new Error('something exploded')
    mockCreate.mockRejectedValue(upstreamError)

    const res = await POST(fakeAskRequest('Which schools have strong STEM?', '10.0.0.4'))
    expect(res.status).toBe(500)
    const body = await res.json()
    const serialized = JSON.stringify(body).toLowerCase()
    for (const forbidden of FORBIDDEN_SUBSTRINGS) {
      expect(serialized).not.toContain(forbidden)
    }
    expect(mockCaptureException).toHaveBeenCalledWith(upstreamError)
  })

  it('still returns a normal answer when the provider call succeeds (no regression)', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Test High School is a great fit.' }],
    })

    const res = await POST(fakeAskRequest('Which schools have strong STEM?', '10.0.0.5'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.answer).toBe('Test High School is a great fit.')
    expect(body.sources).toHaveLength(1)
  })
})
