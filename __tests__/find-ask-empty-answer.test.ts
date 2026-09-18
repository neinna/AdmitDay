/**
 * __tests__/find-ask-empty-answer.test.ts
 *
 * Issue #257: app/api/find/ask/route.ts used to read only
 * message.content[0], so a response whose first block was non-text (e.g.
 * a thinking block, or a longer response split across text blocks) landed
 * as an empty "" answer with sources but no explanation. Mocks the
 * Anthropic client — no test here calls a real model.
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

import { POST } from '@/app/api/find/ask/route'
import { NO_ANSWER } from '@/lib/ask-guardrails'
import { findBannedPhrases } from '@/lib/banned-phrases'

function fakeAskRequest(question: string, ip: string): NextRequest {
  return {
    headers: {
      get: (name: string) => (name.toLowerCase() === 'x-forwarded-for' ? ip : null),
    },
    json: async () => ({ question }),
  } as unknown as NextRequest
}

beforeEach(() => {
  mockCreate.mockReset()
  mockCaptureException.mockReset()
  mockRecordLlmTrace.mockReset()
  jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  ;(console.error as jest.Mock).mockRestore()
})

describe('/api/find/ask reads every text block, not just content[0] (issue #257)', () => {
  it('uses the text block when it follows a thinking block', async () => {
    mockCreate.mockResolvedValue({
      model: 'claude-sonnet-5',
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 10 },
      content: [
        { type: 'thinking', thinking: 'reasoning about the schools' },
        { type: 'text', text: 'Test High School is a great fit.' },
      ],
    })
    const res = await POST(fakeAskRequest('Which schools fit my daughter?', '10.2.0.1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.answer).toBe('Test High School is a great fit.')
    expect(mockRecordLlmTrace).toHaveBeenCalledWith(expect.objectContaining({ guardrail: 'none' }))
  })

  it('joins two text blocks in order', async () => {
    mockCreate.mockResolvedValue({
      model: 'claude-sonnet-5',
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 10 },
      content: [
        { type: 'text', text: 'Test High School is a great fit.' },
        { type: 'text', text: ' It has strong academics.' },
      ],
    })
    const res = await POST(fakeAskRequest('Which schools fit my daughter?', '10.2.0.2'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.answer).toBe('Test High School is a great fit. It has strong academics.')
  })

  it('falls back to NO_ANSWER with sources kept when there are no text blocks, and records why', async () => {
    mockCreate.mockResolvedValue({
      model: 'claude-sonnet-5',
      stop_reason: 'max_tokens',
      usage: { input_tokens: 10, output_tokens: 10 },
      content: [{ type: 'thinking', thinking: 'reasoning about the schools' }],
    })
    const res = await POST(fakeAskRequest('Which schools fit my daughter?', '10.2.0.3'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.answer).toBe(NO_ANSWER)
    expect(body.sources).toHaveLength(1)
    expect(body.sources[0].dbn).toBe(SCHOOL_RESULT.dbn)

    expect(mockRecordLlmTrace).toHaveBeenCalledWith(
      expect.objectContaining({
        guardrail: 'empty',
        stopReason: 'max_tokens',
        contentBlockTypes: ['thinking'],
      })
    )
    const event = mockRecordLlmTrace.mock.calls[0][0]
    expect(event.question).toBeUndefined()
    expect(event.answer).toBeUndefined()

    expect(console.error).toHaveBeenCalled()
    const loggedArgs = (console.error as jest.Mock).mock.calls[0]
    expect(JSON.stringify(loggedArgs)).not.toContain('Which schools fit my daughter?')
  })

  it('NO_ANSWER passes the no-odds banned-phrase check', () => {
    expect(findBannedPhrases(NO_ANSWER)).toEqual([])
  })
})
