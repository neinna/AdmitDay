import {
  exitCodeFor,
  MIN_SCHOOLS,
  EMPTY_STATE_MARKER,
  countSchoolLinks,
  hasEmptyStateBanner,
  judgeChatResponse,
  judgeFindPage,
} from '@/scripts/smoke'

/**
 * Issue #125. These cover the judgement logic only — no network. The runner
 * itself is exercised by `npm run smoke` against a real deployment.
 */

describe('counting schools on a rendered page', () => {
  it('counts distinct school links, not repeated ones', () => {
    const html = '<a href="/school/13K430">a</a><a href="/school/13K430">a</a><a href="/school/02M475">b</a>'
    expect(countSchoolLinks(html)).toBe(2)
  })

  it('returns zero when the page lists nothing', () => {
    expect(countSchoolLinks('<html><body>No schools</body></html>')).toBe(0)
  })
})

describe('the zero-schools incident', () => {
  // Production once returned 200 with an empty list while every test was green.
  const collapsed = `<html>${EMPTY_STATE_MARKER}</html>`

  it('fails a 200 page that lists no schools', () => {
    const results = judgeFindPage(200, collapsed)
    const listed = results.find((r) => r.name === 'GET /find lists schools')!
    expect(listed.severity).not.toBe('ok')
    expect(listed.detail).toMatch(/collapsed/)
  })

  it('fails a 200 page showing the empty-state banner', () => {
    const results = judgeFindPage(200, collapsed)
    expect(results.find((r) => r.name === 'GET /find has no empty-state banner')!.severity).not.toBe('ok')
  })

  it('passes a healthy page', () => {
    const links = Array.from({ length: MIN_SCHOOLS + 20 }, (_, i) => `<a href="/school/X${i}">s</a>`).join('')
    expect(judgeFindPage(200, `<html>${links}</html>`).every((r) => r.severity === 'ok')).toBe(true)
  })

  it('does not check content when the page itself failed', () => {
    expect(judgeFindPage(500, '')).toHaveLength(1)
  })
})

describe('chat health', () => {
  it('treats a clean rate limit as healthy', () => {
    expect(judgeChatResponse(429, 'slow down').severity).toBe('ok')
  })

  it('treats any 5xx as unhealthy', () => {
    expect(judgeChatResponse(500, 'boom').severity).not.toBe('ok')
    expect(judgeChatResponse(500, 'boom').detail).toMatch(/unhandled/)
  })

  it('warns rather than fails on a gracefully handled upstream outage', () => {
    // #128 shipped this copy; a 503 carrying it means the route behaved well
    // even though the assistant is down. Still a failure, different remedy.
    const r = judgeChatResponse(503, 'The assistant is unavailable right now. Please try again shortly.')
    expect(r.severity).not.toBe('ok')
    expect(r.detail).toMatch(/handled gracefully/)
  })

  it('fails a 200 that leaked provider error text', () => {
    // This actually reached a real visitor on 2026-07-30 (see #128).
    const leaked = '400 {"error":{"message":"You have reached your specified API usage limits."}}'
    const r = judgeChatResponse(200, leaked)
    expect(r.severity).not.toBe('ok')
    expect(r.detail).toMatch(/leaked/)
  })

  it('fails a 200 with an empty body', () => {
    expect(judgeChatResponse(200, '   ').severity).not.toBe('ok')
  })

  it('passes a normal grounded answer', () => {
    expect(judgeChatResponse(200, 'Brooklyn Tech offers a strong music program.').severity).toBe('ok')
  })
})


describe('exit status — issue #149', () => {
  // The distinction that matters: "we broke the deploy" vs "the provider is down".
  it('exits zero when the only problem is a handled provider outage', () => {
    const results = [
      { name: 'GET /', severity: 'ok' as const, detail: '' },
      judgeChatResponse(503, 'The assistant is unavailable right now. Please try again shortly.'),
    ]
    expect(results[1].severity).toBe('warn')
    expect(exitCodeFor(results)).toBe(0)
  })

  it('exits non-zero on an unhandled server error', () => {
    expect(exitCodeFor([judgeChatResponse(500, 'boom')])).toBe(1)
  })

  it('exits non-zero when the school list has collapsed', () => {
    expect(exitCodeFor(judgeFindPage(200, '<html>nothing</html>'))).toBe(1)
  })

  it('exits non-zero when a 200 leaked provider error text', () => {
    expect(exitCodeFor([judgeChatResponse(200, 'You have reached your specified API usage limits')])).toBe(1)
  })

  it('a failure still exits non-zero even alongside warnings', () => {
    expect(
      exitCodeFor([
        judgeChatResponse(503, 'The assistant is unavailable right now.'),
        { name: 'GET /', severity: 'fail' as const, detail: 'HTTP 500' },
      ])
    ).toBe(1)
  })
})
