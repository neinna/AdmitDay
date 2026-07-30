import * as fs from 'fs'
import * as path from 'path'
import {
  FindFilters,
  EMPTY_FIND_FILTERS,
  parseFindFilters,
  findFiltersToQueryString,
  applyFindFilters,
  countMatchingTrack,
  describeFindFilters,
  findFilterToLoosen,
} from '../lib/school-list-utils'
import { QueryFilters, appliedSignals, removeSignal } from '../lib/query-filters'
import { rankBySoftMatch } from '../lib/soft-match'
import { School } from '../types'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeSchool(overrides: Partial<School> & { dbn?: string } = {}): School {
  return {
    dbn: overrides.dbn ?? 'X000',
    name: overrides.name ?? 'Test School',
    borough: overrides.borough ?? 'Brooklyn',
    size: overrides.size ?? 'medium',
    total_students: null,
    applicants_per_seat: null,
    academic_score_pct: null,
    survey_score_pct: null,
    admissions_types: overrides.admissions_types ?? [],
    programs: [],
    flags: {
      has_shsat: false,
      has_audition: false,
      has_screened: false,
      has_open: false,
      has_borough_priority: false,
      is_hidden_gem: false,
      has_consortium: false,
      has_ib: false,
      ...overrides.flags,
    },
    doe_data: {
      overview: '',
      language: '',
      extracurriculars: '',
      website: '',
      phone: '',
      address: '',
      zip: '',
      ...overrides.doe_data,
    },
    sift_url: '',
    last_verified: '',
    ...overrides,
  }
}

function makeQueryFilters(overrides: Partial<QueryFilters> = {}): QueryFilters {
  return {
    borough: undefined,
    sports: [],
    interests: [],
    ...overrides,
  }
}

// ── URL filter round-trip (issue #114) ──────────────────────────────────────

describe('/find rail filters — URL round-trip (issue #114)', () => {
  it('round-trips boroughs, tracks, and size through a query string', () => {
    const filters: FindFilters = {
      boroughs: ['Brooklyn', 'Queens'],
      tracks: ['SHSAT', 'Screened'],
      size: 'medium',
    }
    const qs = findFiltersToQueryString(filters)
    const restored = parseFindFilters(Object.fromEntries(new URLSearchParams(qs)))
    expect(restored).toEqual(filters)
  })

  it('produces an empty query string for the default (no filters) state', () => {
    expect(findFiltersToQueryString(EMPTY_FIND_FILTERS)).toBe('')
  })

  it('parses an empty searchParams object back to the default filters', () => {
    expect(parseFindFilters({})).toEqual(EMPTY_FIND_FILTERS)
  })

  it('round-trips a single borough and no track/size', () => {
    const filters: FindFilters = { boroughs: ['Bronx'], tracks: [], size: '' }
    const restored = parseFindFilters(
      Object.fromEntries(new URLSearchParams(findFiltersToQueryString(filters)))
    )
    expect(restored).toEqual(filters)
  })

  it('ignores array-valued searchParams entries (Next.js repeats a key as an array)', () => {
    // parseFindFilters expects the comma-joined single-string form written by
    // findFiltersToQueryString; a stray array value degrades to empty rather
    // than throwing.
    expect(parseFindFilters({ borough: ['Brooklyn', 'Queens'] })).toEqual(EMPTY_FIND_FILTERS)
  })
})

describe('applyFindFilters (issue #114: rail is a hard floor)', () => {
  const schools = [
    makeSchool({ dbn: 'A', borough: 'Brooklyn', size: 'small', admissions_types: ['SHSAT'] }),
    makeSchool({ dbn: 'B', borough: 'Queens', size: 'large', admissions_types: ['Screened'] }),
    makeSchool({ dbn: 'C', borough: 'Manhattan', size: 'medium', admissions_types: ['SHSAT', 'Screened'] }),
  ]

  it('returns every school when no filters are active', () => {
    expect(applyFindFilters(schools, EMPTY_FIND_FILTERS)).toHaveLength(3)
  })

  it('excludes schools outside the selected boroughs', () => {
    const result = applyFindFilters(schools, { boroughs: ['Brooklyn'], tracks: [], size: '' })
    expect(result.map((s) => s.dbn)).toEqual(['A'])
  })

  it('excludes schools without any of the selected tracks', () => {
    const result = applyFindFilters(schools, { boroughs: [], tracks: ['Screened'], size: '' })
    expect(result.map((s) => s.dbn).sort()).toEqual(['B', 'C'])
  })

  it('excludes schools of a different size', () => {
    const result = applyFindFilters(schools, { boroughs: [], tracks: [], size: 'small' })
    expect(result.map((s) => s.dbn)).toEqual(['A'])
  })

  it('combines borough, track, and size filters', () => {
    const result = applyFindFilters(schools, {
      boroughs: ['Manhattan'],
      tracks: ['Screened'],
      size: 'medium',
    })
    expect(result.map((s) => s.dbn)).toEqual(['C'])
  })
})

