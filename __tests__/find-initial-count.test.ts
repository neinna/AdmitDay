import * as fs from 'fs'
import * as path from 'path'
import { INITIAL_COUNT, PAGE_SIZE } from '../lib/school-list-utils'

// Issue #160 — /find showed only 15 of ~400 schools on first paint. Parent
// research (April 23) asked for a longer list, not a shorter one: 30-50
// visible. This suite locks the initial count at 30 so it can't silently
// regress to PAGE_SIZE (15), while keeping PAGE_SIZE as the "N more
// matches" increment and the pagination affordance itself intact.

function readSource(relPath: string): string {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf-8')
}

describe('INITIAL_COUNT (issue #160: 30 schools on first paint, not 15)', () => {
  it('is 30, not the old 15-row cap', () => {
    expect(INITIAL_COUNT).toBe(30)
  })

  it('keeps PAGE_SIZE at 15 as the "show more" increment', () => {
    expect(PAGE_SIZE).toBe(15)
  })
})

describe('FindClient — seeds and resets visibleCount from INITIAL_COUNT (issue #160)', () => {
  let src: string

  beforeAll(() => {
    src = readSource('app/find/FindClient.tsx')
  })

  it('seeds visibleCount from INITIAL_COUNT, not PAGE_SIZE', () => {
    expect(src).toContain('useState(INITIAL_COUNT)')
    expect(src).not.toContain('useState(PAGE_SIZE)')
  })

  it('resets visibleCount to INITIAL_COUNT when filters change', () => {
    const effectStart = src.indexOf('setVisibleCount(INITIAL_COUNT)')
    expect(effectStart).toBeGreaterThan(-1)
    const surrounding = src.slice(effectStart - 80, effectStart + 80)
    expect(surrounding).toContain('[filters]')
  })

  it('still grows visibleCount by PAGE_SIZE on "more matches" — pagination is not removed', () => {
    expect(src).toContain('setVisibleCount((c) => c + PAGE_SIZE)')
  })
})
