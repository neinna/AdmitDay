/**
 * __tests__/find-sort-label.test.ts
 *
 * Issue #362 — the /find results header said "SORTED BY FIT" unconditionally,
 * even when an active ask (issue #329) reorders the list by its own reasons
 * instead. This exercises app/find/FindClient.tsx's two text changes: the
 * sort label now reflects which ordering is actually in effect, and the
 * count line names the commute constraint (the "Starting from" ZIP or subway
 * station, issue #343/#374) when one is set. This repo's jest config runs
 * under plain node with no jsdom (see __tests__/find-row-affordance.test.ts's
 * convention), so both are covered with source-text assertions.
 */

import * as fs from 'fs'
import * as path from 'path'

function readSource(relPath: string): string {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf-8')
}

const src = readSource('app/find/FindClient.tsx')

describe('the sort label reflects the active ordering (issue #362)', () => {
  it('reads "your ask" when askReasons is non-empty, "fit" otherwise, off the same expression', () => {
    expect(src).toContain("Sorted by {askReasons.length > 0 ? 'your ask' : 'fit'}")
  })

  it('keeps the existing font-mono, uppercase, tracking and muted styling untouched', () => {
    const labelIdx = src.indexOf("Sorted by {askReasons.length > 0 ? 'your ask' : 'fit'}")
    expect(labelIdx).toBeGreaterThan(-1)
    const before = src.slice(Math.max(0, labelIdx - 200), labelIdx)
    expect(before).toContain('font-mono text-[11.5px] tracking-[0.1em] uppercase text-faint')
  })

  it('no longer contains the old fixed label', () => {
    expect(src).not.toContain('Sorted by fit\n')
  })

  it('does not gate the label on the starting point — a starting point with no ask still reads "fit"', () => {
    const labelIdx = src.indexOf("Sorted by {askReasons.length > 0 ? 'your ask' : 'fit'}")
    const labelLine = src.slice(labelIdx - 5, labelIdx + 60)
    expect(labelLine).not.toMatch(/startCoords|startingPoint/)
  })
})

// Issue #374 generalized the appended text from a bare ZIP (`startZip`) to a
// resolved starting point's label (ZIP or station name); these two
// assertions are updated in place to track that rename.
describe('the count line carries the commute constraint (issue #362/#374)', () => {
  it('appends the starting point label only when it resolves', () => {
    expect(src).toContain('{startingPoint ? ` · starting from ${startingPoint.label}` : \'\'}')
  })

  it('the append sits in the same sentence as the existing describeFindFilters count text', () => {
    const describeIdx = src.indexOf('{describeFindFilters(filters)}')
    expect(describeIdx).toBeGreaterThan(-1)
    const after = src.slice(describeIdx, describeIdx + 120)
    expect(after).toContain('{startingPoint ? ` · starting from ${startingPoint.label}` : \'\'}')
  })
})
