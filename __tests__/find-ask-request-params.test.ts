/**
 * __tests__/find-ask-request-params.test.ts
 *
 * Issue #308: claude-sonnet-5's adaptive thinking is on by default and
 * thinking tokens count against max_tokens, so a 600-token budget could be
 * entirely consumed by thinking before any answer text was produced,
 * tripping the #257 empty-answer fallback (see find-ask-empty-answer.test.ts,
 * case 'falls back to NO_ANSWER ... stopReason: max_tokens'). Asserts the
 * request lib/ask.ts sends caps thinking effort and raises max_tokens.
 */

import type { NextRequest } from 'next/server'

const mockCreate = jest.fn()

jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  }))
})

jest.mock('@sentry/nextjs', () => ({
  captureException: jest.fn(),
}))

jest.mock('@/lib/trace', () => ({
  recordLlmTrace: jest.fn(),
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

import { POST } from '@/app/api/find/ask/route'

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
  mockCreate.mockResolvedValue({
    model: 'claude-sonnet-5',
    stop_reason: 'end_turn',
    usage: { input_tokens: 10, output_tokens: 10 },
    content: [{ type: 'text', text: 'Test High School is a great fit.' }],
  })
})

describe('ask request params cap thinking effort (issue #308)', () => {
  it('sends output_config.effort=low and a 1500 max_tokens budget', async () => {
    await POST(fakeAskRequest('Which schools fit my daughter?', '10.3.0.1'))

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-sonnet-5',
        max_tokens: 1500,
        output_config: { effort: 'low' },
      })
    )
  })
})
