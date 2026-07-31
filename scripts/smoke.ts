/**
 * Production smoke tests — issue #125.
 *
 * Unit tests run against code. They cannot tell us the *deployed site* works.
 * That is not hypothetical: production /list once served zero schools while the
 * whole suite was green, because the failure was in the deployed environment,
 * not the code. And on 2026-07-30 /school/[dbn] shipped a 500 on every school
 * after passing tests and an independent review. Both were found by a human
 * looking at the site.
 *
 * This checks outcomes on the real thing.
 *
 *   npm run smoke                      # against production
 *   SMOKE_BASE_URL=https://… npm run smoke
 *
 * Exits non-zero on the first failure, naming which check failed and why.
 */

export const DEFAULT_BASE_URL = 'https://www.admitday.com'

/**
 * `/find` server-renders a capped first page (the design caps the initial
 * render) and reveals the rest client-side, so this is not the full 457. What
 * we're catching is a list that has *collapsed* — the zero-schools incident —
 * not a page that paginates.
 */
export const MIN_SCHOOLS = 10

/** Rendered when the DB read fails. Its presence means the page "works" but is empty. */
export const EMPTY_STATE_MARKER = 'School data not yet loaded on the server'

/**
 * Issue #149. Three levels, not a boolean, because two different things were
 * being conflated:
 *
 *   fail — a deploy regression. Someone must change code. Exits non-zero.
 *   warn — an external condition no code change would fix (the provider is down
 *          or out of credit, and the route handled it correctly). Visible, but
 *          the run stays green: a recurring alert for a known billing state is
 *          the alert noise this project keeps removing.
 *   ok   — healthy.
 */
export type Severity = 'ok' | 'warn' | 'fail'

export type CheckResult = {
  name: string
  severity: Severity
  detail: string
}

/** The run fails only on `fail`. Warnings are reported, not escalated. */
export function exitCodeFor(results: CheckResult[]): number {
  return results.some((r) => r.severity === 'fail') ? 1 : 0
}

/**
 * Counts school links on a rendered page. Deliberately structural rather than
 * text-based: a page can render fine and still list nothing, which is exactly
 * the zero-schools incident.
 */
export function countSchoolLinks(html: string): number {
  const matches = html.match(/\/school\/[A-Za-z0-9]+/g)
  if (!matches) return 0
  return new Set(matches).size
}

export function hasEmptyStateBanner(html: string): boolean {
  return html.includes(EMPTY_STATE_MARKER)
}

/** Chat is healthy if it answers or cleanly rate-limits. A 5xx is never healthy. */
export function judgeChatResponse(status: number, body: string): CheckResult {
  if (status === 429) {
    return { name: 'POST /api/chat', severity: 'ok', detail: '429 rate-limited (expected under load)' }
  }
  if (status >= 500) {
    // A 503 carrying the product's own copy means the route handled an upstream
    // outage correctly (#128). Still a failure — the assistant is down and we
    // want to know — but the detail must not read like a crash, because the
    // remedy is completely different.
    const graceful = /assistant is unavailable|try again shortly/i.test(body)
    return {
      name: 'POST /api/chat',
      // Handled outage: the route did its job, the provider is down. Warn.
      // Unhandled 5xx: that is ours to fix. Fail.
      severity: graceful ? 'warn' : 'fail',
      detail: graceful
        ? `HTTP ${status} — assistant unavailable, handled gracefully (upstream/provider is down, not a code fault)`
        : `HTTP ${status} — unhandled server error`,
    }
  }
  if (status !== 200) {
    return { name: 'POST /api/chat', severity: 'fail', detail: `HTTP ${status}` }
  }
  // A 200 that leaked provider error text is a failure even though it is a 200.
  if (/usage limit|credit balance|quota|request_id|anthropic/i.test(body)) {
    return { name: 'POST /api/chat', severity: 'fail', detail: '200 but the body leaked provider error text' }
  }
  if (body.trim().length === 0) {
    return { name: 'POST /api/chat', severity: 'fail', detail: '200 with an empty body' }
  }
  return { name: 'POST /api/chat', severity: 'ok', detail: `HTTP 200, ${body.length} bytes` }
}

export function judgeFindPage(status: number, html: string): CheckResult[] {
  const results: CheckResult[] = []
  results.push({
    name: 'GET /find',
    severity: status === 200 ? 'ok' : 'fail',
    detail: `HTTP ${status}`,
  })
  if (status !== 200) return results

  const count = countSchoolLinks(html)
  results.push({
    name: 'GET /find lists schools',
    severity: count >= MIN_SCHOOLS ? 'ok' : 'fail',
    detail:
      count >= MIN_SCHOOLS
        ? `${count} schools linked`
        : `only ${count} schools linked, expected at least ${MIN_SCHOOLS} — the list has collapsed`,
  })
  results.push({
    name: 'GET /find has no empty-state banner',
    severity: hasEmptyStateBanner(html) ? 'fail' : 'ok',
    detail: hasEmptyStateBanner(html)
      ? `page rendered but shows "${EMPTY_STATE_MARKER}"`
      : 'no empty-state banner',
  })
  return results
}

/* c8 ignore start — the runner below performs network I/O and is not unit-tested. */

async function run(): Promise<void> {
  const base = (process.env.SMOKE_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '')
  const results: CheckResult[] = []
  console.log(`Smoke testing ${base}\n`)

  const home = await fetch(`${base}/`, { redirect: 'follow' })
  results.push({
    name: 'GET /',
    severity: home.status === 200 ? 'ok' : 'fail',
    detail: `HTTP ${home.status}`,
  })

  const find = await fetch(`${base}/find`, { redirect: 'follow' })
  results.push(...judgeFindPage(find.status, await find.text()))

  const chat = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: 'Which Brooklyn schools have a strong music program?' }),
  })
  results.push(judgeChatResponse(chat.status, await chat.text()))

  const LABEL: Record<Severity, string> = { ok: '  ok  ', warn: '  WARN', fail: '  FAIL' }
  for (const r of results) {
    console.log(`${LABEL[r.severity]}  ${r.name.padEnd(38)} ${r.detail}`)
  }

  const failed = results.filter((r) => r.severity === 'fail')
  const warned = results.filter((r) => r.severity === 'warn')

  // A run with warnings must not read like a clean run.
  if (failed.length > 0) {
    console.error(`\n${failed.length} check(s) FAILED against ${base}.`)
    if (warned.length > 0) console.error(`${warned.length} warning(s) alongside.`)
  } else if (warned.length > 0) {
    console.log(`\nPassed with ${warned.length} warning(s) against ${base} — degraded, not broken.`)
  } else {
    console.log(`\nAll ${results.length} checks passed.`)
  }
  process.exit(exitCodeFor(results))
}

if (require.main === module) {
  run().catch((err) => {
    console.error('Smoke run could not complete:', err?.message ?? err)
    process.exit(1)
  })
}

/* c8 ignore stop */
