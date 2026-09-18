/**
 * __tests__/llm-tracing-routes.test.ts
 *
 * Issue #194: /api/find/ask and /api/rationale must each write one Langfuse
 * trace per request via lib/trace.ts's recordLlmTrace — including for a
 * rate-limited (429) rejection, which is a product event we want visibility
 * into, not a non-event. lib/trace.ts is mocked here; its own allowlist and
 * failure-swallowing behavior are covered by __tests__/trace.test.ts. These
 * tests instead pin that the *routes* call recordLlmTrace with the right
 * outcome, and never pass the raw question/answer text into it.
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

import { POST as askPost } from '@/app/api/find/ask/route'
import { POST as rationalePost } from '@/app/api/rationale/route'
import { MAX_REQUESTS } from '@/lib/rate-limit'

function fakeAskRequest(question: string, ip: string): NextRequest {
  return {
    headers: {
      get: (name: string) => (name.toLowerCase() === 'x-forwarded-for' ? ip : null),
    },
    json: async () => ({ question }),
  } as unknown as NextRequest
}

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
  mockRecordLlmTrace.mockReset()
})

describe('/api/find/ask tracing', () => {
  it('records an "ok" trace with retrieval/model/token fields, and never the raw question or answer text', async () => {
    mockCreate.mockResolvedValue({
      model: 'claude-sonnet-5',
      usage: { input_tokens: 120, output_tokens: 80 },
      content: [{ type: 'text', text: 'Test High School is a great fit.' }],
    })

    const question = 'My child has an IEP, which schools support that?'
    const res = await askPost(fakeAskRequest(question, '10.10.0.1'))
    expect(res.status).toBe(200)

    expect(mockRecordLlmTrace).toHaveBeenCalledTimes(1)
    const event = mockRecordLlmTrace.mock.calls[0][0]
    expect(event.outcome).toBe('ok')
    expect(event.model).toBe('claude-sonnet-5')
    expect(event.inputTokens).toBe(120)
    expect(event.outputTokens).toBe(80)
    expect(typeof event.latencyMs).toBe('number')
    expect(event.retrieval).toEqual([{ dbn: '01M001', score: 0.87, matchedChunkType: 'identity' }])
    expect(typeof event.questionHash).toBe('string')
    expect(event.questionLength).toBe(question.length)

    const serialized = JSON.stringify(event)
    expect(serialized).not.toContain(question)
    expect(serialized).not.toContain('Test High School is a great fit')
    expect(serialized).not.toContain('a small school in Manhattan')
  })

  it('records a "rate_limited" trace when the per-IP cap is hit — a 429 is still traced', async () => {
    mockCreate.mockResolvedValue({
      model: 'claude-sonnet-5',
      usage: { input_tokens: 10, output_tokens: 5 },
      content: [{ type: 'text', text: 'ok' }],
    })

    const ip = '10.10.0.2'
    for (let i = 0; i < MAX_REQUESTS; i++) {
      const res = await askPost(fakeAskRequest('warm up the bucket', ip))
      expect(res.status).toBe(200)
    }
    mockRecordLlmTrace.mockClear()

    const res = await askPost(fakeAskRequest('one too many', ip))
    expect(res.status).toBe(429)

    expect(mockRecordLlmTrace).toHaveBeenCalledTimes(1)
    const event = mockRecordLlmTrace.mock.calls[0][0]
    expect(event.outcome).toBe('rate_limited')
  })

  it('records a "provider_error" trace (or rate_limited if the provider itself 429s) on failure', async () => {
    const upstreamError = new Error('Internal server error')
    ;(upstreamError as unknown as { status: number }).status = 529
    mockCreate.mockRejectedValue(upstreamError)

    const res = await askPost(fakeAskRequest('Which schools have strong STEM?', '10.10.0.3'))
    expect(res.status).toBe(503)

    expect(mockRecordLlmTrace).toHaveBeenCalledTimes(1)
    const event = mockRecordLlmTrace.mock.calls[0][0]
    expect(event.outcome).toBe('provider_error')
    expect(event.errorClassification).toBe('unavailable')
    expect(JSON.stringify(event)).not.toContain('Which schools have strong STEM')
  })

  it('records a "bad_request" trace when question is missing or not a string', async () => {
    const req = {
      headers: { get: () => '10.10.0.4' },
      json: async () => ({}),
    } as unknown as NextRequest

    const res = await askPost(req)
    expect(res.status).toBe(400)
    expect(mockRecordLlmTrace).toHaveBeenCalledTimes(1)
    expect(mockRecordLlmTrace.mock.calls[0][0].outcome).toBe('bad_request')
  })
})

describe('/api/rationale tracing', () => {
  it('records an "ok" trace on success with model/token fields, and never school or student text', async () => {
    mockCreate.mockResolvedValue({
      model: 'claude-sonnet-5',
      usage: { input_tokens: 60, output_tokens: 40 },
      content: [{ type: 'text', text: '{"title":"Great fit","rationale":"Details here."}' }],
    })

    const res = await rationalePost(fakeRationaleRequest('10.10.1.1'))
    expect(res.status).toBe(200)

    expect(mockRecordLlmTrace).toHaveBeenCalledTimes(1)
    const event = mockRecordLlmTrace.mock.calls[0][0]
    expect(event.outcome).toBe('ok')
    expect(event.model).toBe('claude-sonnet-5')
    expect(event.inputTokens).toBe(60)
    expect(event.outputTokens).toBe(40)

    const serialized = JSON.stringify(event)
    expect(serialized).not.toContain('Great fit')
    expect(serialized).not.toContain('Details here')
    expect(serialized).not.toContain('Test High School')
  })

  it('records a "rate_limited" trace when the per-IP cap is hit', async () => {
    mockCreate.mockResolvedValue({
      model: 'claude-sonnet-5',
      usage: { input_tokens: 10, output_tokens: 5 },
      content: [{ type: 'text', text: '{"title":"t","rationale":"r"}' }],
    })

    const ip = '10.10.1.2'
    for (let i = 0; i < MAX_REQUESTS; i++) {
      const res = await rationalePost(fakeRationaleRequest(ip))
      expect(res.status).toBe(200)
    }
    mockRecordLlmTrace.mockClear()

    const res = await rationalePost(fakeRationaleRequest(ip))
    expect(res.status).toBe(429)

    expect(mockRecordLlmTrace).toHaveBeenCalledTimes(1)
    expect(mockRecordLlmTrace.mock.calls[0][0].outcome).toBe('rate_limited')
  })

  it('records a "provider_error" trace on an upstream failure', async () => {
    const upstreamError = new Error('something exploded')
    mockCreate.mockRejectedValue(upstreamError)

    const res = await rationalePost(fakeRationaleRequest('10.10.1.3'))
    expect(res.status).toBe(500)

    expect(mockRecordLlmTrace).toHaveBeenCalledTimes(1)
    const event = mockRecordLlmTrace.mock.calls[0][0]
    expect(event.outcome).toBe('provider_error')
    expect(event.errorClassification).toBe('generic')
  })
})
