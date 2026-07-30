/**
 * Issue #127, rule 2: hard filters only ever reduce.
 *
 * Unlike the ask (soft-match, rule 1), the /find rail's borough/track/size
 * controls (lib/school-list-utils.ts applyFindFilters) are a hard floor —
 * matching schools are excluded, not annotated. Applying a filter must never
 * INCREASE the result count, and clearing all filters must return the full
 * set. Tested against several combinations, including ones that legitimately
 * yield zero results (Manhattan + Zoned — Manhattan has no zoned high
 * schools; that zero is correct, not a bug) and against ones that don't, to
 * prove the function isn't just broken for "Zoned" everywhere.
 */

import * as fs from 'fs'
import * as path from 'path'
import { applyFindFilters, EMPTY_FIND_FILTERS, FindFilters } from '../lib/school-list-utils'
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

function assertNeverIncreases(schools: School[], filters: FindFilters, baseline: School[], label: string) {
  const result = applyFindFilters(schools, filters)
  if (result.length > baseline.length) {
    throw new Error(
      `Rule (issue #127, rule 2): hard filters only ever reduce. Applying filter "${label}" produced ` +
        `${result.length} schools, more than the ${baseline.length} it started from. A hard filter (unlike ` +
        `the ask — rule 1) may only shrink or hold steady the result set, never grow it.`
    )
  }
}

// ── Synthetic fixtures ───────────────────────────────────────────────────────

describe('Rule #127.2: hard filters only ever reduce (synthetic)', () => {
  const schools = [
    makeSchool({ dbn: 'A', borough: 'Brooklyn', size: 'small', admissions_types: ['SHSAT'] }),
    makeSchool({ dbn: 'B', borough: 'Queens', size: 'large', admissions_types: ['Screened'] }),
    makeSchool({ dbn: 'C', borough: 'Manhattan', size: 'medium', admissions_types: ['SHSAT', 'Screened'] }),
    makeSchool({ dbn: 'D', borough: 'Manhattan', size: 'medium', admissions_types: ['Zoned'] }),
  ]

  it('clearing all filters returns the exact full set', () => {
    const result = applyFindFilters(schools, EMPTY_FIND_FILTERS)
    expect(result).toHaveLength(schools.length)
    expect(result.map((s) => s.dbn).sort()).toEqual(schools.map((s) => s.dbn).sort())
  })

  it('a borough filter never increases the count', () => {
    assertNeverIncreases(schools, { boroughs: ['Manhattan'], tracks: [], size: '' }, schools, 'borough=Manhattan')
  })

  it('a track filter never increases the count', () => {
    assertNeverIncreases(schools, { boroughs: [], tracks: ['SHSAT'], size: '' }, schools, 'track=SHSAT')
  })

  it('a size filter never increases the count', () => {
    assertNeverIncreases(schools, { boroughs: [], tracks: [], size: 'small' }, schools, 'size=small')
  })

  it('adding a second filter on top of a first never increases the count from the first alone', () => {
    const boroughOnly = applyFindFilters(schools, { boroughs: ['Manhattan'], tracks: [], size: '' })
    const boroughAndTrack = applyFindFilters(schools, { boroughs: ['Manhattan'], tracks: ['Zoned'], size: '' })
    assertNeverIncreases(schools, { boroughs: ['Manhattan'], tracks: ['Zoned'], size: '' }, boroughOnly, 'borough=Manhattan,track=Zoned (vs borough alone)')
    expect(boroughAndTrack.length).toBeLessThanOrEqual(boroughOnly.length)
  })

  it('a filter combination with no matches legitimately returns zero, not an error or a fallback to "show everything"', () => {
    const result = applyFindFilters(schools, { boroughs: ['Queens'], tracks: ['Zoned'], size: '' })
    expect(result).toEqual([])
  })
})

// ── Real, full-size dataset ─────────────────────────────────────────────────
// See LESSONS.md: schools.json is the tracked root-level scrape output,
// present in every checkout including CI, and matches the School shape.

const SCHOOLS_PATH = path.resolve(__dirname, '../schools.json')
const dataAvailable = fs.existsSync(SCHOOLS_PATH)

if (!dataAvailable) {
  // eslint-disable-next-line no-console
  console.warn(
    `[rule-hard-filters-only-reduce] ${SCHOOLS_PATH} not found -- skipping real-dataset checks ` +
      '(no data source available in this environment).'
  )
}

const realSchools: School[] = dataAvailable
  ? JSON.parse(fs.readFileSync(SCHOOLS_PATH, 'utf-8'))
  : []

const BOROUGHS = ['Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island']
const TRACKS = ['SHSAT', 'Audition', 'Screened with Assessment', 'Screened', 'Educational Option', 'Zoned', 'Open']
const SIZES = ['small', 'medium', 'large']

;(dataAvailable ? describe : describe.skip)(
  'Rule #127.2: hard filters only ever reduce (real dataset)',
  () => {
    it('loads a non-trivial number of real schools to test against', () => {
      expect(realSchools.length).toBeGreaterThan(100)
    })

    it('clearing all filters returns the exact full real dataset', () => {
      const result = applyFindFilters(realSchools, EMPTY_FIND_FILTERS)
      expect(result).toHaveLength(realSchools.length)
    })

    it.each(BOROUGHS)('borough=%s alone never exceeds the full dataset count', (borough) => {
      assertNeverIncreases(realSchools, { boroughs: [borough], tracks: [], size: '' }, realSchools, `borough=${borough}`)
    })

    it.each(TRACKS)('track=%s alone never exceeds the full dataset count', (track) => {
      assertNeverIncreases(realSchools, { boroughs: [], tracks: [track], size: '' }, realSchools, `track=${track}`)
    })

    it.each(SIZES)('size=%s alone never exceeds the full dataset count', (size) => {
      assertNeverIncreases(realSchools, { boroughs: [], tracks: [], size }, realSchools, `size=${size}`)
    })

    it.each(BOROUGHS.flatMap((b) => TRACKS.map((t) => [b, t] as const)))(
      'combining borough=%s + track=%s never exceeds either single-dimension count',
      (borough, track) => {
        const boroughOnly = applyFindFilters(realSchools, { boroughs: [borough], tracks: [], size: '' })
        const trackOnly = applyFindFilters(realSchools, { boroughs: [], tracks: [track], size: '' })
        const both = applyFindFilters(realSchools, { boroughs: [borough], tracks: [track], size: '' })
        expect(both.length).toBeLessThanOrEqual(boroughOnly.length)
        expect(both.length).toBeLessThanOrEqual(trackOnly.length)
      }
    )

    // The issue's own example: Manhattan has no zoned high schools, so this
    // combination legitimately yields zero — that's correct, not a bug.
    it('Manhattan + Zoned legitimately yields zero results', () => {
      const result = applyFindFilters(realSchools, { boroughs: ['Manhattan'], tracks: ['Zoned'], size: '' })
      expect(result).toEqual([])
    })

    // Contrast case: Zoned isn't broken everywhere — other boroughs do have
    // zoned schools, so this proves the zero above is data-driven, not a
    // blanket bug in the track filter.
    it('Brooklyn + Zoned yields a non-zero result, showing "Zoned" filtering works elsewhere', () => {
      const result = applyFindFilters(realSchools, { boroughs: ['Brooklyn'], tracks: ['Zoned'], size: '' })
      expect(result.length).toBeGreaterThan(0)
    })
  }
)
