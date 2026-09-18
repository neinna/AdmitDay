/**
 * __tests__/rate-limit.test.ts
 *
 * Unit tests for the LLM-route rate limiter (issue #82), extended in
 * issue #197 with a durable per-IP store and a global daily LLM ceiling,
 * and moved in issue #225 from Upstash Redis to Vercel Postgres.
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

const mockSql = jest.fn()
jest.mock('@vercel/postgres', () => ({
  sql: (...args: unknown[]) => mockSql(...args),
}))

/**
 * A minimal fake of the `rate_limits` Postgres table, driven off the same
 * single-statement query lib/rate-limit.ts sends. Backed by a plain Map so
 * state persists across separately `require`d module instances —
 * simulating a durable store shared by lambdas that don't share memory.
 */
function createFakePostgres() {
  interface Entry {
    count: number
    expiresAt: number
  }
  const store = new Map<string, Entry>()

  function getLive(key: string, now: number): Entry | undefined {
    const entry = store.get(key)
    if (entry && entry.expiresAt <= now) {
      store.delete(key)
      return undefined
    }
    return entry
  }

  const impl = jest.fn((strings: readonly string[], ...values: unknown[]) => {
    const text = strings.join('')
    const now = Date.now()

    if (text.includes('CREATE TABLE')) {
      return Promise.resolve({ rows: [] })
    }

    if (text.includes('WITH ip AS')) {
      const [ipKey, windowSec, dayKey, nextMidnightIso, maxRequests] = values as [
        string,
        number,
        string,
        string,
        number
      ]

      let ipEntry = getLive(ipKey, now)
      if (!ipEntry) {
        ipEntry = { count: 1, expiresAt: now + windowSec * 1000 }
      } else {
        ipEntry.count += 1
      }
      store.set(ipKey, ipEntry)

      let dayCount: number | null = null
      if (ipEntry.count <= maxRequests) {
        let dayEntry = getLive(dayKey, now)
        if (!dayEntry) {
          dayEntry = { count: 1, expiresAt: new Date(nextMidnightIso).getTime() }
        } else {
          dayEntry.count += 1
        }
        store.set(dayKey, dayEntry)
        dayCount = dayEntry.count
      }

      return Promise.resolve({
        rows: [
          {
            ip_count: ipEntry.count,
            ip_expires_at: new Date(ipEntry.expiresAt).toISOString(),
            day_count: dayCount,
          },
        ],
      })
    }

    return Promise.resolve({ rows: [] })
  })

  return { impl, store }
}

/** Re-`require`s the module fresh, simulating a separate warm lambda instance. */
function loadFreshModule(): typeof import('@/lib/rate-limit') {
  jest.resetModules()
  return require('@/lib/rate-limit')
}

beforeEach(() => {
  jest.useFakeTimers()
  mockSql.mockReset()
  const { impl } = createFakePostgres()
  mockSql.mockImplementation(impl)
})

afterEach(() => {
  jest.useRealTimers()
})

describe('checkRateLimit (issue #82)', () => {
  it('allows up to MAX_REQUESTS requests from one IP within the window', async () => {
    jest.setSystemTime(1_000_000)
    const req = fakeRequest('1.2.3.4')
    for (let i = 0; i < MAX_REQUESTS; i++) {
      expect(await checkRateLimit(req)).toEqual({ ok: true })
    }
  })

  it('blocks the request after the limit with a positive retryAfterSec', async () => {
    jest.setSystemTime(2_000_000)
    const req = fakeRequest('2.3.4.5')
    for (let i = 0; i < MAX_REQUESTS; i++) {
      await checkRateLimit(req)
    }
    const result = await checkRateLimit(req)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.retryAfterSec).toBeGreaterThan(0)
      expect(result.retryAfterSec).toBeLessThanOrEqual(WINDOW_MS / 1000)
    }
  })

  it('allows requests again after the window elapses', async () => {
    jest.setSystemTime(3_000_000)
    const req = fakeRequest('3.4.5.6')
    for (let i = 0; i < MAX_REQUESTS; i++) {
      await checkRateLimit(req)
    }
    expect((await checkRateLimit(req)).ok).toBe(false)

    jest.setSystemTime(3_000_000 + WINDOW_MS)
    expect(await checkRateLimit(req)).toEqual({ ok: true })
  })

  it('tracks limits per IP — a different x-forwarded-for is independent', async () => {
    jest.setSystemTime(4_000_000)
    const first = fakeRequest('4.5.6.7')
    for (let i = 0; i < MAX_REQUESTS; i++) {
      await checkRateLimit(first)
    }
    expect((await checkRateLimit(first)).ok).toBe(false)

    const second = fakeRequest('5.6.7.8')
    expect(await checkRateLimit(second)).toEqual({ ok: true })
  })

  it('uses the first entry of a multi-hop x-forwarded-for header', async () => {
    jest.setSystemTime(5_000_000)
    const direct = fakeRequest('6.7.8.9')
    const proxied = fakeRequest('6.7.8.9, 10.0.0.1')
    for (let i = 0; i < MAX_REQUESTS; i++) {
      await checkRateLimit(direct)
    }
    expect((await checkRateLimit(proxied)).ok).toBe(false)
  })

  it('falls back to a shared "unknown" bucket when the header is missing', async () => {
    jest.setSystemTime(6_000_000)
    for (let i = 0; i < MAX_REQUESTS; i++) {
      await checkRateLimit(fakeRequest())
    }
    expect((await checkRateLimit(fakeRequest())).ok).toBe(false)
  })
})

