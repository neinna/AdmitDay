/**
 * __tests__/find-start-zip-distance.test.ts
 *
 * Issue #343 — /find gains a "Starting from" ZIP field (FindRail.tsx) and a
 * per-row distance (FindClient.tsx), computed with the haversine helper
 * lib/school-list-utils.ts's distanceMiles. The ZIP must never leave the
 * browser: no fetch body, no analytics event, no ask-box question. This
 * repo's jest config runs under plain node with no jsdom (see
 * find-ask-textarea.test.ts's convention), so the FindRail/FindClient
 * behavior is covered with source-text assertions; distanceMiles and the ZIP
 * lookup are covered with real unit tests.
 */

import * as fs from 'fs'
import * as path from 'path'
import { distanceMiles, lookupZipCentroid, START_ZIP_KEY } from '../lib/school-list-utils'
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
    programs: overrides.programs ?? [],
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

// ── distanceMiles (haversine) ────────────────────────────────────────────────

describe('distanceMiles (issue #343)', () => {
  it('is 0 for identical points', () => {
    expect(distanceMiles({ lat: 40.75064, lng: -73.99718 }, { lat: 40.75064, lng: -73.99718 })).toBe(0)
  })

  it('matches the known distance between two NYC ZIP centroids (10001 Chelsea ↔ 10002 Lower East Side), within 0.1 mi', () => {
    const chelsea = lookupZipCentroid('10001')!
    const les = lookupZipCentroid('10002')!
    // Cross-checked with an independent equirectangular approximation
    // (69 mi/degree latitude, scaled by cos(lat) for longitude): ~2.47 mi.
    expect(Math.abs(distanceMiles(chelsea, les) - 2.48)).toBeLessThan(0.1)
  })

  it('matches the known distance between two NYC ZIP centroids (10007 Financial District ↔ 10462 the Bronx), within 0.1 mi', () => {
    const fidi = lookupZipCentroid('10007')!
    const bronx = lookupZipCentroid('10462')!
    // Cross-checked the same way: ~11.79 mi.
    expect(Math.abs(distanceMiles(fidi, bronx) - 11.81)).toBeLessThan(0.1)
  })
})

// ── ZIP lookup ────────────────────────────────────────────────────────────────

describe('lookupZipCentroid (issue #343)', () => {
  it('finds a known NYC ZIP', () => {
    expect(lookupZipCentroid('10001')).toEqual({ lat: 40.75064, lng: -73.99718 })
  })

  it('returns null for a ZIP not in the committed NYC list', () => {
    expect(lookupZipCentroid('99999')).toBeNull()
  })
})

// ── FindRail: field, validation message, localStorage key ───────────────────

// Issue #374 generalized the field from a ZIP-only input to a ZIP-or-station
// input, so the prop names and persisted key changed — see
// __tests__/find-starting-point.test.ts for full coverage of the new
// behavior. These two describe blocks are updated in place (not deleted) to
// track that rename rather than assert now-superseded behavior.
describe('FindRail "Starting from" field (issue #343/#374)', () => {
  const src = readSource('app/find/FindRail.tsx')

  it('adds a Location field', () => {
    expect(src).toContain('Location')
    expect(src).toContain('onStartingPointInputChange')
  })

  it('shows the not-found message driven by a prop, not by refetching', () => {
    expect(src).toContain('startingPointNotFound')
    expect(src).toContain('Not a NYC ZIP code')
  })
})

describe('FindClient "Starting from" state (issue #343/#374)', () => {
  const src = readSource('app/find/FindClient.tsx')

  it('persists the starting point via the shared lib helpers and restores it on load', () => {
    expect(src).toContain('loadStartingPoint()')
    expect(src).toContain('saveStartingPoint(')
  })

  it('clears the starting point when the field is cleared', () => {
    expect(src).toContain('saveStartingPoint(null)')
  })

  it('computes each row distance with distanceMiles from school.location to the ZIP centroid', () => {
    expect(src).toContain('distanceMiles(school.location, startCoords)')
  })

  // The ZIP must never leave the browser — verified by checking it's absent
  // from every fetch call and every posthog.capture call in the file.
  it('never appears in a fetch call', () => {
    const fetchCalls = src.match(/fetch\([\s\S]*?\)/g) ?? []
    expect(fetchCalls.length).toBeGreaterThan(0)
    for (const call of fetchCalls) {
      expect(call).not.toMatch(/startZip|startCoords/)
    }
  })

  it('never appears in a posthog.capture call', () => {
    const captureCalls = src.match(/posthog\?\.capture\([\s\S]*?\)/g) ?? []
    expect(captureCalls.length).toBeGreaterThan(0)
    for (const call of captureCalls) {
      expect(call).not.toMatch(/startZip|startCoords/)
    }
  })

  it('never appears in the ask-box question or its request body', () => {
    const askBodyIdx = src.indexOf("body: JSON.stringify({ question: trimmed, filters })")
    expect(askBodyIdx).toBeGreaterThan(-1)
    expect(src.slice(askBodyIdx, askBodyIdx + 60)).not.toMatch(/startZip|startCoords/)
  })
})

// ── Row-level behavior (documented via source, exercised via pure helpers) ──

describe('/find row distance behavior (issue #343)', () => {
  it('a school without location produces no distance string from the same expression FindClient uses', () => {
    const startCoords = lookupZipCentroid('10001')
    const school = makeSchool({ location: undefined })
    const distance = startCoords && school.location ? `${distanceMiles(school.location, startCoords).toFixed(1)} mi` : null
    expect(distance).toBeNull()
  })

  it('an unresolved ZIP (no startCoords) produces no distance for any school', () => {
    const startCoords = lookupZipCentroid('99999')
    const school = makeSchool({ location: { lat: 40.7, lng: -73.9 } })
    const distance = startCoords && school.location ? `${distanceMiles(school.location, startCoords).toFixed(1)} mi` : null
    expect(distance).toBeNull()
  })

  it('formats the distance to one decimal place', () => {
    const startCoords = lookupZipCentroid('10001')!
    const school = makeSchool({ location: lookupZipCentroid('10002')! })
    const distance = `${distanceMiles(school.location!, startCoords).toFixed(1)} mi`
    expect(distance).toBe('2.5 mi')
  })
})