describe('countMatchingTrack (issue #114: live rail counts)', () => {
  const schools = [
    makeSchool({ dbn: 'A', borough: 'Brooklyn', admissions_types: ['SHSAT'] }),
    makeSchool({ dbn: 'B', borough: 'Queens', admissions_types: ['SHSAT'] }),
    makeSchool({ dbn: 'C', borough: 'Brooklyn', admissions_types: ['Screened'] }),
  ]

  it('counts schools with the given track, ignoring the track filter itself', () => {
    const filters: FindFilters = { boroughs: [], tracks: ['Screened'], size: '' }
    expect(countMatchingTrack(schools, filters, 'SHSAT')).toBe(2)
  })

  it('still applies the other active rail filters (borough/size) to the count', () => {
    const filters: FindFilters = { boroughs: ['Brooklyn'], tracks: [], size: '' }
    expect(countMatchingTrack(schools, filters, 'SHSAT')).toBe(1)
  })
})

describe('describeFindFilters (issue #114: plain-language count band)', () => {
  it('describes an unfiltered view as citywide', () => {
    expect(describeFindFilters(EMPTY_FIND_FILTERS)).toBe('citywide')
  })

  it('names the selected boroughs', () => {
    expect(describeFindFilters({ boroughs: ['Brooklyn', 'Queens'], tracks: [], size: '' })).toBe(
      'in Brooklyn + Queens'
    )
  })

  it('names boroughs and tracks together', () => {
    expect(
      describeFindFilters({ boroughs: ['Brooklyn'], tracks: ['SHSAT'], size: '' })
    ).toBe('in Brooklyn, for SHSAT')
  })
})

describe('findFilterToLoosen (issue #114: empty-state guidance)', () => {
  it('returns null when no filters are active', () => {
    expect(findFilterToLoosen(EMPTY_FIND_FILTERS)).toBeNull()
  })

  it('names the size filter first when set', () => {
    expect(findFilterToLoosen({ boroughs: ['Brooklyn'], tracks: ['SHSAT'], size: 'small' })).toMatch(
      /^Size/
    )
  })

  it('names the track filter when size is not set', () => {
    expect(findFilterToLoosen({ boroughs: ['Brooklyn'], tracks: ['SHSAT'], size: '' })).toMatch(
      /^Admissions track/
    )
  })

  it('names the borough filter when only a borough is active', () => {
    expect(findFilterToLoosen({ boroughs: ['Brooklyn'], tracks: [], size: '' })).toMatch(/^Borough/)
  })
})

// ── Ask never removes schools (issue #114) ──────────────────────────────────

describe('rankBySoftMatch never removes a school (issue #114)', () => {
  const schools = [
    makeSchool({ dbn: 'A', borough: 'Brooklyn' }),
    makeSchool({ dbn: 'B', borough: 'Queens' }),
    makeSchool({ dbn: 'C', borough: 'Bronx' }),
  ]

  it('returns all schools unchanged when no ask filters are active', () => {
    const ranked = rankBySoftMatch(schools, null)
    expect(ranked).toHaveLength(schools.length)
    expect(ranked.map((s) => s.dbn)).toEqual(['A', 'B', 'C'])
  })

  it('keeps every school even when none of them satisfy the ask criteria', () => {
    const filters = makeQueryFilters({ borough: 'Manhattan', sports: ['Soccer'] })
    const ranked = rankBySoftMatch(schools, filters)
    expect(ranked).toHaveLength(schools.length)
    expect(ranked.map((s) => s.dbn).sort()).toEqual(['A', 'B', 'C'])
  })

  it('floats schools satisfying more ask criteria to the top without dropping the rest', () => {
    const filters = makeQueryFilters({ borough: 'Brooklyn' })
    const ranked = rankBySoftMatch(schools, filters)
    expect(ranked).toHaveLength(3)
    expect(ranked[0].dbn).toBe('A') // Brooklyn — satisfies the borough criterion
    expect(ranked.map((s) => s.dbn).sort()).toEqual(['A', 'B', 'C'])
  })
})