describe('checkRateLimit — durable Postgres store (issue #225)', () => {
  it('shares one counter across two separate module instances backed by the same store', async () => {
    jest.setSystemTime(10_000_000)
    const { impl } = createFakePostgres()
    mockSql.mockImplementation(impl)

    // Two independent module instances simulate two Vercel lambdas that
    // don't share memory but do share the durable store over the network.
    const instanceA = loadFreshModule()
    const instanceB = loadFreshModule()

    const req = fakeRequest('9.9.9.9')
    for (let i = 0; i < MAX_REQUESTS; i++) {
      const target = i % 2 === 0 ? instanceA : instanceB
      expect(await target.checkRateLimit(req)).toEqual({ ok: true })
    }

    // The (MAX_REQUESTS + 1)th request is blocked regardless of which
    // instance sees it — the counter lives in the shared store.
    expect((await instanceA.checkRateLimit(req)).ok).toBe(false)
    expect((await instanceB.checkRateLimit(req)).ok).toBe(false)
  })

  it('falls back to in-memory limiting and still serves the request when the store errors', async () => {
    jest.setSystemTime(11_000_000)
    mockSql.mockRejectedValue(new Error('connection refused'))

    const mod = loadFreshModule()
    const req = fakeRequest('8.8.8.8')

    // A store outage must degrade to the in-memory floor, never to "no
    // limit at all" and never to "everything is a 429".
    expect(await mod.checkRateLimit(req)).toEqual({ ok: true })
  })

  it('still enforces the in-memory cap once the store errors', async () => {
    jest.setSystemTime(12_000_000)
    mockSql.mockRejectedValue(new Error('connection refused'))

    const mod = loadFreshModule()
    const req = fakeRequest('7.7.7.7')
    for (let i = 0; i < mod.MAX_REQUESTS; i++) {
      await mod.checkRateLimit(req)
    }
    expect((await mod.checkRateLimit(req)).ok).toBe(false)
  })

  it('falls back to in-memory when the store does not respond within the timeout', async () => {
    jest.setSystemTime(13_000_000)
    mockSql.mockImplementation(() => new Promise(() => {})) // never resolves

    const mod = loadFreshModule()
    const req = fakeRequest('12.12.12.12')

    const resultPromise = mod.checkRateLimit(req)
    await jest.advanceTimersByTimeAsync(1500)
    expect(await resultPromise).toEqual({ ok: true })
  })
})

