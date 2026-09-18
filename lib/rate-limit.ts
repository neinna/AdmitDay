/**
 * lib/rate-limit.ts
 *
 * Rate limiting for the unauthenticated LLM-backed API routes
 * (/api/find/ask, /api/rationale): a per-IP fixed-window cap plus a
 * global daily ceiling on LLM calls.
 *
 * Backed by Upstash Redis over its REST API (issue #197). We use the
 * REST API directly with `fetch` rather than the `@upstash/redis` SDK —
 * per this repo's issue-sizing rules a new npm dependency is its own
 * ticket, and the REST API's `/pipeline` endpoint already batches every
 * command this module needs into a single HTTP round trip. Upstash was
 * chosen over Vercel KV because Vercel KV is itself a rebrand of the
 * same Upstash-hosted Redis — talking to Upstash directly avoids an
 * extra layer with no functional difference.
 *
 * If UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are unset, or the
 * store doesn't answer, this falls back to the original in-memory
 * per-instance counter. That fallback is a deliberate floor, not a nice
 *-to-have: Vercel lambdas don't share memory, so on its own it only caps
 * a single warm instance, but it is what keeps a cap in place at all
 * during a store outage. It must never fail open (no limit) or fail
 * fully closed (every request 429s).
 *
 * The global daily ceiling resets at UTC midnight.
 */

import type { NextRequest } from 'next/server'

export const MAX_REQUESTS = 15
export const WINDOW_MS = 60_000

const DEFAULT_DAILY_LLM_CEILING = 2000
const parsedCeiling = Number(process.env.DAILY_LLM_CEILING)
export const DAILY_LLM_CEILING =
  Number.isFinite(parsedCeiling) && parsedCeiling > 0
    ? parsedCeiling
    : DEFAULT_DAILY_LLM_CEILING

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN
const REDIS_TIMEOUT_MS = 1500

type RateLimitResult = { ok: true } | { ok: false; retryAfterSec: number }

interface WindowEntry {
  count: number
  windowStart: number
}

interface DailyEntry {
  dayKey: string
  count: number
}

// In-memory fallback state (per warm instance — see module doc above).
const buckets = new Map<string, WindowEntry>()
let dailyEntry: DailyEntry | null = null

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  )
}

/** Drop entries whose window has already elapsed so the Map stays bounded. */
function pruneExpired(now: number): void {
  buckets.forEach((entry, ip) => {
    if (now - entry.windowStart >= WINDOW_MS) {
      buckets.delete(ip)
    }
  })
}

function utcDateKey(now: number): string {
  return new Date(now).toISOString().slice(0, 10)
}

function secondsUntilUtcMidnight(now: number): number {
  const d = new Date(now)
  const nextMidnight = Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate() + 1
  )
  return Math.max(1, Math.ceil((nextMidnight - now) / 1000))
}

function isStoreConfigured(): boolean {
  return Boolean(REDIS_URL && REDIS_TOKEN)
}

interface RedisCommandResult {
  result?: unknown
  error?: string
}

/**
 * Sends every command in one `/pipeline` POST — one HTTP round trip
 * regardless of how many commands are batched in. Returns null (never
 * throws) on any failure so callers can fall back to the in-memory
 * limiter instead of treating a store outage as a hard error.
 */
async function redisPipeline(
  commands: (string | number)[][]
): Promise<RedisCommandResult[] | null> {
  if (!REDIS_URL || !REDIS_TOKEN) return null

  try {
    const res = await fetch(`${REDIS_URL}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${REDIS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(commands),
      signal: AbortSignal.timeout(REDIS_TIMEOUT_MS),
    })
    if (!res.ok) return null

    const data = (await res.json()) as unknown
    if (!Array.isArray(data) || data.some((entry) => entry?.error)) {
      return null
    }
    return data as RedisCommandResult[]
  } catch {
    return null
  }
}

function checkInMemory(now: number, ip: string): RateLimitResult {
  pruneExpired(now)

  const dayKey = utcDateKey(now)
  if (!dailyEntry || dailyEntry.dayKey !== dayKey) {
    dailyEntry = { dayKey, count: 0 }
  }
  dailyEntry.count++
  if (dailyEntry.count > DAILY_LLM_CEILING) {
    return { ok: false, retryAfterSec: secondsUntilUtcMidnight(now) }
  }

  const entry = buckets.get(ip)
  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    buckets.set(ip, { count: 1, windowStart: now })
    return { ok: true }
  }

  if (entry.count < MAX_REQUESTS) {
    entry.count++
    return { ok: true }
  }

  const retryAfterSec = Math.max(
    1,
    Math.ceil((entry.windowStart + WINDOW_MS - now) / 1000)
  )
  return { ok: false, retryAfterSec }
}

function checkFromPipeline(
  results: RedisCommandResult[],
  now: number
): RateLimitResult | null {
  const [ipIncrRes, , ipTtlRes, dailyIncrRes] = results
  const ipCount = Number(ipIncrRes?.result)
  const dailyCount = Number(dailyIncrRes?.result)
  if (!Number.isFinite(ipCount) || !Number.isFinite(dailyCount)) {
    return null
  }

  if (dailyCount > DAILY_LLM_CEILING) {
    return { ok: false, retryAfterSec: secondsUntilUtcMidnight(now) }
  }

  if (ipCount > MAX_REQUESTS) {
    const ipTtlMs = Number(ipTtlRes?.result)
    const remainingMs = ipTtlMs > 0 ? ipTtlMs : WINDOW_MS
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil(remainingMs / 1000)) }
  }

  return { ok: true }
}

export async function checkRateLimit(
  request: NextRequest
): Promise<RateLimitResult> {
  const now = Date.now()
  const ip = getClientIp(request)

  if (!isStoreConfigured()) {
    return checkInMemory(now, ip)
  }

  const ipKey = `ratelimit:ip:${ip}`
  const dailyKey = `ratelimit:daily:${utcDateKey(now)}`

  const results = await redisPipeline([
    ['INCR', ipKey],
    ['PEXPIRE', ipKey, String(WINDOW_MS), 'NX'],
    ['PTTL', ipKey],
    ['INCR', dailyKey],
    ['EXPIRE', dailyKey, String(secondsUntilUtcMidnight(now)), 'NX'],
  ])

  if (!results) {
    return checkInMemory(now, ip)
  }

  const outcome = checkFromPipeline(results, now)
  return outcome ?? checkInMemory(now, ip)
}
