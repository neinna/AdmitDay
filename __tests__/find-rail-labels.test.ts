/**
 * __tests__/find-rail-labels.test.ts
 *
 * Issue #395 — /find rail labels name the thing a parent is choosing, not the
 * mechanism: "Starting from" becomes "Location" and "Within" becomes
 * "Distance". The aria-label on the input is updated to match the visible
 * "Location" label while the placeholder text is unchanged.
 *
 * This repo's jest config runs under plain node with no jsdom (see
 * find-ask-textarea.test.ts's convention), so FindRail's rendering is covered
 * with source-text assertions.
 */

import * as fs from 'fs'
import * as path from 'path'

function readSource(relPath: string): string {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf-8')
}

describe('FindRail labels (issue #395)', () => {
  const src = readSource('app/find/FindRail.tsx')

  it('labels the starting-point field "Location", not "Starting from"', () => {
    expect(src).toContain('>Location</div>')
    expect(src).not.toContain('Starting from')
  })

  it('labels the radius control "Distance", not "Within"', () => {
    expect(src).toContain('>Distance</div>')
    expect(src).not.toContain('>Within<')
  })

  it('keeps the ZIP/station placeholder and matches the aria-label to the new label', () => {
    expect(src).toContain('placeholder="ZIP code or subway station"')
    expect(src).toContain('aria-label="Location: ZIP code or subway station"')
  })
})
