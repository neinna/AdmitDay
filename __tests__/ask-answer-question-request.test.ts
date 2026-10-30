/**
 * __tests__/ask-answer-question-request.test.ts
 *
 * Issue #450: answerQuestion() must send exactly the request buildAskRequest
 * builds — that's what lets evals/run-ask-eval.ts's batch path (which calls
 * buildAskRequest directly, then submits it via messages.batches.create)
 * stand in for the synchronous production call without drifting from it.
 */

const mockCreate = jest.fn()

jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  }))
})

jest.mock('@sentry/nextjs', () => ({
  captureException: jest.fn(),
}))

const fakeResults = [
  {
    dbn: '01M001',
    name: 'Test High School',
    borough: 'Manhattan',
    score: 0.87,
    matchedChunkType: 'identity',
    chunk: 'Test High School is a small school in Manhattan.',
  },
]

jest.mock('../lib/rag', () => ({
  searchSchools: jest.fn().mockResolvedValue(fakeResults),
}))

import { answerQuestion, buildAskRequest, buildSchoolContext } from '../lib/ask'

beforeEach(() => {
  mockCreate.mockReset()
  mockCreate.mockResolvedValue({
    model: 'claude-sonnet-5',
    stop_reason: 'end_turn',
    usage: { input_tokens: 10, output_tokens: 10 },
    content: [{ type: 'text', text: '01M001 | Test reason' }],
  })
})

describe('answerQuestion request parity with buildAskRequest (issue #450)', () => {
  it('calls messages.create with exactly buildAskRequest(question, schoolContext)', async () => {
    const question = 'Which schools fit my daughter?'

    await answerQuestion({ question })

    const expectedRequest = buildAskRequest(question, buildSchoolContext(fakeResults as any))
    expect(mockCreate).toHaveBeenCalledTimes(1)
    expect(mockCreate).toHaveBeenCalledWith(expectedRequest)
  })
})
