/**
 * __tests__/school-page-distance-directions.test.ts
 *
 * Issue #375 — the school page shows the distance from the parent's "Starting
 * from" point (set on /find, issue #374) and a Google Maps directions link,
 * without the starting point ever leaving the browser. This repo's jest
 * config runs under plain node with no jsdom (see find-starting-point.test's
 * convention), so SchoolDetailClient's wiring is covered with source-text
 * assertions; the distance/directions expressions themselves are covered
 * with real unit tests against the same helpers the component calls.
 */

import * as fs from 'fs'
import * as path from 'path'
import { School } from '../types'
import { distanceMiles, formatMiles, lookupZipCentroid, StartingPoint } from '../lib/school-list-utils'

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

// Mirrors the address/distance/directionsHref expressions in
// SchoolDetailClient.tsx exactly, so these tests exercise production logic.
function computeAddress(school: School): string | null {
  return school.doe_data?.address
    ? `${school.doe_data.address}, ${school.borough}${school.doe_data.zip ? ' NY ' + school.doe_data.zip : ''}`
    : null
}

function computeDistance(school: School, startingPoint: StartingPoint | null): number | null {
  return startingPoint && school.location ? distanceMiles(school.location, startingPoint.point) : null
}

function computeDirectionsHref(address: string | null, startingPoint: StartingPoint | null): string | null {
  return address
    ? `https://www.google.com/maps/dir/?${new URLSearchParams({
        api: '1',
        destination: address,
        ...(startingPoint ? { origin: startingPoint.label } : {}),
      }).toString()}`
    : null
}

const CHELSEA: StartingPoint = { label: '10001', point: lookupZipCentroid('10001')! }

// ── Distance ─────────────────────────────────────────────────────────────────

describe('school page distance from starting point (issue #375)', () => {
  it('is absent when there is no starting point', () => {
    const school = makeSchool({ location: lookupZipCentroid('10002')! })
    expect(computeDistance(school, null)).toBeNull()
  })

  it('is absent when the school has no location, even with a starting point set', () => {
    const school = makeSchool({ location: undefined })
    expect(computeDistance(school, CHELSEA)).toBeNull()
  })

  it('renders as formatMiles(distance) when both a starting point and a location are present', () => {
    const school = makeSchool({ location: lookupZipCentroid('10002')! })
    const distance = computeDistance(school, CHELSEA)
    expect(distance).not.toBeNull()
    expect(formatMiles(distance!)).toBe('2.5 mi')
  })

  it('never renders as 0 mi or a placeholder — it is simply absent (null) when unavailable', () => {
    const school = makeSchool({ location: undefined })
    expect(computeDistance(school, null)).toBeNull()
    expect(computeDistance(school, CHELSEA)).toBeNull()
  })
})

// ── Directions link ──────────────────────────────────────────────────────────

describe('school page directions link (issue #375)', () => {
  it('is null when the school has no address, even with a starting point set', () => {
    const school = makeSchool({ doe_data: { overview: '', language: '', extracurriculars: '', website: '', phone: '', address: '', zip: '' } })
    expect(computeAddress(school)).toBeNull()
    expect(computeDirectionsHref(computeAddress(school), CHELSEA)).toBeNull()
  })

  it('has a destination but no origin param when there is no starting point', () => {
    const school = makeSchool({ doe_data: { overview: '', language: '', extracurriculars: '', website: '', phone: '', address: '111 Test St', zip: '11201' } })
    const href = computeDirectionsHref(computeAddress(school), null)
    expect(href).not.toBeNull()
    const params = new URL(href!).searchParams
    expect(params.get('destination')).toBe('111 Test St, Brooklyn NY 11201')
    expect(params.has('origin')).toBe(false)
  })

  it('includes the stored starting point label as origin when one is set', () => {
    const school = makeSchool({ doe_data: { overview: '', language: '', extracurriculars: '', website: '', phone: '', address: '111 Test St', zip: '11201' } })
    const href = computeDirectionsHref(computeAddress(school), CHELSEA)
    const params = new URL(href!).searchParams
    expect(params.get('origin')).toBe('10001')
    expect(params.get('destination')).toBe('111 Test St, Brooklyn NY 11201')
  })
})

// ── SchoolDetailClient wiring ─────────────────────────────────────────────────

describe('SchoolDetailClient reads the starting point after mount (issue #375)', () => {
  const src = readSource('app/school/[dbn]/SchoolDetailClient.tsx')

  it('imports the shared starting-point helpers', () => {
    expect(src).toContain("StartingPoint")
    expect(src).toContain('loadStartingPoint')
    expect(src).toContain('distanceMiles')
    expect(src).toContain('formatMiles')
  })

  it('initializes starting point state to null and only sets it inside a useEffect, never during render', () => {
    expect(src).toContain('useState<StartingPoint | null>(null)')
    const effectMatch = src.match(/useEffect\(\(\) => \{\s*setStartingPoint\(loadStartingPoint\(\)\)\s*\}, \[\]\)/)
    expect(effectMatch).not.toBeNull()
  })

  it('renders the distance line with the required copy and style', () => {
    expect(src).toMatch(/text-\[13\.5px\] text-ink-2/)
    expect(src).toContain('from your starting point')
    expect(src).toContain('formatMiles(distance)')
  })

  it('builds directionsHref only in the browser, adding origin only when a starting point exists', () => {
    expect(src).toMatch(/directionsHref\s*=\s*address/)
    expect(src).toContain('destination: address')
    expect(src).toContain('...(startingPoint ? { origin: startingPoint.label } : {})')
  })

  it('renders the directions link with the required target/rel/style, and never renders one without an address', () => {
    expect(src).toMatch(/\{directionsHref\s*&&\s*\(/)
    expect(src).toMatch(/href=\{directionsHref\}[\s\S]{0,120}target="_blank"[\s\S]{0,80}rel="noopener noreferrer"[\s\S]{0,120}Open directions ↗/)
    expect(src).toMatch(/text-\[13\.5px\] text-accent/)
  })
})
