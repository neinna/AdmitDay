/**
 * Issue #557: trace sends run inside after() so Vercel keeps the function
 * alive until the Langfuse flush finishes.
 */
const mockAfter = jest.fn()
const mockFlush = jest.fn()
const mockScoreCreate = jest.fn()
const mockScoreFlush = jest.fn()

jest.mock('next/server', () => ({
  after: (cb: () => unknown) => mockAfter(cb),
}))

jest.mock('@/lib/langfuse-otel', () => ({
  initLangfuseTracing: () => true,
  forceFlushLangfuse: () => mockFlush(),
}))

jest.mock('@langfuse/tracing', () => ({
  propagateAttributes: (_p: unknown, fn: () => unknown) => fn(),
  startObservation: () => ({
    startObservation: () => ({ end: jest.fn() }),
    end: jest.fn(),
  }),
}))

jest.mock('@langfuse/client', () => ({
  LangfuseClient: class {
    score = { create: mockScoreCreate, flush: mockScoreFlush }
  },
}))

jest.mock('@sentry/nextjs', () => ({ captureException: jest.fn() }))

import { recordLlmFeedback, recordLlmTrace } from '@/lib/trace'

const event = { route: 'find_ask', sessionId: 's', latencyMs: 1, outcome: 'ok' as const }

describe('trace after()', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockFlush.mockResolvedValue(undefined)
    mockScoreFlush.mockResolvedValue(undefined)
    process.env.LANGFUSE_APP_PUBLIC_KEY = 'pk'
    process.env.LANGFUSE_APP_SECRET_KEY = 'sk'
  })
  afterEach(() => {
    delete process.env.LANGFUSE_APP_PUBLIC_KEY
    delete process.env.LANGFUSE_APP_SECRET_KEY
  })

  it('hands the send to after(); the callback settles after the flush', async () => {
    recordLlmTrace(event)
    expect(mockAfter).toHaveBeenCalledTimes(1)
    await mockAfter.mock.calls[0][0]()
    expect(mockFlush).toHaveBeenCalled()
  })

  it('does not throw and still sends when after() throws', async () => {
    mockAfter.mockImplementation(() => {
      throw new Error('outside request scope')
    })
    expect(() => recordLlmTrace(event)).not.toThrow()
    await new Promise((r) => setTimeout(r, 0))
    expect(mockFlush).toHaveBeenCalled()
  })

  it('never calls after() when keys are unset', () => {
    delete process.env.LANGFUSE_APP_PUBLIC_KEY
    recordLlmTrace(event)
    expect(mockAfter).not.toHaveBeenCalled()
  })

  it('hands feedback to after()', () => {
    recordLlmFeedback({ traceId: 'a'.repeat(32), rating: 'up' })
    expect(mockAfter).toHaveBeenCalledTimes(1)
  })
})
