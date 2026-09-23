import * as fs from 'fs'
import * as path from 'path'

/**
 * __tests__/find-save-failure-handling.test.ts
 *
 * Issue #332 — a failed /api/saved-schools save (a 4xx/5xx response, which
 * `fetch` resolves rather than throws) was rendered exactly like a
 * successful one: the optimistic add stuck, `school_saved` fired anyway,
 * and a failed initial load silently rendered as "nothing saved". This
 * repo's jest config has no jsdom/testing-library (see auth-header.test.ts),
 * so — following that same convention — these are source-text assertions
 * against app/find/FindClient.tsx rather than a rendered interaction test.
 */

function readSource(relPath: string): string {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf-8')
}

const src = readSource('app/find/FindClient.tsx')

describe('toggleAdded checks the response and rolls back on failure (issue #332)', () => {
  it('still calls fetch(\'/api/saved-schools\') for the save/remove request', () => {
    expect(src).toContain("fetch('/api/saved-schools'")
  })

  it('checks res.ok rather than only catching a thrown error', () => {
    expect(src).toContain('ok = res.ok')
    expect(src).toMatch(/if\s*\(!ok\)/)
  })

  it('rolls the optimistic addedDbns update back to its pre-click value on failure', () => {
    const rollbackIdx = src.indexOf('setAddedDbns(previous)')
    expect(rollbackIdx).toBeGreaterThan(-1)
    const ifNotOkIdx = src.indexOf('if (!ok)')
    expect(ifNotOkIdx).toBeGreaterThan(-1)
    expect(rollbackIdx).toBeGreaterThan(ifNotOkIdx)
  })

  it('records a per-row save error on failure and clears it on a later success', () => {
    expect(src).toContain('saveErrorDbns')
    expect(src).toContain('Couldn&rsquo;t save — try again.')
  })

  it('only captures school_saved/school_removed after the failure branch has already returned', () => {
    const ifNotOkIdx = src.indexOf('if (!ok)')
    const returnIdx = src.indexOf('return', ifNotOkIdx)
    const captureIdx = src.indexOf("posthog?.capture(adding ? 'school_saved' : 'school_removed'")
    expect(ifNotOkIdx).toBeGreaterThan(-1)
    expect(returnIdx).toBeGreaterThan(ifNotOkIdx)
    expect(captureIdx).toBeGreaterThan(returnIdx)
  })
})

describe('the initial saved-schools load distinguishes failure from an empty list (issue #332)', () => {
  it('sets a load-failure flag in the catch branch instead of only clearing addedDbns', () => {
    const catchIdx = src.indexOf('.catch(')
    const loadFailedTrueIdx = src.indexOf('setShortlistLoadFailed(true)')
    expect(catchIdx).toBeGreaterThan(-1)
    expect(loadFailedTrueIdx).toBeGreaterThan(catchIdx)
  })

  it('clears the load-failure flag on a successful load', () => {
    expect(src).toContain('setShortlistLoadFailed(false)')
  })

  it('renders a distinct message in the nav instead of presenting an empty shortlist as normal', () => {
    expect(src).toContain('shortlistLoadFailed')
    expect(src).toContain('Couldn&rsquo;t load your shortlist.')
  })
})
