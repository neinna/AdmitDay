/**
 * __tests__/find-ask-reasons-response.test.ts
 *
 * Issue #329 (fixing a gap left by #328): lib/ask.ts's answerQuestion()
 * already returns `reasons`, but app/api/find/ask/route.ts destructured only
 * `answer`/`sources`/etc from it and never put `reasons` on the JSON
 * response — so the /find page's row-ranking (which reads
 * `data.reasons`) always saw an empty list. Mocks the Anthropic client —
 * no test here calls a real model.
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
    {
      dbn: '02M002',
      name: 'Other High School',
      borough: 'Manhattan',
      score: 0.8,
      matchedChunkType: 'identity',
      chunk: 'Other High School is a small school in Manhattan.',
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
})

describe('/api/find/ask returns reasons alongside answer/sources (issue #329)', () => {
  it('includes one reason per retrieved school, in model order, on the response body', async () => {
    mockCreate.mockResolvedValue({
      model: 'claude-sonnet-5',
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 10 },
      content: [
        {
          type: 'text',
          text: '01M001 | Small classes and a strong CS track.\n02M002 | Walkable from Sunset Park.',
        },
      ],
    })

    const res = await POST(fakeAskRequest('Strong CS, walkable from Sunset Park', '10.3.0.1'))
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.reasons).toEqual([
      { dbn: '01M001', reason: 'Small classes and a strong CS track.' },
      { dbn: '02M002', reason: 'Walkable from Sunset Park.' },
    ])
  })
})
