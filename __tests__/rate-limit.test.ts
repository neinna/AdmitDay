/**
 * __tests__/rate-limit.test.ts
 *
 * Unit tests for the LLM-route rate limiter (issue #82), extended in
 * issue #197 with a durable per-IP store and a global daily LLM ceiling.
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

// --- issue #197: durable store + global daily ceiling -----------------

/**
 * A minimal fake of Upstash's REST `/pipeline` endpoint, backed by a
 * plain Map so state persists across separately `require`d module
 * instances — simulating a durable store shared by lambdas that don't
 * share memory. Supports just the commands lib/rate-limit.ts sends.
 */
function createFakeRedis() {
  interface Entry {
    value: number
    expiresAt: number | null
  }
  const store = new Map<string, Entry>()

  function getLive(key: string): Entry | undefined {
    const entry = store.get(key)
    if (entry && entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      store.delete(key)
      return undefined
    }
    return entry
  }

  function handle([op, key, ...args]: (string | number)[]): {
    result?: unknown
    error?: string
  } {
    const now = Date.now()
    const k = String(key)
    switch (op) {
      case 'INCR': {
        const entry = getLive(k) ?? { value: 0, expiresAt: null }
        entry.value += 1
        store.set(k, entry)
        return { result: entry.value }
      }
      case 'DECR': {
        const entry = getLive(k) ?? { value: 0, expiresAt: null }
        entry.value -= 1
        store.set(k, entry)
        return { result: entry.value }
      }
      case 'PEXPIRE':
      case 'EXPIRE': {
        const ms = Number(args[0]) * (op === 'EXPIRE' ? 1000 : 1)
        const nx = args[1] === 'NX'
        const entry = getLive(k)
        if (!entry) return { result: 0 }
        if (nx && entry.expiresAt !== null) return { result: 0 }
        entry.expiresAt = now + ms
        return { result: 1 }
      }
      case 'PTTL': {
        const entry = getLive(k)
        if (!entry) return { result: -2 }
        if (entry.expiresAt === null) return { result: -1 }
        return { result: entry.expiresAt - now }
      }
      default:
        return { error: `unsupported command ${op}` }
    }
  }

  const fetchImpl = jest.fn(async (_url: string, init: { body: string }) => {
    const commands = JSON.parse(init.body) as (string | number)[][]
    return { ok: true, json: async () => commands.map(handle) }
  })

  return { fetchImpl, store }
}

/** Re-`require`s the module fresh, simulating a separate warm lambda instance. */
function loadFreshModule(): typeof import('@/lib/rate-limit') {
  jest.resetModules()
  return require('@/lib/rate-limit')
}