// ── Chip removal re-ranks without an LLM call (issue #114) ──────────────────

describe('removeSignal + rankBySoftMatch — chip removal re-ranks without calling the model (issue #114)', () => {
  const schools = [
    makeSchool({ dbn: 'A', borough: 'Brooklyn', doe_data: { overview: '', language: '', extracurriculars: '', website: '', phone: '', address: '', zip: '', interests: ['Computer Science & Technology'] } }),
    makeSchool({ dbn: 'B', borough: 'Queens', doe_data: { overview: '', language: '', extracurriculars: '', website: '', phone: '', address: '', zip: '' } }),
  ]

  it('removing a borough chip drops only that signal, leaving sports/interests intact', () => {
    const filters = makeQueryFilters({ borough: 'Brooklyn', interests: ['Computer Science'] })
    const next = removeSignal(filters, 'borough', 'Brooklyn')
    expect(next.borough).toBeUndefined()
    expect(next.interests).toEqual(['Computer Science'])
  })

  it('removing an interest chip drops only that interest', () => {
    const filters = makeQueryFilters({ interests: ['Computer Science', 'Engineering'] })
    const next = removeSignal(filters, 'interest', 'Computer Science')
    expect(next.interests).toEqual(['Engineering'])
  })

  it('removing a sport chip drops only that sport', () => {
    const filters = makeQueryFilters({ sports: ['Soccer', 'Basketball'] })
    const next = removeSignal(filters, 'sport', 'Soccer')
    expect(next.sports).toEqual(['Basketball'])
  })

  it('re-ranks immediately after a chip is removed, without shrinking the result set', () => {
    const filters = makeQueryFilters({ borough: 'Brooklyn', interests: ['Computer Science'] })
    const before = rankBySoftMatch(schools, filters)
    expect(before[0].dbn).toBe('A') // matches both borough and interest

    const afterRemovingBorough = removeSignal(filters, 'borough', 'Brooklyn')
    const after = rankBySoftMatch(schools, afterRemovingBorough)
    expect(after).toHaveLength(schools.length) // still never removes a school
    expect(after[0].dbn).toBe('A') // still ranks highest — now only on the interest match
  })

  it('appliedSignals produces one removable descriptor per extracted criterion', () => {
    const filters = makeQueryFilters({ borough: 'Brooklyn', sports: ['Soccer'], interests: ['Computer Science'] })
    const signals = appliedSignals(filters)
    expect(signals).toHaveLength(3)
    expect(signals.map((s) => s.kind).sort()).toEqual(['borough', 'interest', 'sport'])
  })

  it('chip removal is pure client-side logic — lib/query-filters.ts and lib/soft-match.ts never call fetch', () => {
    const queryFiltersSrc = fs.readFileSync(path.join(__dirname, '../lib/query-filters.ts'), 'utf-8')
    const softMatchSrc = fs.readFileSync(path.join(__dirname, '../lib/soft-match.ts'), 'utf-8')
    expect(queryFiltersSrc).not.toMatch(/fetch\(/)
    expect(softMatchSrc).not.toMatch(/fetch\(/)
  })

  it("FindClient only calls /api/chat from handleAskSubmit, not from the chip-removal handler", () => {
    const src = fs.readFileSync(path.join(__dirname, '../app/find/FindClient.tsx'), 'utf-8')
    const removeChipBody = src.slice(src.indexOf('function removeChip'), src.indexOf('async function handleAskSubmit'))
    expect(removeChipBody).not.toMatch(/fetch\(/)
    expect(removeChipBody).toContain('removeSignal')
  })
})
