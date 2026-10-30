/**
 * __tests__/ask-reasons.test.ts
 *
 * Issue #328: retrieval was hardcoded to 5, and the model returned a prose
 * answer describing every school plus a summary. That shape can't scale to
 * more schools within the 1500-token budget, so retrieval count moved to a
 * named constant and the model now returns one "DBN | reason" line per
 * school instead. These tests cover the new parsing (lib/ask.ts) directly
 * through answerQuestion() — no test here calls a real model.
 */

const mockCreate = jest.fn()
const mockSearchSchools = jest.fn()

jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  }))
})

jest.mock('@/lib/rag', () => ({
  searchSchools: (...args: unknown[]) => mockSearchSchools(...args),
}))

import { answerQuestion, ASK_RETRIEVAL_COUNT } from '@/lib/ask'

const SCHOOLS = [
  { dbn: '01M001', name: 'Test High School', borough: 'Manhattan', score: 0.9, matchedChunkType: 'identity', chunk: 'Test High School chunk.' },
  { dbn: '02M002', name: 'Second High School', borough: 'Manhattan', score: 0.8, matchedChunkType: 'identity', chunk: 'Second High School chunk.' },
  { dbn: '03M003', name: 'Third High School', borough: 'Brooklyn', score: 0.7, matchedChunkType: 'identity', chunk: 'Third High School chunk.' },
]

function textMessage(text: string) {
  return {
    model: 'claude-sonnet-5',
    stop_reason: 'end_turn',
    usage: { input_tokens: 10, output_tokens: 10 },
    content: [{ type: 'text', text }],
  }
}

beforeEach(() => {
  mockCreate.mockReset()
  mockSearchSchools.mockReset()
  mockSearchSchools.mockResolvedValue(SCHOOLS)
})

describe('ASK_RETRIEVAL_COUNT (issue #328)', () => {
  it('is 20', () => {
    expect(ASK_RETRIEVAL_COUNT).toBe(20)
  })

  it('is what searchSchools is called with', async () => {
    mockCreate.mockResolvedValue(textMessage('01M001 | Small classes.'))
    await answerQuestion({ question: 'Which schools have small classes?' })
    expect(mockSearchSchools).toHaveBeenCalledWith(
      'Which schools have small classes?',
      20,
      {}
    )
  })
})

describe('parsing "DBN | reason" lines (issue #328)', () => {
  it('parses a well-formed multi-line response into one reasons entry per school, in order', async () => {
    mockCreate.mockResolvedValue(
      textMessage(
        [
          '01M001 | Offers small discussion-based classes.',
          '02M002 | Strong robotics program with 3 teams.',
          '03M003 | Located in Brooklyn near public transit.',
        ].join('\n')
      )
    )
    const result = await answerQuestion({ question: 'Which schools fit us?' })

    expect(result.reasons).toEqual([
      { dbn: '01M001', reason: 'Offers small discussion-based classes.' },
      { dbn: '02M002', reason: 'Strong robotics program with 3 teams.' },
      { dbn: '03M003', reason: 'Located in Brooklyn near public transit.' },
    ])
    expect(result.guardrail).toBe('none')
    expect(result.answer).toContain('Test High School — Offers small discussion-based classes.')
    expect(result.answer).toContain('Second High School — Strong robotics program with 3 teams.')
    expect(result.answer).toContain('Third High School — Located in Brooklyn near public transit.')
  })

  it('drops a line with no " | " separator and a line whose DBN is not retrieved, without throwing', async () => {
    mockCreate.mockResolvedValue(
      textMessage(
        [
          '01M001 | Offers small discussion-based classes.',
          'this line has no separator at all',
          '99X999 | A school we never retrieved.',
          '02M002 | Strong robotics program.',
        ].join('\n')
      )
    )
    const result = await answerQuestion({ question: 'Which schools fit us?' })

    expect(result.reasons).toEqual([
      { dbn: '01M001', reason: 'Offers small discussion-based classes.' },
      { dbn: '02M002', reason: 'Strong robotics program.' },
    ])
  })
})

describe('no fallback to raw model output (issue #328)', () => {
  it('returns an empty joined answer, not the raw text, when no line parses', async () => {
    mockCreate.mockResolvedValue(textMessage('This is a prose reply with no DBN separators at all.'))
    const result = await answerQuestion({ question: 'Which schools fit us?' })

    expect(result.reasons).toEqual([])
    expect(result.answer).toBe('')
    expect(result.answer).not.toContain('prose reply')
  })
})

describe('guardrails still gate the parsed answer (issue #328)', () => {
  it('returns OFF_TOPIC with empty sources and empty reasons', async () => {
    mockCreate.mockResolvedValue(textMessage('OFF_TOPIC'))
    const result = await answerQuestion({ question: 'What is the capital of France?' })
    expect(result.guardrail).toBe('off_topic')
    expect(result.sources).toEqual([])
    expect(result.reasons).toEqual([])
  })

  it('returns NO_ANSWER with empty reasons when there is no text block', async () => {
    mockCreate.mockResolvedValue({
      model: 'claude-sonnet-5',
      stop_reason: 'max_tokens',
      usage: { input_tokens: 10, output_tokens: 10 },
      content: [{ type: 'thinking', thinking: 'reasoning' }],
    })
    const result = await answerQuestion({ question: 'Which schools fit us?' })
    expect(result.guardrail).toBe('empty')
    expect(result.reasons).toEqual([])
  })

  it('blocks a reason line containing admissions-odds language and returns empty reasons', async () => {
    mockCreate.mockResolvedValue(
      textMessage('01M001 | Given her grades, your chances of getting in are good.')
    )
    const result = await answerQuestion({ question: 'Which schools fit us?' })
    expect(result.guardrail).toBe('blocked')
    expect(result.reasons).toEqual([])
  })

  it('prepends PREDICTION_PREFACE for a prediction-shaped question and keeps the reasons', async () => {
    mockCreate.mockResolvedValue(textMessage('01M001 | Reviews grades and attendance.'))
    const result = await answerQuestion({ question: 'What are my chances of getting into Test High School?' })
    expect(result.guardrail).toBe('prediction_preface')
    expect(result.reasons).toEqual([{ dbn: '01M001', reason: 'Reviews grades and attendance.' }])
  })
})
