/**
 * Issue #403 — the /find row used to repeat a full sentence ("more
 * applicants per seat than N% of NYC high schools") on every one of 426
 * rows, next to a raw ratio that gave no sense of direction. This replaces
 * the sentence with a small colored dot beside the existing N.N APPS/SEAT
 * figure, colored from the same citywide percentile, with the sentence
 * moved unchanged into the dot's title/aria-label tooltip.
 */

import * as fs from 'fs'
import * as path from 'path'
import { applicantsPerSeatDotColor } from '../app/find/FindClient'

function readSource(relPath: string): string {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf-8')
}

describe('applicantsPerSeatDotColor (issue #403)', () => {
  it('is green below the 34th percentile', () => {
    expect(applicantsPerSeatDotColor(0)).toBe('bg-green-600')
    expect(applicantsPerSeatDotColor(33)).toBe('bg-green-600')
  })

  it('is amber from the 34th through the 66th percentile', () => {
    expect(applicantsPerSeatDotColor(34)).toBe('bg-amber-500')
    expect(applicantsPerSeatDotColor(50)).toBe('bg-amber-500')
    expect(applicantsPerSeatDotColor(66)).toBe('bg-amber-500')
  })

  it('is red above the 66th percentile', () => {
    expect(applicantsPerSeatDotColor(67)).toBe('bg-red-600')
    expect(applicantsPerSeatDotColor(100)).toBe('bg-red-600')
  })
})

describe('/find row markup (issue #403)', () => {
  let src: string

  beforeAll(() => {
    src = readSource('app/find/FindClient.tsx')
  })

  it('no longer renders the repeated sentence as row text', () => {
    expect(src).not.toContain('more applicants per seat than')
  })

  it('carries the same wording, unchanged, into the dot tooltip', () => {
    expect(src).toContain(
      'title={`More applicants per seat than ${percentile}% of NYC high schools`}'
    )
    expect(src).toContain(
      'aria-label={`More applicants per seat than ${percentile}% of NYC high schools`}'
    )
  })

  it('renders the dot only when a percentile exists (no ratio, no dot, no tooltip)', () => {
    const statValueBlock = src.slice(src.indexOf('statValue={'), src.indexOf('statLabel="Apps/seat"'))
    expect(statValueBlock).toContain('percentile != null &&')
  })

  it('still shows the N.N APPS/SEAT figure', () => {
    expect(src).toContain("school.applicants_per_seat.toFixed(1)")
    expect(src).toContain('statLabel="Apps/seat"')
  })

  it('colors the dot from applicantsPerSeatDotColor', () => {
    expect(src).toContain('applicantsPerSeatDotColor(percentile)')
  })
})