describe('checkRateLimit — durable store (issue #197)', () => {
  const originalFetch = global.fetch
  const originalEnv = { ...process.env }

  afterEach(() => {
    global.fetch = originalFetch
    process.env = { ...originalEnv }
  })

  it('shares one counter across two separate module instances backed by the same store', async () => {
    jest.setSystemTime(10_000_000)
    process.env.UPSTASH_REDIS_REST_URL = 'https://fake-redis.example.com'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token'
    const { fetchImpl } = createFakeRedis()
    global.fetch = fetchImpl as unknown as typeof fetch

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

  it('falls back to in-memory limiting and still serves the request when the store is unreachable', async () => {
    jest.setSystemTime(11_000_000)
    process.env.UPSTASH_REDIS_REST_URL = 'https://fake-redis.example.com'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token'
    global.fetch = jest.fn(() =>
      Promise.reject(new Error('network down'))
    ) as unknown as typeof fetch

    const mod = loadFreshModule()
    const req = fakeRequest('8.8.8.8')

    // A KV outage must degrade to the in-memory floor, never to "no limit
    // at all" and never to "everything is a 429".
    expect(await mod.checkRateLimit(req)).toEqual({ ok: true })
  })

  it('still enforces the in-memory cap once the store is unreachable', async () => {
    jest.setSystemTime(12_000_000)
    process.env.UPSTASH_REDIS_REST_URL = 'https://fake-redis.example.com'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token'
    global.fetch = jest.fn(() =>
      Promise.reject(new Error('network down'))
    ) as unknown as typeof fetch

    const mod = loadFreshModule()
    const req = fakeRequest('7.7.7.7')
    for (let i = 0; i < mod.MAX_REQUESTS; i++) {
      await mod.checkRateLimit(req)
    }
    expect((await mod.checkRateLimit(req)).ok).toBe(false)
  })

  it('behaves exactly like the in-memory limiter, without touching the network, when store env vars are unset', async () => {
    jest.setSystemTime(13_000_000)
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
    const fetchSpy = jest.fn()
    global.fetch = fetchSpy as unknown as typeof fetch

    const mod = loadFreshModule()
    const req = fakeRequest('6.6.6.6')
    for (let i = 0; i < mod.MAX_REQUESTS; i++) {
      expect(await mod.checkRateLimit(req)).toEqual({ ok: true })
    }
    expect((await mod.checkRateLimit(req)).ok).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('checkRateLimit — global daily LLM ceiling (issue #197)', () => {
  const originalFetch = global.fetch
  const originalEnv = { ...process.env }

  afterEach(() => {
    global.fetch = originalFetch
    process.env = { ...originalEnv }
  })

  it('trips once the daily ceiling is hit via the durable store, independent of any single IP', async () => {
    jest.setSystemTime(Date.UTC(2026, 8, 18, 12, 0, 0)) // 2026-09-18 noon UTC
    process.env.UPSTASH_REDIS_REST_URL = 'https://fake-redis.example.com'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token'
    process.env.DAILY_LLM_CEILING = '3'
    const { fetchImpl } = createFakeRedis()
    global.fetch = fetchImpl as unknown as typeof fetch

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
    process.env.UPSTASH_REDIS_REST_URL = 'https://fake-redis.example.com'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token'
    process.env.DAILY_LLM_CEILING = '1'
    const { fetchImpl } = createFakeRedis()
    global.fetch = fetchImpl as unknown as typeof fetch

    jest.setSystemTime(Date.UTC(2026, 8, 18, 23, 59, 59))
    const mod = loadFreshModule()

    expect(await mod.checkRateLimit(fakeRequest('5.5.5.5'))).toEqual({ ok: true })
    expect((await mod.checkRateLimit(fakeRequest('5.5.5.6'))).ok).toBe(false)

    jest.setSystemTime(Date.UTC(2026, 8, 19, 0, 0, 1))
    expect(await mod.checkRateLimit(fakeRequest('6.6.6.6'))).toEqual({ ok: true })
  })

  it('also applies to the in-memory fallback when the store is unconfigured', async () => {
    jest.setSystemTime(Date.UTC(2026, 8, 18, 12, 0, 0))
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
    process.env.DAILY_LLM_CEILING = '2'
    global.fetch = jest.fn() as unknown as typeof fetch

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
  const originalFetch = global.fetch
  const originalEnv = { ...process.env }

  afterEach(() => {
    global.fetch = originalFetch
    process.env = { ...originalEnv }
  })

  function reqFrom(ip: string) {
    return {
      headers: { get: (h: string) => (h === 'x-forwarded-for' ? ip : null) },
    } as unknown as import('next/server').NextRequest
  }

  it('in memory: a flood from one IP does not lock out a different IP', async () => {
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
    process.env.DAILY_LLM_CEILING = '20'
    const mod = loadFreshModule()

    let allowed = 0
    for (let i = 0; i < 40; i++) {
      if ((await mod.checkRateLimit(reqFrom('1.1.1.1'))).ok) allowed++
    }
    expect(allowed).toBe(mod.MAX_REQUESTS)
    expect((await mod.checkRateLimit(reqFrom('2.2.2.2'))).ok).toBe(true)
  })

  it('in memory: the ceiling still trips after exactly DAILY_LLM_CEILING allowed calls', async () => {
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
    process.env.DAILY_LLM_CEILING = '3'
    const mod = loadFreshModule()

    for (const ip of ['a', 'b', 'c']) {
      expect((await mod.checkRateLimit(reqFrom(ip))).ok).toBe(true)
    }
    expect((await mod.checkRateLimit(reqFrom('d'))).ok).toBe(false)
  })

  it('durable store: a flood from one IP does not lock out a different IP, and the counter equals real LLM calls', async () => {
    const { fetchImpl, store } = createFakeRedis()
    global.fetch = fetchImpl as unknown as typeof fetch
    process.env.UPSTASH_REDIS_REST_URL = 'https://fake-upstash.example'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'token'
    process.env.DAILY_LLM_CEILING = '20'
    const mod = loadFreshModule()

    let allowed = 0
    for (let i = 0; i < 40; i++) {
      if ((await mod.checkRateLimit(reqFrom('1.1.1.1'))).ok) allowed++
    }
    expect(allowed).toBe(mod.MAX_REQUESTS)
    expect((await mod.checkRateLimit(reqFrom('2.2.2.2'))).ok).toBe(true)

    const dailyKey = Array.from(store.keys()).find((k) => k.startsWith('ratelimit:daily:'))
    expect(dailyKey).toBeDefined()
    expect(store.get(dailyKey!)!.value).toBe(mod.MAX_REQUESTS + 1)
  })
})
