/**
 * __tests__/find-radius-filter.test.ts
 *
 * Issue #344 — once a "Starting from" ZIP is set (#343), /find gains a
 * "Within" radius control (1/3/5/10 mi + Any) that filters the list, and
 * distance breaks ties in the existing no-ask fit order. Per #361, distance
 * never becomes a sort option — the ask orders the list when active, fit
 * orders it otherwise, and the radius (not a sort) is how a parent expresses
 * how much commute matters.
 *
 * This repo's jest config runs under plain node with no jsdom (see
 * find-ask-textarea.test.ts's convention), so FindRail's rendering is covered
 * with source-text assertions; applyRadiusFilter, countHiddenForNoLocation
 * and rankFindRows are exercised as real unit tests.
 */

import * as fs from 'fs'
import * as path from 'path'
import {
  applyRadiusFilter,
  countHiddenForNoLocation,
  distanceMiles,
  LatLng,
} from '../lib/school-list-utils'
import { rankFindRows } from '../app/find/FindClient'
import { School } from '../types'

function readSource(relPath: string): string {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf-8')
}

function makeSchool(overrides: Partial<School> & { dbn?: string } = {}): School {
  return {
    dbn: overrides.dbn ?? 'X000',
    name: overrides.name ?? 'Test School',
    borough: overrides.borough ?? 'Brooklyn',
    size: overrides.size ?? 'medium',
    total_students: null,
    applicants_per_seat: null,
    admissions_types: overrides.admissions_types ?? [],
    programs: [],
    flags: {
      has_shsat: false,
      has_audition: false,
      has_screened: false,
      has_open: false,
      has_borough_priority: false,
      high_impact: false,
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
    last_verified: '',
    ...overrides,
  }
}

const START: LatLng = { lat: 40.75, lng: -73.99 }
const NEAR: LatLng = { lat: 40.75, lng: -73.98 }
const EXACT_DISTANCE = distanceMiles(START, NEAR)

// ── applyRadiusFilter ─────────────────────────────────────────────────────────

describe('applyRadiusFilter (issue #344)', () => {
  it('is a no-op with no starting point', () => {
    const schools = [makeSchool({ dbn: 'A', location: NEAR }), makeSchool({ dbn: 'B' })]
    expect(applyRadiusFilter(schools, null, 3)).toEqual(schools)
  })

  it('is a no-op with no radius chosen (Any)', () => {
    const schools = [makeSchool({ dbn: 'A', location: NEAR }), makeSchool({ dbn: 'B' })]
    expect(applyRadiusFilter(schools, START, null)).toEqual(schools)
  })

  it('includes a school exactly at the radius boundary', () => {
    const school = makeSchool({ dbn: 'A', location: NEAR })
    expect(applyRadiusFilter([school], START, EXACT_DISTANCE).map((s) => s.dbn)).toEqual(['A'])
  })

  it('excludes a school just past the radius boundary', () => {
    const school = makeSchool({ dbn: 'A', location: NEAR })
    expect(applyRadiusFilter([school], START, EXACT_DISTANCE - 0.001)).toEqual([])
  })

  it('hides a school with no location once a radius is active', () => {
    const school = makeSchool({ dbn: 'A', location: undefined })
    expect(applyRadiusFilter([school], START, 3)).toEqual([])
  })

  it('keeps a school with no location when no radius is active', () => {
    const school = makeSchool({ dbn: 'A', location: undefined })
    expect(applyRadiusFilter([school], START, null)).toEqual([school])
  })
})

// ── countHiddenForNoLocation ──────────────────────────────────────────────────

describe('countHiddenForNoLocation (issue #344)', () => {
  const withLocation = makeSchool({ dbn: 'A', location: NEAR })
  const noLocationOne = makeSchool({ dbn: 'B', location: undefined })
  const noLocationTwo = makeSchool({ dbn: 'C', location: undefined })
  const schools = [withLocation, noLocationOne, noLocationTwo]

  it('is zero with no starting point', () => {
    expect(countHiddenForNoLocation(schools, null, 3)).toBe(0)
  })

  it('is zero with no radius chosen (Any)', () => {
    expect(countHiddenForNoLocation(schools, START, null)).toBe(0)
  })

  it('counts only the no-location schools once a radius is active', () => {
    expect(countHiddenForNoLocation(schools, START, 3)).toBe(2)
  })
})

// ── rankFindRows distance tiebreak ────────────────────────────────────────────
// FindClient.tsx precomputes each annotated row's `distance` (via
// distanceMiles from school.location to the ZIP centroid) before calling
// rankFindRows, so the tiebreak is exercised here with that field directly
// rather than re-deriving it from coordinates.

describe('rankFindRows distance tiebreak (issue #344)', () => {
  const far = makeSchool({ dbn: 'FAR', location: { lat: 40.9, lng: -73.8 } })
  const near = makeSchool({ dbn: 'NEAR', location: NEAR })
  const noLocation = makeSchool({ dbn: 'NOLOC', location: undefined })
  const hardFiltered = [far, near, noLocation]
  const equalFitAnnotated = [
    { school: far, missing: [], distance: 5.2 },
    { school: near, missing: [], distance: 1.1 },
    { school: noLocation, missing: [], distance: null },
  ]

  it('with no ask and equal fit, orders tied rows nearest first with no-location last', () => {
    const ranked = rankFindRows(hardFiltered, equalFitAnnotated, [])
    expect(ranked.map((r) => r.school.dbn)).toEqual(['NEAR', 'FAR', 'NOLOC'])
  })

  it('with no starting point (every distance null), equal-fit ties are left in their original order', () => {
    const allNull = [
      { school: far, missing: [], distance: null },
      { school: near, missing: [], distance: null },
      { school: noLocation, missing: [], distance: null },
    ]
    const ranked = rankFindRows(hardFiltered, allNull, [])
    expect(ranked.map((r) => r.school.dbn)).toEqual(['FAR', 'NEAR', 'NOLOC'])
  })

  it('unequal fit still wins over distance', () => {
    const annotated = [
      { school: far, missing: [], distance: 1.1 },
      { school: near, missing: ['sport'], distance: 0.1 },
    ]
    const ranked = rankFindRows([far, near], annotated, [])
    expect(ranked.map((r) => r.school.dbn)).toEqual(['FAR', 'NEAR'])
  })

  it('with an ask active, distance does not reorder anything — the reasons order wins regardless of distance', () => {
    const reasons = [
      { dbn: 'FAR', reason: 'Great fit.' },
      { dbn: 'NEAR', reason: 'Also a good fit.' },
    ]
    const ranked = rankFindRows(hardFiltered, equalFitAnnotated, reasons)
    expect(ranked.map((r) => r.school.dbn)).toEqual(['FAR', 'NEAR'])
  })
})

describe('FindClient computes each annotated row\'s distance the same way as the row display (issue #344)', () => {
  const src = readSource('app/find/FindClient.tsx')

  it('uses distanceMiles from school.location to startCoords, null otherwise', () => {
    expect(src).toContain(
      'distance: startCoords && school.location ? distanceMiles(school.location, startCoords) : null'
    )
  })
})

// ── FindRail: "Within" control (source-text assertions) ──────────────────────

describe('FindRail "Within" control (issue #344)', () => {
  const src = readSource('app/find/FindRail.tsx')

  it('adds a Within control with the 1/3/5/10 mile + Any options', () => {
    expect(src).toContain('Within')
    expect(src).toContain("{ label: '1 mi', value: '1' }")
    expect(src).toContain("{ label: '3 mi', value: '3' }")
    expect(src).toContain("{ label: '5 mi', value: '5' }")
    expect(src).toContain("{ label: '10 mi', value: '10' }")
  })

  it('is disabled until a starting point exists', () => {
    expect(src).toContain('disabled={radiusDisabled}')
  })

  it('does not show a hint line when the radius control is disabled (issue #394)', () => {
    expect(src).not.toContain('Add a starting point')
  })
})

// Issue #374 generalized the field's backing state from a bare `startZip`
// string to `startingPointInput`/`startCoords` (ZIP or station) — these two
// assertions are updated in place to track that rename.
describe('FindClient wires radiusDisabled off startCoords, not the raw input (issue #344/#374)', () => {
  const src = readSource('app/find/FindClient.tsx')

  it('disables the Within control when no starting point has resolved to coordinates', () => {
    expect(src).toContain('radiusDisabled={!startCoords}')
  })

  it('clears the radius when the starting point field is cleared', () => {
    expect(src).toContain('if (!startingPointInput) setRadiusMiles(null)')
  })
})

// ── No Distance sort option (issue #344 supersedes an earlier ask for one) ──

describe('no Distance option is added to the sort control (issue #344/#361)', () => {
  const findClientSrc = readSource('app/find/FindClient.tsx')
  const findRailSrc = readSource('app/find/FindRail.tsx')

  it('the sort label expression is unchanged — still only "your ask" or "fit"', () => {
    expect(findClientSrc).toContain("Sorted by {askReasons.length > 0 ? 'your ask' : 'fit'}")
  })

  it('neither file introduces a "Distance" sort option', () => {
    expect(findClientSrc).not.toMatch(/Sorted by[\s\S]{0,80}Distance/)
    expect(findRailSrc).not.toContain('Distance')
  })
})

// ── FindRail: instruction lines removed (issue #394) ──────────────────────────

describe('FindRail has no instruction lines parents will not read (issue #394)', () => {
  const src = readSource('app/find/FindRail.tsx')

  it('does not show the "Boroughs and tracks are multi-select" hint', () => {
    expect(src).not.toContain('Boroughs and tracks are multi-select')
    expect(src).not.toContain('Cleared filters return all')
  })
})
