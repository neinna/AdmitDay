/**
 * __tests__/find-rail-non-negotiables-heading.test.ts
 *
 * Issue #402 — /find rail: add a "Non-Negotiables" heading above the filters,
 * so a parent can tell the rail (hard floor) apart from the ask box
 * (personal detail). Styled as the page's section heading, Title Case, above
 * the Location field. No filter behaviour changes.
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

describe('FindRail heading (issue #402)', () => {
  const src = readSource('app/find/FindRail.tsx')

  it('renders a "Non-Negotiables" heading', () => {
    expect(src).toContain('Non-Negotiables')
  })

  it('places the heading above the Location field', () => {
    const headingIndex = src.indexOf('Non-Negotiables')
    const locationIndex = src.indexOf('>Location</div>')
    expect(headingIndex).toBeGreaterThan(-1)
    expect(locationIndex).toBeGreaterThan(-1)
    expect(headingIndex).toBeLessThan(locationIndex)
  })

  it('styles the heading as a section heading, not the small uppercase field-label eyebrow', () => {
    const headingLine = src
      .split('\n')
      .find((line) => line.includes('Non-Negotiables'))
    expect(headingLine).toBeDefined()
    expect(headingLine).not.toContain('uppercase')
  })
})
