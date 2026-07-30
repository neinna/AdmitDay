/**
 * lib/provider-error.ts
 *
 * Maps upstream LLM provider failures (usage limits, credit exhaustion,
 * rate limits, timeouts, outages, ...) to a small set of plain-language,
 * client-safe responses. The real error (with vendor detail, status
 * codes, request IDs) should always be logged separately to Sentry —
 * this only controls what the client is allowed to see.
 */

export const RATE_LIMIT_MESSAGE =
  "You're sending requests too quickly — please wait a moment and try again."

export const UNAVAILABLE_MESSAGE =
  "The assistant is unavailable right now. The filters and school data still work — please try again shortly."

export const GENERIC_MESSAGE = "Something went wrong. Please try again."

// Vendor language (usage limits, credit balance, quotas, outage wording)
// that should always be treated as "temporarily unavailable" regardless
// of the HTTP status the provider happened to attach to it.
const UNAVAILABLE_PATTERN =
  /usage limit|credit|quota|regain access|overloaded|unavailable|timed? ?out|ETIMEDOUT|ECONNRESET|ECONNREFUSED/i

export interface ClientSafeError {
  status: number
  body: { error: string }
}

/**
 * Classify an unknown error thrown by an upstream provider call into a
 * status + plain-language body that is safe to send to the client.
 * Never include any part of `err` (message, status, response body) in
 * the returned body.
 */
export function classifyProviderError(err: unknown): ClientSafeError {
  const status = typeof (err as any)?.status === "number" ? (err as any).status : undefined
  const message = err instanceof Error ? err.message : String(err)

  if (status === 429) {
    return { status: 429, body: { error: RATE_LIMIT_MESSAGE } }
  }

  if ((status !== undefined && status >= 500) || UNAVAILABLE_PATTERN.test(message)) {
    return { status: 503, body: { error: UNAVAILABLE_MESSAGE } }
  }

  return { status: 500, body: { error: GENERIC_MESSAGE } }
}
