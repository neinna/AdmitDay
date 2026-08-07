/**
 * __tests__/rationale-provider-errors.test.ts
 *
 * Issue #128: /api/rationale has the same shape as /api/find/ask (an
 * unwrapped Anthropic call whose failures were returned to the client
 * verbatim). Same mocking approach as find-ask-provider-errors.test.ts —
 * mock the provider call to fail each way, assert only plain-language
 * responses ever reach the client.
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

import { POST } from '@/app/api/rationale/route'

const FORBIDDEN_SUBSTRINGS = [
  'usage limit',
  'credit',
  'quota',
  'regain access',
  'request_id',
  'anthropic',
]

const school = {
  name: 'Test High School',
  borough: 'Manhattan',
  size: 'small',
  admissions_types: ['screened'],
}

const userInputs = {
  boroughs: ['Manhattan'],
  interests: ['STEM'],
  academicRatings: ['strong'],
  shsat: false,
  auditions: false,
  iep: false,
  size: 'small',
}

function fakeRationaleRequest(ip: string): NextRequest {
  return {
    headers: {
      get: (name: string) => (name.toLowerCase() === 'x-forwarded-for' ? ip : null),
    },
    json: async () => ({ school, userInputs }),
  } as unknown as NextRequest
}

beforeEach(() => {
  mockCreate.mockReset()
  mockCaptureException.mockReset()
})

describe('/api/rationale provider failure handling (issue #128)', () => {
  it('returns a plain-language unavailable response for a usage-limit/credit error', async () => {
    const upstreamError = new Error(
      'Your credit balance is too low to access the API. Please go to Plans & Billing to upgrade or purchase credits.'
    )
    ;(upstreamError as unknown as { status: number }).status = 400
    mockCreate.mockRejectedValue(upstreamError)

    const res = await POST(fakeRationaleRequest('10.0.1.1'))
    expect(res.status).toBe(503)
    const body = await res.json()
    const serialized = JSON.stringify(body).toLowerCase()
    for (const forbidden of FORBIDDEN_SUBSTRINGS) {
      expect(serialized).not.toContain(forbidden)
    }
    expect(mockCaptureException).toHaveBeenCalledWith(upstreamError)
  })

  it('preserves the existing 429 rate-limit response when the provider itself rate-limits', async () => {
    const upstreamError = new Error('429 rate_limit_error')
    ;(upstreamError as unknown as { status: number }).status = 429
    mockCreate.mockRejectedValue(upstreamError)

    const res = await POST(fakeRationaleRequest('10.0.1.2'))
    expect(res.status).toBe(429)
    const body = await res.json()
    expect(body.error).toBe(
      "You're sending requests too quickly — please wait a moment and try again."
    )
  })

  it('returns a generic failure message for an unrecognized error', async () => {
    const upstreamError = new Error('something exploded')
    mockCreate.mockRejectedValue(upstreamError)

    const res = await POST(fakeRationaleRequest('10.0.1.3'))
    expect(res.status).toBe(500)
    const body = await res.json()
    const serialized = JSON.stringify(body).toLowerCase()
    for (const forbidden of FORBIDDEN_SUBSTRINGS) {
      expect(serialized).not.toContain(forbidden)
    }
  })

  it('still returns a normal title/rationale when the provider call succeeds (no regression)', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{"title":"Great fit","rationale":"Details here."}' }],
    })

    const res = await POST(fakeRationaleRequest('10.0.1.4'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.title).toBe('Great fit')
    expect(body.rationale).toBe('Details here.')
  })
})
