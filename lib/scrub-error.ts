// Replaces credential-like text in error messages with [redacted] before it
// is logged or sent to Sentry (ADMITDAY-H: a provider SDK error carried part
// of an API key).
const REDACTED = "[redacted]"

const PATTERNS: RegExp[] = [
  // OpenAI / Anthropic style keys: sk-..., sk-proj-..., sk-ant-...
  /\bsk-[A-Za-z0-9_-]{8,}/g,
  /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
  // Masked keys such as sk-****abcd or ********
  /[A-Za-z0-9_-]*\*{4,}[A-Za-z0-9_*-]*/g,
  // Long base64/hex runs
  /[A-Za-z0-9+/_-]{20,}={0,2}/g,
]

export function scrubText(text: string): string {
  return PATTERNS.reduce((out, re) => out.replace(re, REDACTED), text)
}

/** Safe copy of a message: strings are scrubbed, anything else becomes a string. */
export function scrubMessage(input: unknown): string {
  if (input === undefined || input === null) return ""
  if (typeof input === "string") return scrubText(input)
  if (input instanceof Error) return scrubText(input.message)
  try {
    return scrubText(String(input))
  } catch {
    return ""
  }
}

/**
 * Scrubs an Error in place so its type and stack frames stay intact; only the
 * message text (and the copy of it at the top of the stack) changes.
 * Non-Error values are returned as a scrubbed string.
 */
export function scrubError<T>(err: T): T | string {
  if (!(err instanceof Error)) {
    return err === undefined || err === null ? err : scrubMessage(err)
  }
  const original = err.message
  const clean = scrubText(original)
  if (clean !== original) {
    err.message = clean
    if (typeof err.stack === "string") err.stack = err.stack.replace(original, clean)
  }
  return err
}
