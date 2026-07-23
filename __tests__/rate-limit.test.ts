/**
 * __tests__/rate-limit.test.ts
 *
 * Unit tests for the in-memory per-IP rate limiter (issue #82).
 * Uses fake timers so window resets need no real waiting, and a minimal
 * fake NextRequest (headers.get shim) — no real server.
 */

import type { NextRequest } from 'next/server'
import { checkRateLimit, MAX_REQUESTS, WINDOW_MS } from '@/lib/rate-limit'

function fakeRequest(ip?: string): NextRequest {
  return {
    headers: {
      get: (name: string) =>
        name.toLowerCase() === 'x-forwarded-for' && ip ? ip : null,
    },
  } as unknown as NextRequest
}

beforeEach(() => {
  jest.useFakeTimers()
})

afterEach(() => {
  jest.useRealTimers()
})

describe('checkRateLimit (issue #82)', () => {
  it('allows up to MAX_REQUESTS requests from one IP within the window', () => {
    jest.setSystemTime(1_000_000)
    const req = fakeRequest('1.2.3.4')
    for (let i = 0; i < MAX_REQUESTS; i++) {
      expect(checkRateLimit(req)).toEqual({ ok: true })
    }
  })

  it('blocks the request after the limit with a positive retryAfterSec', () => {
    jest.setSystemTime(2_000_000)
    const req = fakeRequest('2.3.4.5')
    for (let i = 0; i < MAX_REQUESTS; i++) {
      checkRateLimit(req)
    }
    const result = checkRateLimit(req)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.retryAfterSec).toBeGreaterThan(0)
      expect(result.retryAfterSec).toBeLessThanOrEqual(WINDOW_MS / 1000)
    }
  })

  it('allows requests again after the window elapses', () => {
    jest.setSystemTime(3_000_000)
    const req = fakeRequest('3.4.5.6')
    for (let i = 0; i < MAX_REQUESTS; i++) {
      checkRateLimit(req)
    }
    expect(checkRateLimit(req).ok).toBe(false)

    jest.setSystemTime(3_000_000 + WINDOW_MS)
    expect(checkRateLimit(req)).toEqual({ ok: true })
  })

  it('tracks limits per IP — a different x-forwarded-for is independent', () => {
    jest.setSystemTime(4_000_000)
    const first = fakeRequest('4.5.6.7')
    for (let i = 0; i < MAX_REQUESTS; i++) {
      checkRateLimit(first)
    }
    expect(checkRateLimit(first).ok).toBe(false)

    const second = fakeRequest('5.6.7.8')
    expect(checkRateLimit(second)).toEqual({ ok: true })
  })

  it('uses the first entry of a multi-hop x-forwarded-for header', () => {
    jest.setSystemTime(5_000_000)
    const direct = fakeRequest('6.7.8.9')
    const proxied = fakeRequest('6.7.8.9, 10.0.0.1')
    for (let i = 0; i < MAX_REQUESTS; i++) {
      checkRateLimit(direct)
    }
    expect(checkRateLimit(proxied).ok).toBe(false)
  })

  it('falls back to a shared "unknown" bucket when the header is missing', () => {
    jest.setSystemTime(6_000_000)
    for (let i = 0; i < MAX_REQUESTS; i++) {
      checkRateLimit(fakeRequest())
    }
    expect(checkRateLimit(fakeRequest()).ok).toBe(false)
  })
})
