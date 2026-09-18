/**
 * __tests__/trace.test.ts
 *
 * Issue #194: lib/trace.ts is the only file in the product that talks to
 * Langfuse, on the same logging-only terms as scripts/langfuse_trace.py.
 * These tests pin its two load-bearing guarantees:
 *
 *  1. The payload allowlist drops anything not explicitly listed, so a
 *     future caller can never leak question/answer/prompt/chunk text by
 *     spreading an object into recordLlmTrace().
 *  2. Any Langfuse failure (bad host, rejected auth, a wedged fetch) is
 *     swallowed inside the module — it can never throw, reject, or slow
 *     down the caller, which never awaits it.
 */

const mockTraceFn = jest.fn()
const mockGenerationFn = jest.fn()
const mockEndFn = jest.fn()
const mockFlushAsync = jest.fn()
const mockLangfuseCtor = jest.fn()

jest.mock('langfuse', () => ({
  Langfuse: jest.fn().mockImplementation((...args: unknown[]) => {
    mockLangfuseCtor(...args)
    return {
      trace: (...traceArgs: unknown[]) => {
        mockTraceFn(...traceArgs)
        return {
          generation: (...genArgs: unknown[]) => {
            mockGenerationFn(...genArgs)
            return { end: mockEndFn }
          },
        }
      },
      flushAsync: (...flushArgs: unknown[]) => mockFlushAsync(...flushArgs),
    }
  }),
}))

import { buildTracePayload } from '@/lib/trace'

describe('buildTracePayload allowlist', () => {
  it('keeps only allowlisted top-level keys and drops question/answer/prompt text', () => {
    const payload = buildTracePayload({
      route: 'find_ask',
      sessionId: 'session-abc',
      outcome: 'ok',
      latencyMs: 42,
      question: "My child has an IEP and struggles with math, which school fits?",
      answer: 'Based on your question, School X is a great fit because...',
      prompt: 'You are an experienced NYC high school admissions consultant...',
      chunk: 'School X overview: rigorous STEM curriculum...',
    })

    expect(payload).not.toBeNull()
    expect(payload).not.toHaveProperty('question')
    expect(payload).not.toHaveProperty('answer')
    expect(payload).not.toHaveProperty('prompt')
    expect(payload).not.toHaveProperty('chunk')
    expect(Object.keys(payload!).sort()).toEqual(
      ['latencyMs', 'outcome', 'route', 'sessionId'].sort()
    )
  })

  it('drops unlisted keys even when spread alongside legitimate fields', () => {
    const raw = {
      route: 'find_ask',
      sessionId: 's1',
      outcome: 'ok',
      latencyMs: 10,
      questionLength: 42,
      questionHash: 'abc123',
      // Simulates a future caller accidentally spreading an object that
      // carries free text alongside the allowed fields.
      rawQuestionText: 'details about a specific child',
      internalDebugPrompt: 'full system prompt',
    }
    const payload = buildTracePayload(raw)!
    expect(payload).not.toHaveProperty('rawQuestionText')
    expect(payload).not.toHaveProperty('internalDebugPrompt')
    expect(payload.questionLength).toBe(42)
    expect(payload.questionHash).toBe('abc123')
  })

  it('keeps only allowlisted retrieval keys, dropping chunk text carried on a result object', () => {
    const payload = buildTracePayload({
      route: 'find_ask',
      sessionId: 's1',
      outcome: 'ok',
      latencyMs: 10,
      retrieval: [
        {
          dbn: '01M001',
          score: 0.91,
          matchedChunkType: 'identity',
          chunk: 'Full retrieved school chunk text that must never leave the app.',
          name: 'Test High School',
        },
      ],
    })

    expect(payload!.retrieval).toEqual([
      { dbn: '01M001', score: 0.91, matchedChunkType: 'identity' },
    ])
  })

  it('returns null for non-object input', () => {
    expect(buildTracePayload(null)).toBeNull()
    expect(buildTracePayload(undefined)).toBeNull()
    expect(buildTracePayload('a raw string')).toBeNull()
  })

  it('drops non-object entries inside a malformed retrieval array instead of throwing', () => {
    const payload = buildTracePayload({
      route: 'find_ask',
      sessionId: 's1',
      outcome: 'ok',
      latencyMs: 10,
      retrieval: ['not an object', null, { dbn: '01M001', score: 0.5, matchedChunkType: 'identity' }],
    })
    expect(payload!.retrieval).toEqual([{ dbn: '01M001', score: 0.5, matchedChunkType: 'identity' }])
  })
})

