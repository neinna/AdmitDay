import { scrubText } from "./scrub-error"

// Frames named `ext:...` come from a runtime's own built-ins (Deno's
// `ext:core/01_core.js`). No parent's browser produces them: an event with
// one comes from a bot or headless scraper loading the page in Deno, and
// says nothing about the app. ADMITDAY-F (getReader of undefined on `/`,
// 2026-10-27) was this.
interface EventLike {
  exception?: {
    values?: { stacktrace?: { frames?: { filename?: string }[] } }[]
  }
}

export function isNonBrowserRuntimeEvent(event: EventLike): boolean {
  return (event.exception?.values ?? []).some((value) =>
    (value.stacktrace?.frames ?? []).some((frame) => frame.filename?.startsWith("ext:"))
  )
}

interface ScrubbableEvent {
  message?: string
  exception?: { values?: { value?: string }[] }
  breadcrumbs?: { message?: string }[]
}

// Redacts credential-like text from every message field of a Sentry event.
export function scrubEvent<T extends ScrubbableEvent>(event: T): T {
  if (typeof event.message === "string") event.message = scrubText(event.message)
  for (const v of event.exception?.values ?? []) {
    if (typeof v.value === "string") v.value = scrubText(v.value)
  }
  for (const b of event.breadcrumbs ?? []) {
    if (typeof b.message === "string") b.message = scrubText(b.message)
  }
  return event
}

const DIGEST_MESSAGE = "Cannot read properties of null (reading 'digest')"

// Server beforeSend: drops the Next.js `digest` false positive, scrubs the rest.
export function serverBeforeSend<T extends ScrubbableEvent>(
  event: T,
  hint?: { originalException?: unknown }
): T | null {
  const err = hint?.originalException
  if (err instanceof TypeError && err.message === DIGEST_MESSAGE) return null
  return scrubEvent(event)
}
