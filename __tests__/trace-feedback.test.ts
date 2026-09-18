/**
 * __tests__/trace-feedback.test.ts
 *
 * Issue #195: lib/trace.ts must (a) thread a caller-supplied traceId onto
 * the Langfuse trace it creates, so the id returned to the client and the
 * id the trace lives under are the same record, and (b) write a score
 * against that traceId when the user rates the answer. Same file layout
 * and Langfuse-mocking approach as __tests__/trace.test.ts (issue #194);
 * kept in a separate file because it needs the real lib/trace module,
 * which __tests__/feedback-trace-join.test.ts and __tests__/llm-tracing-
 * routes.test.ts mock out entirely to test their callers in isolation.
 */

const mockTraceFn = jest.fn()
const mockGenerationFn = jest.fn()
const mockEndFn = jest.fn()
const mockScoreFn = jest.fn()
const mockFlushAsync = jest.fn()

jest.mock('langfuse', () => ({
  Langfuse: jest.fn().mockImplementation(() => ({
    trace: (...args: unknown[]) => {
      mockTraceFn(...args)
      return {
        generation: (...genArgs: unknown[]) => {
          mockGenerationFn(...genArgs)
          return { end: mockEndFn }
        },
      }
    },
    score: (...args: unknown[]) => mockScoreFn(...args),
    flushAsync: (...args: unknown[]) => mockFlushAsync(...args),
  })),
}))

import { buildTracePayload, buildFeedbackPayload } from '@/lib/trace'

describe('buildTracePayload keeps traceId (issue #195)', () => {
  it('keeps traceId through the allowlist', () => {
    const payload = buildTracePayload({
      route: 'find_ask',
      sessionId: 's1',
      traceId: 'trace-abc',
      outcome: 'ok',
      latencyMs: 5,
    })
    expect(payload!.traceId).toBe('trace-abc')
  })
})

describe('buildFeedbackPayload allowlist (issue #195)', () => {
  it('keeps only traceId and rating, dropping anything else', () => {
    const payload = buildFeedbackPayload({
      traceId: 'trace-abc',
      rating: 'up',
      question: 'raw text that must never leave the app',
    })
    expect(payload).toEqual({ traceId: 'trace-abc', rating: 'up' })
  })

  it('returns null for non-object input', () => {
    expect(buildFeedbackPayload(null)).toBeNull()
    expect(buildFeedbackPayload('nope')).toBeNull()
  })
})

describe('recordLlmTrace threads traceId onto the Langfuse trace id', () => {
  const ORIGINAL_ENV = { ...process.env }

  beforeEach(() => {
    jest.resetModules()
    mockTraceFn.mockReset()
    mockGenerationFn.mockReset()
    mockEndFn.mockReset()
    mockFlushAsync.mockReset()
    mockFlushAsync.mockResolvedValue(undefined)
    process.env = { ...ORIGINAL_ENV, LANGFUSE_APP_PUBLIC_KEY: 'pk', LANGFUSE_APP_SECRET_KEY: 'sk' }
  })

  afterAll(() => {
    process.env = ORIGINAL_ENV
  })

  it('passes traceId as the Langfuse trace id so the response and the trace are the same record', async () => {
    const { recordLlmTrace } = await import('@/lib/trace')
    recordLlmTrace({ route: 'find_ask', sessionId: 's1', traceId: 'trace-xyz', latencyMs: 5, outcome: 'ok' })

    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(mockTraceFn).toHaveBeenCalledTimes(1)
    expect(mockTraceFn.mock.calls[0][0].id).toBe('trace-xyz')
  })

  it('omits the trace id field when the caller does not supply one (e.g. the rationale route)', async () => {
    const { recordLlmTrace } = await import('@/lib/trace')
    recordLlmTrace({ route: 'rationale', sessionId: 's1', latencyMs: 5, outcome: 'ok' })

    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(mockTraceFn.mock.calls[0][0].id).toBeUndefined()
  })
})

describe('recordLlmFeedback writes a Langfuse score against the traceId (issue #195)', () => {
  const ORIGINAL_ENV = { ...process.env }

  beforeEach(() => {
    jest.resetModules()
    mockScoreFn.mockReset()
    mockFlushAsync.mockReset()
    mockFlushAsync.mockResolvedValue(undefined)
    process.env = { ...ORIGINAL_ENV, LANGFUSE_APP_PUBLIC_KEY: 'pk', LANGFUSE_APP_SECRET_KEY: 'sk' }
  })

  afterAll(() => {
    process.env = ORIGINAL_ENV
  })

  it('scores a thumbs-up as 1 against the given traceId', async () => {
    const { recordLlmFeedback } = await import('@/lib/trace')
    recordLlmFeedback({ traceId: 'trace-xyz', rating: 'up' })

    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(mockScoreFn).toHaveBeenCalledTimes(1)
    expect(mockScoreFn.mock.calls[0][0]).toMatchObject({ traceId: 'trace-xyz', value: 1 })
    expect(mockFlushAsync).toHaveBeenCalledTimes(1)
  })

  it('scores a thumbs-down as 0', async () => {
    const { recordLlmFeedback } = await import('@/lib/trace')
    recordLlmFeedback({ traceId: 'trace-xyz', rating: 'down' })

    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(mockScoreFn.mock.calls[0][0]).toMatchObject({ traceId: 'trace-xyz', value: 0 })
  })

  it('is a no-op — never constructs a client — when LANGFUSE_* keys are unset', async () => {
    process.env = { ...ORIGINAL_ENV }
    delete process.env.LANGFUSE_APP_PUBLIC_KEY
    delete process.env.LANGFUSE_APP_SECRET_KEY

    const { recordLlmFeedback } = await import('@/lib/trace')
    expect(() => recordLlmFeedback({ traceId: 'trace-xyz', rating: 'up' })).not.toThrow()
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(mockScoreFn).not.toHaveBeenCalled()
  })

  it('never throws and swallows a failed score flush (bad host / auth rejection) — same discipline as recordLlmTrace', async () => {
    mockFlushAsync.mockRejectedValue(new Error('getaddrinfo ENOTFOUND bad.host'))

    const { recordLlmFeedback } = await import('@/lib/trace')
    expect(() => recordLlmFeedback({ traceId: 'trace-xyz', rating: 'up' })).not.toThrow()
    await new Promise((resolve) => setTimeout(resolve, 10))
  })
})
