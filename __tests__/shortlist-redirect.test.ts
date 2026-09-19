/**
 * Issue #283 — /my-schools was renamed to /shortlist. A permanent redirect
 * keeps existing bookmarks and shared links working.
 */

describe('next.config.js redirects /my-schools to /shortlist (issue #283)', () => {
  const config = require('../next.config.js')

  it('exposes a redirects() function', () => {
    expect(typeof config.redirects).toBe('function')
  })

  it('permanently redirects /my-schools to /shortlist', async () => {
    const redirects = await config.redirects()
    const entry = redirects.find((r: { source: string }) => r.source === '/my-schools')

    expect(entry).toBeDefined()
    expect(entry.destination).toBe('/shortlist')
    expect(entry.permanent).toBe(true)
  })
})
