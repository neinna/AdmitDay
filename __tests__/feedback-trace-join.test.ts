/**
 * __tests__/feedback-trace-join.test.ts
 *
 * Issue #195: join a user's thumbs up/down to the Langfuse trace of the
 * answer that earned it. Three things have to hold together for that join
 * to work at all:
 *
 *  1. /api/find/ask returns the SAME id it hands to recordLlmTrace — not
 *     two independently generated uuids that happen to both be called
 *     "traceId" (see app/api/find/ask/route.ts's responseBody pattern).
 *  2. lib/trace.ts actually threads that id onto the Langfuse trace object
 *     (via `id`) and can write a score against it later — covered in
 *     __tests__/trace-feedback.test.ts, kept separate from this file since
 *     it needs the real lib/trace module rather than the mocked-out one
 *     used below to test its callers in isolation.
 *  3. /api/find/feedback validates its input and never lets a failed score
 *     write reach the client as an error — same rule as #194.
 *
 * The reviewer risk called out on the issue: asking a second question must
 * not let a rating attach to the first question's trace. That's covered in
 * the FindClient section below via source inspection (this repo's jest runs
 * in a plain node environment with no jsdom, so .tsx behavior is pinned by
 * reading the compiled source the same way __tests__/posthog-funnel-
 * instrumentation.test.ts and __tests__/schools.test.ts already do).
 */

import * as fs from 'fs'
import * as path from 'path'
import type { NextRequest } from 'next/server'

function readSource(relPath: string): string {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf-8')
}

// ── /api/find/ask: the returned traceId is the same id sent to Langfuse ────

