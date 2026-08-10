import * as fs from 'fs'
import * as path from 'path'

// Issue #163 — /find rows must be obviously clickable. Two of four April 23
// testers never realized a school row opened anything: the only affordance
// was an 18px bold name with hover:underline. This suite locks in the fix:
// the whole row becomes the navigable target (a full-row overlay link), the
// Add button stays a separate, independently-clickable control, and the
// affordance is visible without hovering (cursor + focus outline), not just
// on hover.
//
// This repo's jest config runs in the `node` environment with no
// jsdom/testing-library, and no existing component test renders a .tsx
// module directly (see ui-primitives.test.ts, school-detail.test.ts) — every
// test here follows that same source-text convention.

function readSource(relPath: string): string {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf-8')
}

describe('components/ui/SchoolRow — whole row is the click target (issue #163)', () => {
  let src: string

  beforeAll(() => {
    src = readSource('components/ui/SchoolRow.tsx')
  })

  it('accepts an href prop and renders a full-row overlay Link', () => {
    expect(src).toMatch(/href:\s*string/)
    expect(src).toContain('<Link')
    expect(src).toMatch(/href=\{href\}/)
    expect(src).toContain('absolute inset-0')
  })

  it('makes the row container relatively positioned so the overlay anchors to it', () => {
    expect(src).toMatch(/className="relative grid/)
  })

  it('shows a pointer cursor on the row link without requiring hover', () => {
    expect(src).toMatch(/absolute inset-0[^"]*cursor-pointer/)
  })

  it('gives the row link a visible 2px accent focus outline (design system §08 Focus)', () => {
    expect(src).toContain('focus-visible:outline')
    expect(src).toContain('focus-visible:outline-2')
    expect(src).toContain('focus-visible:outline-offset-2')
    expect(src).toContain('focus-visible:outline-accent')
  })

  it('lifts the action cell above the overlay link with a positive z-index (Add stays independently clickable)', () => {
    expect(src).toMatch(/className="relative z-10 order-3[^"]*">\{action\}/)
  })

  it('does not nest the action inside the overlay Link (no nested-anchor markup)', () => {
    const linkStart = src.indexOf('<Link')
    const linkEnd = src.indexOf('/>', linkStart)
    const linkBlock = src.slice(linkStart, linkEnd)
    expect(linkBlock).not.toContain('{action}')
    expect(linkBlock).not.toContain('{name}')
  })
})

describe('FindClient — row link wiring keeps Add independent and preserves detail params (issue #163)', () => {
  let src: string

  beforeAll(() => {
    src = readSource('app/find/FindClient.tsx')
  })

  it('passes the full detailHref (with rank/total/matched params) to SchoolRow as href', () => {
    expect(src).toContain('href={detailHref}')
    expect(src).toContain("detailQuery.set('pos', String(i + 1))")
    expect(src).toContain("detailQuery.set('total', String(ranked.length))")
    expect(src).toContain("detailQuery.set('matched', matchedValues.join(','))")
    expect(src).toContain('const detailHref = `/school/${school.dbn}?${detailQuery.toString()}`')
  })

  it('no longer wraps the row name in its own nested Link (single row-level link, not two)', () => {
    const nameLineMatch = src.match(/name=\{[^}\n]*\}/)
    expect(nameLineMatch).not.toBeNull()
    expect(nameLineMatch![0]).not.toContain('Link')
  })

  it('keeps the Add/Remove button wired to toggleAdded, independent of the row link', () => {
    const actionStart = src.indexOf('action={')
    const actionBlock = src.slice(actionStart, actionStart + 400)
    expect(actionBlock).toContain('onClick={() => toggleAdded(school.dbn)}')
    expect(actionBlock).not.toContain('<Link')
  })
})