describe('recordLlmTrace failure handling', () => {
  const ORIGINAL_ENV = { ...process.env }

  beforeEach(() => {
    jest.resetModules()
    mockTraceFn.mockReset()
    mockGenerationFn.mockReset()
    mockEndFn.mockReset()
    mockFlushAsync.mockReset()
    mockLangfuseCtor.mockReset()
    process.env = { ...ORIGINAL_ENV }
  })

  afterAll(() => {
    process.env = ORIGINAL_ENV
  })

  it('never throws and swallows a Langfuse flush failure (bad host / auth rejection)', async () => {
    process.env.LANGFUSE_APP_PUBLIC_KEY = 'pk'
    process.env.LANGFUSE_APP_SECRET_KEY = 'sk'
    mockFlushAsync.mockRejectedValue(new Error('getaddrinfo ENOTFOUND bad.host'))

    const { recordLlmTrace } = await import('@/lib/trace')

    expect(() =>
      recordLlmTrace({ route: 'find_ask', sessionId: 's1', latencyMs: 5, outcome: 'ok' })
    ).not.toThrow()

    // Let the rejected flushAsync promise settle inside the module's own
    // .catch() — if it were unhandled, this test process would report an
    // unhandled rejection.
    await new Promise((resolve) => setTimeout(resolve, 10))
  })

  it('never throws when the Langfuse constructor itself throws', async () => {
    process.env.LANGFUSE_APP_PUBLIC_KEY = 'pk'
    process.env.LANGFUSE_APP_SECRET_KEY = 'sk'
    const langfuseModule = jest.requireMock('langfuse') as { Langfuse: jest.Mock }
    langfuseModule.Langfuse.mockImplementationOnce(() => {
      throw new Error('bad config')
    })

    const { recordLlmTrace } = await import('@/lib/trace')
    expect(() =>
      recordLlmTrace({ route: 'find_ask', sessionId: 's1', latencyMs: 5, outcome: 'ok' })
    ).not.toThrow()
    expect(mockTraceFn).not.toHaveBeenCalled()
  })

  it('is a no-op — never constructs a client — when LANGFUSE_* keys are unset', async () => {
    delete process.env.LANGFUSE_APP_PUBLIC_KEY
    delete process.env.LANGFUSE_APP_SECRET_KEY

    const { recordLlmTrace } = await import('@/lib/trace')
    recordLlmTrace({ route: 'find_ask', sessionId: 's1', latencyMs: 5, outcome: 'ok' })

    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(mockLangfuseCtor).not.toHaveBeenCalled()
    expect(mockTraceFn).not.toHaveBeenCalled()
  })

  it('sends a trace with the expected shape when Langfuse is configured and healthy', async () => {
    process.env.LANGFUSE_APP_PUBLIC_KEY = 'pk'
    process.env.LANGFUSE_APP_SECRET_KEY = 'sk'
    mockFlushAsync.mockResolvedValue(undefined)

    const { recordLlmTrace } = await import('@/lib/trace')
    recordLlmTrace({
      route: 'find_ask',
      sessionId: 's1',
      questionLength: 12,
      questionHash: 'deadbeef',
      retrieval: [{ dbn: '01M001', score: 0.9, matchedChunkType: 'identity' }],
      model: 'claude-sonnet-5',
      inputTokens: 100,
      outputTokens: 50,
      latencyMs: 250,
      costUsd: 0.001,
      outcome: 'ok',
    })

    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(mockTraceFn).toHaveBeenCalledTimes(1)
    expect(mockFlushAsync).toHaveBeenCalledTimes(1)
    const traceArg = mockTraceFn.mock.calls[0][0]
    expect(traceArg.sessionId).toBe('s1')
    expect(traceArg.metadata.questionHash).toBe('deadbeef')
    expect(traceArg.metadata.retrieval).toEqual([
      { dbn: '01M001', score: 0.9, matchedChunkType: 'identity' },
    ])

    const genArg = mockGenerationFn.mock.calls[0][0]
    expect(genArg.model).toBe('claude-sonnet-5')
    expect(genArg.usage).toEqual({ input: 100, output: 50 })
  })
})