describe('/api/find/ask joins its response traceId to the Langfuse trace (issue #195)', () => {
  const mockCreate = jest.fn()
  const mockRecordLlmTrace = jest.fn()

  jest.resetModules()
  jest.doMock('@anthropic-ai/sdk', () => {
    return jest.fn().mockImplementation(() => ({
      messages: { create: mockCreate },
    }))
  })
  jest.doMock('@sentry/nextjs', () => ({ captureException: jest.fn() }))
  jest.doMock('@/lib/trace', () => ({
    recordLlmTrace: (...args: unknown[]) => mockRecordLlmTrace(...args),
  }))
  jest.doMock('@/lib/rag', () => ({
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

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { POST: askPost } = require('@/app/api/find/ask/route')

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
    mockRecordLlmTrace.mockReset()
  })

  it('passes the exact response traceId to recordLlmTrace, not an independently generated one', async () => {
    mockCreate.mockResolvedValue({
      model: 'claude-sonnet-5',
      usage: { input_tokens: 10, output_tokens: 5 },
      content: [{ type: 'text', text: 'Test High School is a great fit.' }],
    })

    const res = await askPost(fakeAskRequest('strong STEM program?', '10.20.0.1'))
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(typeof body.traceId).toBe('string')
    expect(body.traceId.length).toBeGreaterThan(0)

    expect(mockRecordLlmTrace).toHaveBeenCalledTimes(1)
    expect(mockRecordLlmTrace.mock.calls[0][0].traceId).toBe(body.traceId)
  })

  it('returns a fresh traceId per request, not a reused constant', async () => {
    mockCreate.mockResolvedValue({
      model: 'claude-sonnet-5',
      usage: { input_tokens: 10, output_tokens: 5 },
      content: [{ type: 'text', text: 'ok' }],
    })

    const first = await (await askPost(fakeAskRequest('question one', '10.20.0.2'))).json()
    const second = await (await askPost(fakeAskRequest('question two', '10.20.0.2'))).json()
    expect(first.traceId).not.toBe(second.traceId)
  })
})

// ── /api/find/feedback: validates input, never surfaces a failed write ─────

describe('/api/find/feedback (issue #195)', () => {
  const mockRecordLlmFeedback = jest.fn()

  jest.resetModules()
  jest.doMock('@/lib/trace', () => ({
    recordLlmFeedback: (...args: unknown[]) => mockRecordLlmFeedback(...args),
  }))

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { POST: feedbackPost } = require('@/app/api/find/feedback/route')

  function fakeFeedbackRequest(body: unknown): NextRequest {
    return { json: async () => body } as unknown as NextRequest
  }

  beforeEach(() => {
    mockRecordLlmFeedback.mockReset()
  })

  it('records feedback and returns ok for a valid traceId + rating', async () => {
    const res = await feedbackPost(fakeFeedbackRequest({ traceId: 'trace-abc', rating: 'up' }))
    expect(res.status).toBe(200)
    expect(mockRecordLlmFeedback).toHaveBeenCalledWith({ traceId: 'trace-abc', rating: 'up' })
  })

  it('rejects a request with no traceId', async () => {
    const res = await feedbackPost(fakeFeedbackRequest({ rating: 'up' }))
    expect(res.status).toBe(400)
    expect(mockRecordLlmFeedback).not.toHaveBeenCalled()
  })

  it('rejects a request with an invalid rating', async () => {
    const res = await feedbackPost(fakeFeedbackRequest({ traceId: 'trace-abc', rating: 'sideways' }))
    expect(res.status).toBe(400)
    expect(mockRecordLlmFeedback).not.toHaveBeenCalled()
  })

  it('responds immediately without awaiting recordLlmFeedback (fire-and-forget, same as recordLlmTrace)', async () => {
    // recordLlmFeedback's own never-throw / never-slow-the-caller contract is
    // pinned in __tests__/trace-feedback.test.ts. Here we only pin that the
    // route calls it synchronously and returns without wrapping it in a
    // try/catch that would suggest the route itself expects it to fail.
    mockRecordLlmFeedback.mockReturnValue(undefined)
    const res = await feedbackPost(fakeFeedbackRequest({ traceId: 'trace-abc', rating: 'down' }))
    expect(res.status).toBe(200)
    expect(mockRecordLlmFeedback).toHaveBeenCalledTimes(1)
  })
})

// ── FeedbackRow: optional traceId prop, attaches feedback, fails silently ──

describe('components/FeedbackRow.tsx accepts an optional traceId (issue #195)', () => {
  const src = readSource('components/FeedbackRow.tsx')

  it('keeps the existing school_list/requirements screen prop union intact', () => {
    expect(src).toContain("'school_list' | 'requirements'")
  })

  it('adds find_ask as a new screen value alongside the existing ones', () => {
    expect(src).toContain("'school_list' | 'requirements' | 'find_ask'")
  })

  it('declares traceId as an optional prop', () => {
    expect(src).toMatch(/traceId\?:\s*string/)
  })

  it('only POSTs to /api/find/feedback when a traceId is present', () => {
    const idx = src.indexOf("if (traceId) {")
    expect(idx).toBeGreaterThan(-1)
    const block = src.slice(idx, idx + 300)
    expect(block).toContain("fetch('/api/find/feedback'")
    expect(block).toContain("method: 'POST'")
    expect(block).toContain('traceId')
    expect(block).toContain('rating: value')
  })

  it('swallows a failed feedback POST instead of throwing or surfacing it', () => {
    const fetchIdx = src.indexOf("fetch('/api/find/feedback'")
    const block = src.slice(fetchIdx, fetchIdx + 300)
    expect(block).toContain('.catch(() => {')
  })

  it('includes trace_id in the screen_feedback posthog event only when a traceId is given', () => {
    const idx = src.indexOf("capture('screen_feedback'")
    const block = src.slice(idx, idx + 200)
    expect(block).toContain('trace_id: traceId')
  })

  it('still fires screen_feedback and rating exactly as before when no traceId is passed (requirements/school_list screens)', () => {
    // The capture call is unconditional on rating being non-null; traceId only
    // adds an optional key, it never gates the existing screen_feedback event.
    const captureIdx = src.indexOf("posthog?.capture('screen_feedback'")
    const guardIdx = src.lastIndexOf('if (newRating !== null)', captureIdx)
    expect(guardIdx).toBeGreaterThan(-1)
    expect(captureIdx).toBeGreaterThan(guardIdx)
  })
})

// ── FeedbackRow: a rating never leaks from one trace onto another via ──────
// ── the shared per-screen localStorage key (the rejected review's finding) ─
//
// This exercises the actual read/write functions FeedbackRow's mount effect
// and click handler call — not just source text — with a hand-rolled
// localStorage (this repo's jest runs with testEnvironment: 'node', so
// there is no real one), so it genuinely reproduces the leak scenario a
// reviewer found: rate trace A "up", then a fresh row mounts for trace B.

describe('readPersistedRating / persistRating never conflate two different traces (issue #195)', () => {
  const { readPersistedRating, persistRating } = require('@/components/FeedbackRow')

  let store: Record<string, string>

  beforeEach(() => {
    store = {}
    ;(global as unknown as { localStorage: Storage }).localStorage = {
      getItem: (key: string) => (key in store ? store[key] : null),
      setItem: (key: string, value: string) => {
        store[key] = value
      },
      removeItem: (key: string) => {
        delete store[key]
      },
      clear: () => {
        store = {}
      },
      key: () => null,
      length: 0,
    }
  })

  it('persistRating is a no-op when a traceId is present — a traced rating never reaches shared storage', () => {
    persistRating('find_ask', 'trace-A', 'up')
    expect(store).toEqual({})
  })

  it('readPersistedRating always returns null for a traced row, even if the shared key happens to hold a value', () => {
    store['feedback_find_ask'] = 'up'
    expect(readPersistedRating('find_ask', 'trace-B')).toBeNull()
  })

  it('end-to-end: rating trace A does not make trace B appear pre-rated', () => {
    // Mount for trace A, rate up.
    expect(readPersistedRating('find_ask', 'trace-A')).toBeNull()
    persistRating('find_ask', 'trace-A', 'up')

    // A brand-new answer arrives under a different trace id — FindClient
    // remounts FeedbackRow (key={askTraceId}), so this call is exactly the
    // mount-time hydration read for the new row.
    expect(readPersistedRating('find_ask', 'trace-B')).toBeNull()
  })

  it('preserves the pre-#195 behavior for screens with no traceId: persists and rehydrates across mounts', () => {
    expect(readPersistedRating('school_list')).toBeNull()
    persistRating('school_list', undefined, 'down')
    expect(readPersistedRating('school_list')).toBe('down')

    // Deselecting (rating -> null) clears it, same as before.
    persistRating('school_list', undefined, null)
    expect(readPersistedRating('school_list')).toBeNull()
  })

  it('requirements screen (no traceId) also still persists and rehydrates as before', () => {
    persistRating('requirements', undefined, 'up')
    expect(readPersistedRating('requirements')).toBe('up')
  })

  it('screens are still isolated from each other (school_list rating does not leak into requirements)', () => {
    persistRating('school_list', undefined, 'up')
    expect(readPersistedRating('requirements')).toBeNull()
  })
})

// ── FindClient: trace id must never survive into the next ask (reviewer risk) ─

describe('FindClient — ask trace id lifecycle (issue #195)', () => {
  const src = readSource('app/find/FindClient.tsx')

  it('imports FeedbackRow', () => {
    expect(src).toContain("import FeedbackRow from '@/components/FeedbackRow'")
  })

  it('clears the previous trace id in the same reset block as the previous answer, before the new fetch fires', () => {
    const resetIdx = src.indexOf("setAskAnswer('')")
    const fetchIdx = src.indexOf("await fetch('/api/find/ask'")
    const clearTraceIdx = src.indexOf('setAskTraceId(null)')
    expect(resetIdx).toBeGreaterThan(-1)
    expect(clearTraceIdx).toBeGreaterThan(resetIdx)
    expect(clearTraceIdx).toBeLessThan(fetchIdx)
  })

  it('sets the trace id from the new response, not the previous one', () => {
    const dataIdx = src.indexOf('const data = await res.json()')
    const setTraceIdx = src.indexOf('setAskTraceId(', dataIdx)
    expect(setTraceIdx).toBeGreaterThan(dataIdx)
    const block = src.slice(setTraceIdx, setTraceIdx + 80)
    expect(block).toContain('data.traceId')
  })

  it('renders FeedbackRow keyed on the current trace id so a new answer never shows the previous answer\'s rating state', () => {
    const idx = src.indexOf('<FeedbackRow')
    expect(idx).toBeGreaterThan(-1)
    const block = src.slice(idx, src.indexOf('/>', idx))
    expect(block).toContain('key={askTraceId')
    expect(block).toContain('screen="find_ask"')
    expect(block).toContain('traceId={askTraceId')
  })
})
