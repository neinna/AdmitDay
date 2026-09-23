/**
 * __tests__/ask-provider-limit.test.ts
 *
 * Issue #354: a raw Anthropic usage-limit 400 ("You have reached your
 * specified API usage limits...") reached a parent as-is via /api/find/ask.
 * lib/ask.ts now catches that specific, distinctly-classified provider
 * failure and returns the approved PROVIDER_LIMIT copy with the already-
 * retrieved sources intact — never the vendor's raw message — and the
 * route records it as its own Langfuse outcome instead of ordinary
 * "provider_error". A generic provider failure (no usage-limit wording)
 * must still take its existing path unchanged.
 */

import type { NextRequest } from 'next/server'

const mockCreate = jest.fn()
const mockCaptureException = jest.fn()
const mockRecordLlmTrace = jest.fn()

jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  }))
})

jest.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}))

jest.mock('@/lib/trace', () => ({
  recordLlmTrace: (...args: unknown[]) => mockRecordLlmTrace(...args),
}))

const SCHOOL_RESULT = {
  dbn: '01M001',
  name: 'Test High School',
  borough: 'Manhattan',
  score: 0.87,
  matchedChunkType: 'identity',
  chunk: 'Test High School is a small school in Manhattan.',
}

jest.mock('@/lib/rag', () => ({
  searchSchools: jest.fn().mockResolvedValue([SCHOOL_RESULT]),
}))

import { POST } from '@/app/api/find/ask/route'
import { answerQuestion } from '@/lib/ask'
import { PROVIDER_LIMIT } from '@/lib/ask-guardrails'
import { classifyProviderError, UNAVAILABLE_MESSAGE } from '@/lib/provider-error'

function fakeAskRequest(question: string, ip: string): NextRequest {
  return {
    headers: {
      get: (name: string) => (name.toLowerCase() === 'x-forwarded-for' ? ip : null),
    },
    json: async () => ({ question }),
  } as unknown as NextRequest
}

function usageLimitError(): Error {
  const err = new Error(
    '400 {"type":"error","error":{"type":"invalid_request_error","message":"You have reached your specified API usage limits. You will regain access on 2026-10-01 at 00:00 UTC."}}'
  )
  ;(err as unknown as { status: number }).status = 400
  return err
}

beforeEach(() => {
  mockCreate.mockReset()
  mockCaptureException.mockReset()
  mockRecordLlmTrace.mockReset()
})

describe('classifyProviderError distinguishes a usage-limit 400 (issue #354)', () => {
  it('classifies it as "usage_limit", distinct from a generic outage, while keeping the same client-safe body', () => {
    const result = classifyProviderError(usageLimitError())
    expect(result.classification).toBe('usage_limit')
    expect(result.status).toBe(503)
    expect(result.body).toEqual({ error: UNAVAILABLE_MESSAGE })
  })
})

describe('lib/ask.ts answerQuestion() on a usage-limit 400 (issue #354)', () => {
  it('returns PROVIDER_LIMIT with the retrieved sources intact, never the vendor message', async () => {
    mockCreate.mockRejectedValue(usageLimitError())

    const result = await answerQuestion({ question: 'Which schools have small classes?' })

    expect(result.answer).toBe(PROVIDER_LIMIT)
    expect(result.guardrail).toBe('provider_limit')
    expect(result.sources).toEqual([SCHOOL_RESULT])
    expect(result.answer).not.toContain('usage limit')
    expect(result.answer).not.toContain('invalid_request_error')
  })

  it('still logs the real error to Sentry even though the parent gets PROVIDER_LIMIT', async () => {
    const err = usageLimitError()
    mockCreate.mockRejectedValue(err)

    await answerQuestion({ question: 'Which schools have small classes?' })

    expect(mockCaptureException).toHaveBeenCalledWith(err)
  })

  it('still throws for a generic provider error, unchanged', async () => {
    const err = new Error('Internal server error')
    ;(err as unknown as { status: number }).status = 529
    mockCreate.mockRejectedValue(err)

    await expect(answerQuestion({ question: 'Which schools have small classes?' })).rejects.toThrow(
      'Internal server error'
    )
  })
})

describe('/api/find/ask on a usage-limit 400 (issue #354)', () => {
  it('responds 200 with PROVIDER_LIMIT and the sources, and never the raw provider message', async () => {
    mockCreate.mockRejectedValue(usageLimitError())

    const res = await POST(fakeAskRequest('Which schools have small classes?', '10.20.0.1'))
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.answer).toBe(PROVIDER_LIMIT)
    expect(body.sources).toHaveLength(1)
    expect(body.sources[0].dbn).toBe(SCHOOL_RESULT.dbn)

    const serialized = JSON.stringify(body)
    expect(serialized).not.toContain('usage limit')
    expect(serialized).not.toContain('invalid_request_error')
    expect(serialized).not.toContain('regain access')
  })

  it('records the trace with a distinct "provider_limit" outcome, not "ok" or "provider_error"', async () => {
    mockCreate.mockRejectedValue(usageLimitError())

    await POST(fakeAskRequest('Which schools have small classes?', '10.20.0.2'))

    expect(mockRecordLlmTrace).toHaveBeenCalledTimes(1)
    const event = mockRecordLlmTrace.mock.calls[0][0]
    expect(event.outcome).toBe('provider_limit')
    expect(event.guardrail).toBe('provider_limit')
  })

  it('still reaches Sentry through the route, even though the response is a 200', async () => {
    const err = usageLimitError()
    mockCreate.mockRejectedValue(err)

    await POST(fakeAskRequest('Which schools have small classes?', '10.20.0.4'))

    expect(mockCaptureException).toHaveBeenCalledWith(err)
  })

  it('a generic provider error (no usage-limit wording) still takes the existing provider_error path unchanged', async () => {
    const err = new Error('Internal server error')
    ;(err as unknown as { status: number }).status = 529
    mockCreate.mockRejectedValue(err)

    const res = await POST(fakeAskRequest('Which schools have small classes?', '10.20.0.3'))
    expect(res.status).toBe(503)

    const body = await res.json()
    expect(body.sources).toBeUndefined()

    expect(mockRecordLlmTrace).toHaveBeenCalledTimes(1)
    const event = mockRecordLlmTrace.mock.calls[0][0]
    expect(event.outcome).toBe('provider_error')
    expect(event.errorClassification).toBe('unavailable')
  })
})
