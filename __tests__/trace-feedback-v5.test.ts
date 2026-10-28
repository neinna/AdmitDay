/**
 * Issue #531: feedback scores are written through @langfuse/client.
 */

export {}

const mockCreate = jest.fn()
const mockFlush = jest.fn()
const mockCapture = jest.fn()

jest.mock('@langfuse/client', () => ({
  LangfuseClient: jest.fn().mockImplementation(() => ({
    score: {
      create: (...args: unknown[]) => mockCreate(...args),
      flush: (...args: unknown[]) => mockFlush(...args),
    },
  })),
}))

jest.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => mockCapture(...args),
}))

const TRACE_ID = '0123456789abcdef0123456789abcdef'
const ORIGINAL_ENV = { ...process.env }
const settle = () => new Promise((resolve) => setTimeout(resolve, 10))

describe('recordLlmFeedback via @langfuse/client (issue #531)', () => {
  beforeEach(() => {
    jest.resetModules()
    mockCreate.mockReset()
    mockFlush.mockReset()
    mockFlush.mockResolvedValue(undefined)
    mockCapture.mockReset()
    process.env = { ...ORIGINAL_ENV, LANGFUSE_APP_PUBLIC_KEY: 'pk', LANGFUSE_APP_SECRET_KEY: 'sk' }
  })

  afterEach(() => jest.restoreAllMocks())
  afterAll(() => {
    process.env = ORIGINAL_ENV
  })

  it('does not call score.create when keys are unset', async () => {
    delete process.env.LANGFUSE_APP_PUBLIC_KEY
    delete process.env.LANGFUSE_APP_SECRET_KEY
    const { recordLlmFeedback } = await import('@/lib/trace')
    recordLlmFeedback({ traceId: TRACE_ID, rating: 'down' })
    await settle()
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('creates a user_feedback score of 0 for a thumbs-down', async () => {
    const { recordLlmFeedback } = await import('@/lib/trace')
    recordLlmFeedback({ traceId: TRACE_ID, rating: 'down' })
    await settle()
    expect(mockCreate).toHaveBeenCalledTimes(1)
    expect(mockCreate).toHaveBeenCalledWith({ traceId: TRACE_ID, name: 'user_feedback', value: 0 })
    expect(mockFlush).toHaveBeenCalledTimes(1)
  })

  it('never passes an extra event key to score.create', async () => {
    const { recordLlmFeedback } = await import('@/lib/trace')
    recordLlmFeedback({ traceId: TRACE_ID, rating: 'down', question: 'raw text' } as never)
    await settle()
    expect(mockCreate).toHaveBeenCalledWith({ traceId: TRACE_ID, name: 'user_feedback', value: 0 })
  })

  it('warns once and reports to Sentry when score.flush rejects, without throwing', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    mockFlush.mockRejectedValue(new Error('boom'))
    const { recordLlmFeedback } = await import('@/lib/trace')
    expect(() => recordLlmFeedback({ traceId: TRACE_ID, rating: 'up' })).not.toThrow()
    await settle()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith('[trace] langfuse feedback failed:', 'boom')
    expect(mockCapture).toHaveBeenCalledTimes(1)
  })
})
