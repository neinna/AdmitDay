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

const mockSearch = jest.fn()
jest.mock('../lib/rag', () => ({
  searchSchools: (...args: unknown[]) => mockSearch(...args),
}))

import { answerQuestion, prepareAskRequest, ASK_RETRIEVAL_COUNT } from '../lib/ask'

beforeEach(() => {
  mockCreate.mockReset()
  mockSearch.mockReset()
  mockSearch.mockResolvedValue(fakeResults)
  mockCreate.mockResolvedValue({
    model: 'claude-sonnet-5',
    stop_reason: 'end_turn',
    usage: { input_tokens: 1, output_tokens: 1 },
    content: [{ type: 'text', text: '{"off_topic":false,"picks":[]}' }],
  })
})

describe('prepareAskRequest (issue #662)', () => {
  it('produces the same request answerQuestion sends', async () => {
    const question = 'Which schools fit my daughter?'
    const filters = { borough: 'Manhattan' } as any

    const { results, request } = await prepareAskRequest(question, filters)
    await answerQuestion({ question, filters })

    expect(results).toEqual(fakeResults)
    expect(mockCreate).toHaveBeenCalledWith(request)
    expect(mockSearch).toHaveBeenCalledWith(question, ASK_RETRIEVAL_COUNT, filters)
  })
})
