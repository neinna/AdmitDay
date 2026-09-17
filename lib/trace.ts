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
 *   LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_HOST
 * If the keys are unset, every export here is a no-op.
 */

import { Langfuse } from "langfuse"

// Hard ceiling on how long a trace write may run before it is abandoned.
// The Langfuse SDK also gets its own (shorter) request timeout below; this
// is belt-and-braces so a wedged fetch can never hold up the caller, since
// nothing on the response path ever awaits this module.
const WATCHDOG_MS = 3000
const REQUEST_TIMEOUT_MS = 2000

export type TraceOutcome = "ok" | "provider_error" | "rate_limited" | "bad_request"

export interface RetrievedSchool {
  dbn: string
  score: number
  matchedChunkType: string
}

export interface LlmTraceEvent {
  route: string
  sessionId: string
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
}

type UnknownRecord = Record<string, unknown>

// Allowlists. This is the privacy guarantee, enforced here and nowhere else.
const EVENT_KEYS = [
  "route",
  "sessionId",
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
] as const

const RETRIEVAL_KEYS = ["dbn", "score", "matchedChunkType"] as const

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

let client: Langfuse | null | undefined

function getClient(): Langfuse | null {
  if (client !== undefined) return client

  const publicKey = process.env.LANGFUSE_PUBLIC_KEY
  const secretKey = process.env.LANGFUSE_SECRET_KEY
  if (!publicKey || !secretKey) {
    client = null
    return client
  }

  try {
    client = new Langfuse({
      publicKey,
      secretKey,
      baseUrl: process.env.LANGFUSE_HOST || undefined,
      requestTimeout: REQUEST_TIMEOUT_MS,
      flushAt: 1,
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

async function sendTrace(langfuse: Langfuse, payload: UnknownRecord): Promise<void> {
  const route = typeof payload.route === "string" ? payload.route : "unknown"
  const sessionId = typeof payload.sessionId === "string" ? payload.sessionId : undefined
  const outcome = typeof payload.outcome === "string" ? payload.outcome : "ok"

  const trace = langfuse.trace({
    name: route,
    sessionId,
    tags: [`outcome:${outcome}`],
    metadata: {
      questionLength: payload.questionLength,
      questionHash: payload.questionHash,
      retrieval: payload.retrieval,
      errorClassification: payload.errorClassification,
    },
  })

  const usage: Record<string, number> = {}
  if (typeof payload.inputTokens === "number") usage.input = payload.inputTokens
  if (typeof payload.outputTokens === "number") usage.output = payload.outputTokens

  trace
    .generation({
      name: "completion",
      model: typeof payload.model === "string" ? payload.model : undefined,
      usage: Object.keys(usage).length > 0 ? usage : undefined,
      costDetails: typeof payload.costUsd === "number" ? { total: payload.costUsd } : undefined,
      metadata: { latencyMs: payload.latencyMs },
      level: outcome === "ok" ? undefined : "ERROR",
      statusMessage: outcome === "ok" ? undefined : outcome,
    })
    .end()

  await langfuse.flushAsync()
}

/**
 * Fire-and-forget: write one Langfuse trace for one product LLM request.
 * Never throws, never returns a promise the caller could accidentally
 * await onto the response path. Unset LANGFUSE_* keys is a supported
 * configuration and simply no-ops.
 */
export function recordLlmTrace(event: LlmTraceEvent): void {
  const langfuse = getClient()
  if (!langfuse) return

  const payload = buildTracePayload(event)
  if (!payload) return

  withTimeout(sendTrace(langfuse, payload), WATCHDOG_MS).catch(() => {
    // Logging only. A bad host, an auth rejection, a timeout, an SDK
    // change — all the same to us: the product request already returned.
  })
}