describe('checkRateLimit — global daily LLM ceiling (issue #197)', () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('trips once the daily ceiling is hit via the durable store, independent of any single IP', async () => {
    jest.setSystemTime(Date.UTC(2026, 8, 18, 12, 0, 0)) // 2026-09-18 noon UTC
    process.env.DAILY_LLM_CEILING = '3'
    const { impl } = createFakePostgres()
    mockSql.mockImplementation(impl)

    const mod = loadFreshModule()
    expect(mod.DAILY_LLM_CEILING).toBe(3)

    // Three different IPs, each well under the per-IP cap, still trip the
    // shared global ceiling on the 4th call.
    expect(await mod.checkRateLimit(fakeRequest('1.1.1.1'))).toEqual({ ok: true })
    expect(await mod.checkRateLimit(fakeRequest('2.2.2.2'))).toEqual({ ok: true })
    expect(await mod.checkRateLimit(fakeRequest('3.3.3.3'))).toEqual({ ok: true })

    const blocked = await mod.checkRateLimit(fakeRequest('4.4.4.4'))
    expect(blocked.ok).toBe(false)
    if (!blocked.ok) {
      expect(blocked.retryAfterSec).toBeGreaterThan(0)
      // Resets at UTC midnight — at noon UTC that's at most 12 hours away.
      expect(blocked.retryAfterSec).toBeLessThanOrEqual(12 * 60 * 60)
    }
  })

  it('resets at the UTC midnight boundary', async () => {
    process.env.DAILY_LLM_CEILING = '1'
    const { impl } = createFakePostgres()
    mockSql.mockImplementation(impl)

    jest.setSystemTime(Date.UTC(2026, 8, 18, 23, 59, 59))
    const mod = loadFreshModule()

    expect(await mod.checkRateLimit(fakeRequest('5.5.5.5'))).toEqual({ ok: true })
    expect((await mod.checkRateLimit(fakeRequest('5.5.5.6'))).ok).toBe(false)

    jest.setSystemTime(Date.UTC(2026, 8, 19, 0, 0, 1))
    expect(await mod.checkRateLimit(fakeRequest('6.6.6.6'))).toEqual({ ok: true })
  })

  it('also applies to the in-memory fallback when the store errors', async () => {
    jest.setSystemTime(Date.UTC(2026, 8, 18, 12, 0, 0))
    process.env.DAILY_LLM_CEILING = '2'
    mockSql.mockRejectedValue(new Error('connection refused'))

    const mod = loadFreshModule()
    expect(await mod.checkRateLimit(fakeRequest('1.1.1.1'))).toEqual({ ok: true })
    expect(await mod.checkRateLimit(fakeRequest('2.2.2.2'))).toEqual({ ok: true })
    expect((await mod.checkRateLimit(fakeRequest('3.3.3.3'))).ok).toBe(false)
  })
})

// --- A flood from one IP must not exhaust the global ceiling -------------
// Found in review of the #197 PR: requests rejected by the per-IP limit were
// still counted toward the daily ceiling. With a ceiling of 20, one IP firing
// 40 requests got 15 real LLM calls through and still locked out a different
// family's very first request. In production (ceiling 2000) a single burst
// would take the ask box down for everyone until UTC midnight.
describe('checkRateLimit — rejected requests do not consume the daily ceiling', () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  function reqFrom(ip: string) {
    return {
      headers: { get: (h: string) => (h === 'x-forwarded-for' ? ip : null) },
    } as unknown as import('next/server').NextRequest
  }

  it('in memory: a flood from one IP does not lock out a different IP', async () => {
    process.env.DAILY_LLM_CEILING = '20'
    mockSql.mockRejectedValue(new Error('connection refused'))
    const mod = loadFreshModule()

    let allowed = 0
    for (let i = 0; i < 40; i++) {
      if ((await mod.checkRateLimit(reqFrom('1.1.1.1'))).ok) allowed++
    }
    expect(allowed).toBe(mod.MAX_REQUESTS)
    expect((await mod.checkRateLimit(reqFrom('2.2.2.2'))).ok).toBe(true)
  })

  it('in memory: the ceiling still trips after exactly DAILY_LLM_CEILING allowed calls', async () => {
    process.env.DAILY_LLM_CEILING = '3'
    mockSql.mockRejectedValue(new Error('connection refused'))
    const mod = loadFreshModule()

    for (const ip of ['a', 'b', 'c']) {
      expect((await mod.checkRateLimit(reqFrom(ip))).ok).toBe(true)
    }
    expect((await mod.checkRateLimit(reqFrom('d'))).ok).toBe(false)
  })

  it('durable store: a flood from one IP does not lock out a different IP, and the counter equals real LLM calls', async () => {
    process.env.DAILY_LLM_CEILING = '20'
    const { impl, store } = createFakePostgres()
    mockSql.mockImplementation(impl)
    const mod = loadFreshModule()

    let allowed = 0
    for (let i = 0; i < 40; i++) {
      if ((await mod.checkRateLimit(reqFrom('1.1.1.1'))).ok) allowed++
    }
    expect(allowed).toBe(mod.MAX_REQUESTS)
    expect((await mod.checkRateLimit(reqFrom('2.2.2.2'))).ok).toBe(true)

    const dayKey = Array.from(store.keys()).find((k) => k.startsWith('day:'))
    expect(dayKey).toBeDefined()
    expect(store.get(dayKey!)!.count).toBe(mod.MAX_REQUESTS + 1)
  })
})
