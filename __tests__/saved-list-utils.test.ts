import {
  bucketForSchool,
  buildComposition,
  buildShapeSentence,
  moveItem,
  ratioBand,
  resolveSavedSchools,
} from '@/lib/saved-list-utils'
import type { School } from '@/types'

/**
 * Issue #137. The design handoff flags one specific past failure: the
 * proportion band was encoded from a different set than the legend and showed
 * three open/zoned schools where there were two. The sum assertion below is the
 * guard against that class of bug.
 */

function school(over: Partial<School> & { dbn: string }): School {
  return {
    name: `School ${over.dbn}`,
    borough: 'Brooklyn',
    size: 'Medium',
    total_students: 500,
    applicants_per_seat: 4,
    academic_score_pct: 70,
    survey_score_pct: 70,
    admissions_types: ['Open'],
    programs: [],
    flags: {} as School['flags'],
    doe_data: {} as School['doe_data'],
    sift_url: 'https://nycsift.com/x',
    last_verified: '2025-2026',
    ...over,
  } as School
}

describe('bucket assignment — most selective wins', () => {
  it('puts a school in its most selective bucket when it carries several methods', () => {
    // DOE programs routinely carry more than one method at once.
    expect(bucketForSchool({ admissions_types: ['Screened', 'Audition'] })).toBe('audition')
    expect(bucketForSchool({ admissions_types: ['Screened', 'SHSAT'] })).toBe('shsat')
    expect(bucketForSchool({ admissions_types: ['Open', 'Screened'] })).toBe('screened')
  })

  it('treats "Screened with Assessment" as screened', () => {
    expect(bucketForSchool({ admissions_types: ['Screened with Assessment'] })).toBe('screened')
  })

  it('places Educational Option and Zoned in the least selective bucket', () => {
    expect(bucketForSchool({ admissions_types: ['Educational Option'] })).toBe('open')
    expect(bucketForSchool({ admissions_types: ['Zoned'] })).toBe('open')
  })

  it('always returns a bucket, even with no admissions types at all', () => {
    // 51 schools in the live dataset have an empty admissions_types array.
    expect(bucketForSchool({ admissions_types: [] })).toBe('open')
    expect(bucketForSchool({ admissions_types: undefined as unknown as string[] })).toBe('open')
  })
})

describe('composition — one source for band and legend', () => {
  const saved = [
    school({ dbn: 'A', admissions_types: ['SHSAT'] }),
    school({ dbn: 'B', admissions_types: ['Audition'] }),
    school({ dbn: 'C', admissions_types: ['Screened'] }),
    school({ dbn: 'D', admissions_types: ['Screened', 'Audition'] }),
    school({ dbn: 'E', admissions_types: ['Educational Option'] }),
  ]

  it('counts every saved school exactly once', () => {
    const c = buildComposition(saved)
    const sum = c.buckets.reduce((n, b) => n + b.count, 0)
    // The guard the handoff asks for: buckets must sum to the saved total.
    expect(sum).toBe(c.total)
    expect(c.total).toBe(5)
  })

  it('assigns multi-method schools to the more selective bucket, not both', () => {
    const c = buildComposition(saved)
    expect(c.buckets.find((b) => b.key === 'audition')!.count).toBe(2) // B and D
    expect(c.buckets.find((b) => b.key === 'screened')!.count).toBe(1) // C only
  })

  it('keeps zero-count buckets so an absent option is visible', () => {
    const c = buildComposition([school({ dbn: 'A', admissions_types: ['Screened'] })])
    const open = c.buckets.find((b) => b.key === 'open')!
    expect(open.count).toBe(0)
    expect(c.buckets).toHaveLength(4)
  })

  it('never emits a percentage or a score', () => {
    const c = buildComposition(saved)
    const serialized = JSON.stringify(c)
    expect(serialized).not.toMatch(/%|percent|score|risky|balanced|safe|reach|target|likely/i)
  })
})

describe('applicants-per-seat breakdown', () => {
  it('bands ratios at the documented boundaries', () => {
    expect(ratioBand(2.9)).toBe('Under 3')
    expect(ratioBand(3)).toBe('3 to 6')
    expect(ratioBand(6)).toBe('3 to 6')
    expect(ratioBand(6.1)).toBe('Over 6')
  })

  it('counts a missing ratio as missing, never as zero', () => {
    const c = buildComposition([
      school({ dbn: 'A', applicants_per_seat: null }),
      school({ dbn: 'B', applicants_per_seat: 8 }),
    ])
    expect(c.ratioMissing).toBe(1)
    const banded = c.byRatio.reduce((n, r) => n + r.count, 0)
    expect(banded).toBe(1) // only B is banded
    expect(c.byRatio.find((r) => r.label === 'Under 3')!.count).toBe(0)
  })
})

describe('shape sentence — factual, never advisory', () => {
  it('names the gap when nothing on the list is open, Ed Opt or zoned', () => {
    const c = buildComposition([
      school({ dbn: 'A', admissions_types: ['Screened'] }),
      school({ dbn: 'B', admissions_types: ['SHSAT'] }),
    ])
    expect(c.shapeSentence).toMatch(/No open, Ed Opt or zoned program is on it yet/i)
  })

  it('reports an incomplete ratio column rather than hiding it', () => {
    const c = buildComposition([
      school({ dbn: 'A', applicants_per_seat: null }),
      school({ dbn: 'B', applicants_per_seat: 4 }),
    ])
    expect(c.shapeSentence).toMatch(/incomplete/i)
  })

  it('offers no advice and predicts nothing', () => {
    const c = buildComposition([
      school({ dbn: 'A', admissions_types: ['Screened'] }),
      school({ dbn: 'B', admissions_types: ['Open'] }),
    ])
    expect(c.shapeSentence).not.toMatch(
      /should|consider|recommend|risky|balanced|safe|reach|likely|chance|add more/i
    )
  })

  it('handles an empty list without inventing a shape', () => {
    expect(buildShapeSentence([], 0, 0)).toBe('Nothing is saved yet.')
  })
})

describe('resolving and reordering', () => {
  const all = [school({ dbn: 'A' }), school({ dbn: 'B' }), school({ dbn: 'C' })]

  it('returns saved schools in the family’s rank order, not dataset order', () => {
    expect(resolveSavedSchools(all, ['C', 'A']).map((s) => s.dbn)).toEqual(['C', 'A'])
  })

  it('drops a saved dbn that is no longer in the dataset rather than rendering a blank row', () => {
    expect(resolveSavedSchools(all, ['A', 'GONE', 'B']).map((s) => s.dbn)).toEqual(['A', 'B'])
  })

  it('moves an item one position and leaves the rest in order', () => {
    expect(moveItem(['a', 'b', 'c'], 2, -1)).toEqual(['a', 'c', 'b'])
    expect(moveItem(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c'])
  })

  it('is a no-op at the ends, so the first row cannot move up', () => {
    expect(moveItem(['a', 'b'], 0, -1)).toEqual(['a', 'b'])
    expect(moveItem(['a', 'b'], 1, 1)).toEqual(['a', 'b'])
  })
})
