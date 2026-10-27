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
