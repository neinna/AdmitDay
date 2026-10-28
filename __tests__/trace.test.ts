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

// recordLlmTrace sends through Langfuse v5 (issue #530): @langfuse/tracing
// for the spans, lib/langfuse-otel for the isolated tracer provider.
const mockInit = jest.fn()
const mockFlush = jest.fn()
const mockPropagate = jest.fn()
const mockStartObservation = jest.fn()
const mockChildObservation = jest.fn()
const mockRootEnd = jest.fn()
const mockChildEnd = jest.fn()
const mockCaptureException = jest.fn()

jest.mock('@/lib/langfuse-otel', () => ({
  initLangfuseTracing: () => mockInit(),
  forceFlushLangfuse: () => mockFlush(),
}))

jest.mock('@langfuse/tracing', () => ({
  propagateAttributes: (params: unknown, fn: () => unknown) => {
    mockPropagate(params)
    return fn()
  },
  startObservation: (...args: unknown[]) => {
    mockStartObservation(...args)
    return {
      startObservation: (...childArgs: unknown[]) => {
        mockChildObservation(...childArgs)
        return { end: mockChildEnd }
      },
      end: mockRootEnd,
    }
  },
}))

jest.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
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
    for (const m of [mockInit, mockFlush, mockPropagate, mockStartObservation, mockChildObservation, mockRootEnd, mockChildEnd, mockCaptureException]) {
      m.mockReset()
    }
    mockInit.mockReturnValue(true)
    mockFlush.mockResolvedValue(undefined)
    process.env = { ...ORIGINAL_ENV, LANGFUSE_APP_PUBLIC_KEY: 'pk', LANGFUSE_APP_SECRET_KEY: 'sk' }
  })

  afterAll(() => {
    process.env = ORIGINAL_ENV
  })

  it('never throws on a Langfuse flush failure, and reports it once to Sentry', async () => {
    mockFlush.mockRejectedValue(new Error('getaddrinfo ENOTFOUND bad.host'))
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})

    const { recordLlmTrace } = await import('@/lib/trace')
    expect(() =>
      recordLlmTrace({ route: 'find_ask', sessionId: 's1', latencyMs: 5, outcome: 'ok' })
    ).not.toThrow()

    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(warn).toHaveBeenCalledTimes(1)
    expect(mockCaptureException).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  it('never throws and sends nothing when the tracer provider cannot start', async () => {
    mockInit.mockReturnValue(false)

    const { recordLlmTrace } = await import('@/lib/trace')
    expect(() =>
      recordLlmTrace({ route: 'find_ask', sessionId: 's1', latencyMs: 5, outcome: 'ok' })
    ).not.toThrow()

    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(mockStartObservation).not.toHaveBeenCalled()
    expect(mockCaptureException).not.toHaveBeenCalled()
  })

  it('is a no-op — never starts the tracer — when LANGFUSE_* keys are unset', async () => {
    delete process.env.LANGFUSE_APP_PUBLIC_KEY
    delete process.env.LANGFUSE_APP_SECRET_KEY

    const { recordLlmTrace } = await import('@/lib/trace')
    recordLlmTrace({ route: 'find_ask', sessionId: 's1', latencyMs: 5, outcome: 'ok' })

    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(mockInit).not.toHaveBeenCalled()
    expect(mockStartObservation).not.toHaveBeenCalled()
  })

  it('sends a trace with the expected shape when Langfuse is configured and healthy', async () => {
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
    expect(mockPropagate).toHaveBeenCalledWith({ traceName: 'find_ask', sessionId: 's1', tags: ['outcome:ok'] })
    expect(mockStartObservation).toHaveBeenCalledTimes(1)
    const [name, rootAttrs] = mockStartObservation.mock.calls[0]
    expect(name).toBe('find_ask')
    expect(rootAttrs.metadata.questionHash).toBe('deadbeef')
    expect(rootAttrs.metadata.retrieval).toEqual([{ dbn: '01M001', score: 0.9, matchedChunkType: 'identity' }])

    const [childName, genAttrs, childOpts] = mockChildObservation.mock.calls[0]
    expect(childName).toBe('completion')
    expect(childOpts).toEqual({ asType: 'generation' })
    expect(genAttrs.model).toBe('claude-sonnet-5')
    expect(genAttrs.usageDetails).toEqual({ input: 100, output: 50 })
    expect(genAttrs.costDetails).toEqual({ total: 0.001 })
    expect(mockChildEnd).toHaveBeenCalledTimes(1)
    expect(mockRootEnd).toHaveBeenCalledTimes(1)
    expect(mockFlush).toHaveBeenCalledTimes(1)
  })

  it('never puts question text on the trace, even when a caller passes it', async () => {
    const { recordLlmTrace } = await import('@/lib/trace')
    recordLlmTrace({
      route: 'find_ask',
      sessionId: 's1',
      latencyMs: 5,
      outcome: 'ok',
      question: 'My child has an IEP, which school fits?',
    } as never)

    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(JSON.stringify(mockStartObservation.mock.calls)).not.toContain('IEP')
    expect(JSON.stringify(mockChildObservation.mock.calls)).not.toContain('IEP')
  })
})
