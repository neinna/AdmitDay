import * as fs from 'fs'
import * as path from 'path'

/**
 * Issue #439: the parent-flow browser test flaked because
 * `page.getByText(/sign in/i)` on /shortlist also matches the header's Clerk
 * `AuthControls` "Sign in" button once Clerk hydrates client-side — a strict
 * mode violation in Playwright. This repo's jest config has no browser/DOM
 * runner (see auth-header.test.ts), so this asserts on the spec's source
 * text the same way the rest of the suite does.
 */

function readSource(relPath: string): string {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf-8')
}

describe('e2e/parent-flow.spec.ts — /shortlist locator cannot match header chrome (issue #439)', () => {
  const spec = readSource('e2e/parent-flow.spec.ts')
  const shortlistClient = readSource('app/shortlist/ShortlistClient.tsx')

  it('asserts on the exact signed-out shortlist copy, not a broad "sign in" regex', () => {
    expect(spec).toContain("getByText('Sign in to see your saved schools.')")
    expect(spec).not.toMatch(/getByText\(\/sign in\/i\)/)
  })

  it('the asserted copy matches what ShortlistClient actually renders when signed out', () => {
    expect(shortlistClient).toContain('Sign in to see your saved schools.')
  })
})
