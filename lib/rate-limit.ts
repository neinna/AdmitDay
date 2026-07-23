/**
 * lib/rate-limit.ts
 *
 * In-memory, per-IP fixed-window rate limiter for the unauthenticated
 * LLM-backed API routes (/api/chat, /api/rationale).
 *
 * NOTE: This is a deliberate stopgap. Vercel lambdas do not share memory,
 * so the limit is per-instance rather than global — it caps runaway loops
 * against a warm instance but is not a hard global cap. The future upgrade
 * is a durable KV-backed limiter (Upstash / Vercel KV), which needs
 * provisioning and secrets we don't add here.
 */

import type { NextRequest } from 'next/server'

export const MAX_REQUESTS = 15
export const WINDOW_MS = 60_000

interface WindowEntry {
  count: number
  windowStart: number
}

const buckets = new Map<string, WindowEntry>()

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

export function checkRateLimit(
  request: NextRequest
): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now()
  pruneExpired(now)

  const ip = getClientIp(request)
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
