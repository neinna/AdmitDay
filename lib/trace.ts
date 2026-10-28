/**
 * lib/trace.ts
 *
 * The only file in the product that talks to Langfuse — same discipline as
 * scripts/langfuse_trace.py for the agent coordinator. Pure observability:
 * a Langfuse outage, a missing key, a slow host, or a malformed event must
 * never fail, slow, or change an LLM request. Callers never `await` this.
 *
 * PRIVACY — load-bearing, do not relax:
 * recordLlmTrace() only ever reads the keys listed in EVENT_KEYS /
 * RETRIEVAL_KEYS off the object it is given, via `pick()`, never a spread.
 * Callers must never pass question/answer/prompt/chunk text — only a
 * length and a truncated hash. See app/api/find/ask/route.ts for how the
 * hash is computed before this module ever sees it.
 *
 * Config (read from the environment):
 *   LANGFUSE_APP_PUBLIC_KEY, LANGFUSE_APP_SECRET_KEY, LANGFUSE_APP_HOST
 * Deliberately distinct names from scripts/langfuse_trace.py's
 * LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY / LANGFUSE_HOST — this is a
 * second Langfuse project (admitday-app), not the agent coordinator's, and
 * a shared name would risk one process's keys silently applying to the
 * other wherever both happen to share an environment (e.g. this repo's own
 * dev/CI shell, which exports the coordinator's keys under those names).
 * If the keys are unset, every export here is a no-op.
 */

import type { LangfuseClient } from "@langfuse/client"
import * as Sentry from "@sentry/nextjs"
import { after } from "next/server"
import { randomBytes } from "crypto"

// Hard ceiling on how long a trace write may run before it is abandoned.
// The send runs inside after(), so this no longer guards the response; it
// only caps how long the function stays alive. A cold start loads the OTel
// SDK on first use.
const WATCHDOG_MS = 10000

// Keep the function alive until the send settles (Vercel freezes it once the
// response is sent). Outside a request scope after() throws: plain
// fire-and-forget, as before.
function keepAlive(work: Promise<void>): void {
  try {
    after(() => work)
  } catch {
    // Outside a request scope (tests, scripts).
  }
}

export type TraceOutcome = "ok" | "provider_error" | "rate_limited" | "bad_request" | "provider_limit"

export interface RetrievedSchool {
  dbn: string
  score: number
  matchedChunkType: string
}

export interface LlmTraceEvent {
  route: string
  sessionId: string
  // Opaque per-request id, set by the caller so the response returned to
  // the client and the Langfuse trace are the same record (issue #195) —
  // never anything user-identifying, and useless for reading data back.
  traceId?: string
  questionLength?: number
  questionHash?: string
  retrieval?: RetrievedSchool[]
  model?: string
  inputTokens?: number
  outputTokens?: number
  latencyMs: number
  costUsd?: number
  outcome: TraceOutcome
  errorClassification?: string
  // Which ask-box guardrail (issue #218) applied to this answer. Never the
  // question or answer text itself — see the privacy note above.
  guardrail?: string
  // Set when the model returned no text block (issue #257) — the stop
  // reason and the content block types, never the answer text itself.
  stopReason?: string
  contentBlockTypes?: string[]
}

export type FeedbackRating = "up" | "down"

export interface LlmFeedbackEvent {
  traceId: string
  rating: FeedbackRating
}

type UnknownRecord = Record<string, unknown>

// Allowlists. This is the privacy guarantee, enforced here and nowhere else.
const EVENT_KEYS = [
  "route",
  "sessionId",
  "traceId",
  "questionLength",
  "questionHash",
  "retrieval",
  "model",
  "inputTokens",
  "outputTokens",
  "latencyMs",
  "costUsd",
  "outcome",
  "errorClassification",
  "guardrail",
  "stopReason",
  "contentBlockTypes",
] as const

const RETRIEVAL_KEYS = ["dbn", "score", "matchedChunkType"] as const

const FEEDBACK_KEYS = ["traceId", "rating"] as const

function pick(src: UnknownRecord, keys: readonly string[]): UnknownRecord {
  const out: UnknownRecord = {}
  for (const key of keys) {
    const value = src[key]
    if (value !== undefined) out[key] = value
  }
  return out
}

/**
 * Normalize an event into exactly what we are willing to send. Exported so
 * the allowlist behavior (unlisted keys, including a raw question/answer
 * added by a future caller, are dropped) can be unit tested directly.
 */
export function buildTracePayload(raw: unknown): UnknownRecord | null {
  if (!raw || typeof raw !== "object") return null

  const picked = pick(raw as UnknownRecord, EVENT_KEYS)

  if (Array.isArray(picked.retrieval)) {
    picked.retrieval = picked.retrieval
      .filter((item): item is UnknownRecord => !!item && typeof item === "object")
      .map((item) => pick(item, RETRIEVAL_KEYS))
  }

  return picked
}

/**
 * Same allowlist discipline as buildTracePayload: only traceId and rating
 * ever leave this module for a feedback write, so a future caller can never
 * leak question/answer text by spreading a richer object in.
 */
export function buildFeedbackPayload(raw: unknown): UnknownRecord | null {
  if (!raw || typeof raw !== "object") return null
  return pick(raw as UnknownRecord, FEEDBACK_KEYS)
}

let client: LangfuseClient | null | undefined

