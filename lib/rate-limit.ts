/**
 * lib/rate-limit.ts
 *
 * Rate limiting for the unauthenticated LLM-backed API routes
 * (/api/find/ask, /api/rationale): a per-IP fixed-window cap plus a
 * global daily ceiling on LLM calls.
 *
 * Backed by Vercel Postgres (issue #225), which the app already uses for
 * school data (lib/load-schools.ts) — one fewer service to run before
 * launch than a separate Redis store.
 *
 * If the store query throws or takes too long, this falls back to the
 * original in-memory per-instance counter. That fallback is a deliberate
 * floor, not a nice-to-have: Vercel lambdas don't share memory, so on its
 * own it only caps a single warm instance, but it is what keeps a cap in
 * place at all during a store outage. It must never fail open (no limit)
 * or fail fully closed (every request 429s).
 *
 * The global daily ceiling resets at UTC midnight.
 */

import { sql } from '@vercel/postgres'
import type { NextRequest } from 'next/server'

export const MAX_REQUESTS = 15
export const WINDOW_MS = 60_000
const WINDOW_SEC = WINDOW_MS / 1000

const DEFAULT_DAILY_LLM_CEILING = 2000
const parsedCeiling = Number(process.env.DAILY_LLM_CEILING)
export const DAILY_LLM_CEILING =
  Number.isFinite(parsedCeiling) && parsedCeiling > 0
    ? parsedCeiling
    : DEFAULT_DAILY_LLM_CEILING

const STORE_TIMEOUT_MS = 1500

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

function nextUtcMidnightMs(now: number): number {
  const d = new Date(now)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)
}

function secondsUntilUtcMidnight(now: number): number {
  return Math.max(1, Math.ceil((nextUtcMidnightMs(now) - now) / 1000))
}

function checkInMemory(now: number, ip: string): RateLimitResult {
  pruneExpired(now)

  // Per-IP limit first. The daily ceiling exists to cap LLM spend, so it
  // must count requests that reach the LLM — not attempts. Counting rejected
  // attempts let one IP flood past its own limit and exhaust the global
  // ceiling for every family until UTC midnight, while making only
  // MAX_REQUESTS real LLM calls.
  const entry = buckets.get(ip)
  const inWindow = entry !== undefined && now - entry.windowStart < WINDOW_MS
  if (inWindow && entry.count >= MAX_REQUESTS) {
    const retryAfterSec = Math.max(
      1,
      Math.ceil((entry.windowStart + WINDOW_MS - now) / 1000)
    )
    return { ok: false, retryAfterSec }
  }

  const dayKey = utcDateKey(now)
  if (!dailyEntry || dailyEntry.dayKey !== dayKey) {
    dailyEntry = { dayKey, count: 0 }
  }
  if (dailyEntry.count >= DAILY_LLM_CEILING) {
    return { ok: false, retryAfterSec: secondsUntilUtcMidnight(now) }
  }
  dailyEntry.count++

  if (inWindow) {
    entry.count++
  } else {
    buckets.set(ip, { count: 1, windowStart: now })
  }
  return { ok: true }
}

// Create the table once per cold start. The guard promise dedupes concurrent
// calls; on failure it resets so the next request can retry.
let schemaReady: Promise<void> | null = null

function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS rate_limits (
          key        TEXT PRIMARY KEY,
          count      INTEGER NOT NULL,
          expires_at TIMESTAMPTZ NOT NULL
        )
      `
    })().catch((err) => {
      schemaReady = null
      throw err
    })
  }
  return schemaReady
}

interface StoreRow {
  ip_count: number
  ip_expires_at: string
  day_count: number | null
}

/**
 * One round trip: a CTE increments the per-IP row, then conditionally
 * increments the daily row only if the per-IP count is still within the
 * limit — so a request already refused by the per-IP cap never counts
 * toward the daily ceiling.
 */
async function checkFromStore(
  now: number,
  ip: string
): Promise<RateLimitResult> {
  await ensureSchema()

  const ipKey = `ip:${ip}`
  const dayKey = `day:${utcDateKey(now)}`
  const nextUtcMidnight = new Date(nextUtcMidnightMs(now)).toISOString()

  const { rows } = await sql<StoreRow>`
    WITH ip AS (
      INSERT INTO rate_limits (key, count, expires_at)
      VALUES (${ipKey}, 1, now() + make_interval(secs => ${WINDOW_SEC}))
      ON CONFLICT (key) DO UPDATE SET
        count      = CASE WHEN rate_limits.expires_at <= now() THEN 1 ELSE rate_limits.count + 1 END,
        expires_at = CASE WHEN rate_limits.expires_at <= now() THEN EXCLUDED.expires_at ELSE rate_limits.expires_at END
      RETURNING count, expires_at
    ), day AS (
      INSERT INTO rate_limits (key, count, expires_at)
      SELECT ${dayKey}, 1, ${nextUtcMidnight} FROM ip WHERE ip.count <= ${MAX_REQUESTS}
      ON CONFLICT (key) DO UPDATE SET count = rate_limits.count + 1
      RETURNING count
    )
    SELECT ip.count AS ip_count, ip.expires_at AS ip_expires_at, (SELECT count FROM day) AS day_count FROM ip
  `

  const row = rows[0]
  const ipCount = Number(row.ip_count)

  if (ipCount > MAX_REQUESTS) {
    const expiresAtMs = new Date(row.ip_expires_at).getTime()
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((expiresAtMs - now) / 1000)),
    }
  }

  const dayCount = row.day_count === null ? null : Number(row.day_count)
  if (dayCount !== null && dayCount > DAILY_LLM_CEILING) {
    return { ok: false, retryAfterSec: secondsUntilUtcMidnight(now) }
  }

  return { ok: true }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('rate-limit store timeout')), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      }
    )
  })
}

export async function checkRateLimit(
  request: NextRequest
): Promise<RateLimitResult> {
  const now = Date.now()
  const ip = getClientIp(request)

  try {
    return await withTimeout(checkFromStore(now, ip), STORE_TIMEOUT_MS)
  } catch {
    return checkInMemory(now, ip)
  }
}