function getClient(): LangfuseClient | null {
  if (client !== undefined) return client

  const publicKey = process.env.LANGFUSE_APP_PUBLIC_KEY
  const secretKey = process.env.LANGFUSE_APP_SECRET_KEY
  if (!publicKey || !secretKey) {
    client = null
    return client
  }

  try {
    // Required lazily, and inside the try: importing this module must
    // never pull in the Langfuse SDK when tracing is unconfigured (the
    // common case), and any failure to load or construct it is just
    // another Langfuse failure to swallow, same as a bad host.
    const { LangfuseClient } = require("@langfuse/client") as typeof import("@langfuse/client")
    client = new LangfuseClient({
      publicKey,
      secretKey,
      baseUrl: process.env.LANGFUSE_APP_HOST || undefined,
    })
  } catch {
    client = null
  }
  return client
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("langfuse trace timed out")), ms)
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

async function sendTrace(payload: UnknownRecord): Promise<void> {
  // Required lazily, like the score client below: importing this module must
  // never load the Langfuse SDK when tracing is unconfigured.
  const { initLangfuseTracing, forceFlushLangfuse } =
    require("./langfuse-otel") as typeof import("./langfuse-otel")
  if (!initLangfuseTracing()) return
  const { propagateAttributes, startObservation } =
    require("@langfuse/tracing") as typeof import("@langfuse/tracing")

  const route = typeof payload.route === "string" ? payload.route : "unknown"
  const sessionId = typeof payload.sessionId === "string" ? payload.sessionId : undefined
  const traceId = typeof payload.traceId === "string" ? payload.traceId : undefined
  const outcome = typeof payload.outcome === "string" ? payload.outcome : "ok"

  const usageDetails: Record<string, number> = {}
  if (typeof payload.inputTokens === "number") usageDetails.input = payload.inputTokens
  if (typeof payload.outputTokens === "number") usageDetails.output = payload.outputTokens

  propagateAttributes({ traceName: route, sessionId, tags: [`outcome:${outcome}`] }, () => {
    // The trace id is the one already returned to the client, so a rating
    // (issue #195) lands on this trace.
    const root = startObservation(
      route,
      {
        metadata: {
          questionLength: payload.questionLength,
          questionHash: payload.questionHash,
          retrieval: payload.retrieval,
          errorClassification: payload.errorClassification,
          guardrail: payload.guardrail,
          stopReason: payload.stopReason,
          contentBlockTypes: payload.contentBlockTypes,
        },
      },
      traceId
        ? { parentSpanContext: { traceId, spanId: randomBytes(8).toString("hex"), traceFlags: 1 } }
        : undefined
    )
    root
      .startObservation(
        "completion",
        {
          model: typeof payload.model === "string" ? payload.model : undefined,
          usageDetails: Object.keys(usageDetails).length > 0 ? usageDetails : undefined,
          costDetails: typeof payload.costUsd === "number" ? { total: payload.costUsd } : undefined,
          metadata: { latencyMs: payload.latencyMs },
          level: outcome === "ok" ? undefined : "ERROR",
          statusMessage: outcome === "ok" ? undefined : outcome,
        },
        { asType: "generation" }
      )
      .end()
    root.end()
  })

  await forceFlushLangfuse()
}

/**
 * Fire-and-forget: write one Langfuse trace for one product LLM request.
 * Never throws, never returns a promise the caller could accidentally
 * await onto the response path. Unset LANGFUSE_* keys is a supported
 * configuration and simply no-ops.
 */
export function recordLlmTrace(event: LlmTraceEvent): void {
  if (!process.env.LANGFUSE_APP_PUBLIC_KEY || !process.env.LANGFUSE_APP_SECRET_KEY) return

  const payload = buildTracePayload(event)
  if (!payload) return

  const work = withTimeout(sendTrace(payload), WATCHDOG_MS).catch((err) => {
    // Never thrown to the caller, never silent: an empty catch here hid a
    // six-day tracing gap (Oct 16-23, 2026). One Sentry issue per failure
    // kind triggers the existing alert email.
    console.warn("[trace] langfuse send failed:", err instanceof Error ? err.message : String(err))
    Sentry.captureException(err)
  })
  keepAlive(work)
}

async function sendFeedback(langfuse: LangfuseClient, payload: UnknownRecord): Promise<void> {
  const traceId = typeof payload.traceId === "string" ? payload.traceId : undefined
  if (!traceId) return

  langfuse.score.create({
    traceId,
    name: "user_feedback",
    value: payload.rating === "up" ? 1 : 0,
  })

  await langfuse.score.flush()
}

/**
 * Fire-and-forget: attach one user rating (issue #195) to the Langfuse
 * trace it belongs to. Same never-throw, never-awaited, no-op-when-
 * unconfigured contract as recordLlmTrace — a failed score write must
 * never surface to the user.
 */
export function recordLlmFeedback(event: LlmFeedbackEvent): void {
  const langfuse = getClient()
  if (!langfuse) return

  const payload = buildFeedbackPayload(event)
  if (!payload) return

  const work = withTimeout(sendFeedback(langfuse, payload), WATCHDOG_MS).catch((err) => {
    // Logging only, same as recordLlmTrace.
    console.warn("[trace] langfuse feedback failed:", err instanceof Error ? err.message : String(err))
    Sentry.captureException(err)
  })
  keepAlive(work)
}
