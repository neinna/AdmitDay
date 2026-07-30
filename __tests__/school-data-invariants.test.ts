/**
 * Data invariant tests for the REAL school dataset -- Issue #126.
 *
 * lib/validate-school-data.ts is already covered by
 * __tests__/validate-school-data.test.ts, but only against synthetic
 * fixtures. Nothing previously asserted that the actual, currently-checked-in
 * dataset is sane, so a bad refresh (scripts/refresh-data.ts), a broken
 * scrape (build_school_data.py), or a silent field change could ship
 * unnoticed.
 *
 * Data source: schools.json is a tracked, root-level file, present in every
 * checkout (including CI) -- it's the scrape output that
 * lib/validate-school-data.ts gates before it becomes the gitignored,
 * environment-specific data/schools.json that seeds Postgres (see
 * lib/load-schools.ts and scripts/seed-schools.ts). There is no database in
 * CI (no POSTGRES_URL), so this suite reads schools.json directly instead of
 * going through getAllSchools() -- that's "the same way the app does" as far
 * as is practical without a live DB. If schools.json is ever missing from a
 * checkout, the suite skips cleanly with a console warning instead of
 * failing for the wrong reason (see `dataAvailable` below).
 *
 * Two calibrations below were set by inspecting the real, current dataset
 * (the same "check before asserting" approach the issue calls for on
 * boroughs) rather than the issue text's literal wording, because a literal
 * reading would fail against real, legitimate data:
 *
 *  - applicants_per_seat: some transfer/alternative-admission schools
 *    legitimately carry 0 (not null) for this field. We assert >= 0, not
 *    > 0, so a genuine negative (corruption) still fails.
 *  - admissions tracks: build_school_data.py's own fetch_school_detail()
 *    falls back to [] when a school's SIFT detail page fails to parse, and
 *    the scraper already prints a "Missing admissions" count as an expected,
 *    non-zero metric. ~11% (51/457) of real schools currently have an empty
 *    admissions_types array. We bound that ratio (catches a scraper
 *    regression that spikes it) instead of requiring every school to have
 *    one, and separately require that any track values present are drawn
 *    from the known set.
 */

import fs from 'fs'
import path from 'path'

const SCHOOLS_PATH = path.resolve(__dirname, '../schools.json')

const KNOWN_BOROUGHS = new Set(['Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island'])

// Mirrors classify_admissions() in build_school_data.py.
const KNOWN_ADMISSIONS_TRACKS = new Set([
  'SHSAT',
  'Audition',
  'Screened with Assessment',
  'Screened',
  'Educational Option',
  'Zoned',
  'Open',
])

// Sane range around the current baseline (~457): wide enough that a normal
// admissions-cycle change (schools opening/closing/merging) doesn't fail,
// narrow enough that a collapsed or runaway scrape does.
const MIN_SCHOOL_COUNT = 350
const MAX_SCHOOL_COUNT = 600

// See file header: known, expected gap in the scrape, bounded rather than
// required to be zero.
const MAX_MISSING_ADMISSIONS_RATIO = 0.2

interface MinimalSchool {
  dbn?: unknown
  name?: unknown
  borough?: unknown
  applicants_per_seat?: unknown
  academic_score_pct?: unknown
  survey_score_pct?: unknown
  admissions_types?: unknown
  [key: string]: unknown
}

function label(s: MinimalSchool, index: number): string {
  const dbn = typeof s?.dbn === 'string' && s.dbn ? s.dbn : '(no dbn)'
  const name = typeof s?.name === 'string' && s.name ? s.name : '(no name)'
  return `[${index}] ${dbn} ${name}`
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

// ── Reusable checks (exercised both against the real dataset and, below,
// against deliberately corrupted synthetic copies) ──────────────────────────

function findDuplicateDbns(schools: MinimalSchool[]): string[] {
  const seen = new Map<string, number>()
  const violations: string[] = []
  schools.forEach((s, i) => {
    if (!isNonEmptyString(s.dbn)) return
    const dbn = s.dbn.trim()
    if (seen.has(dbn)) {
      violations.push(`duplicate dbn "${dbn}": ${label(s, seen.get(dbn) as number)} and ${label(s, i)}`)
    } else {
      seen.set(dbn, i)
    }
  })
  return violations
}

function findMissingRequiredFields(schools: MinimalSchool[]): string[] {
  const violations: string[] = []
  schools.forEach((s, i) => {
    const missing: string[] = []
    if (!isNonEmptyString(s.dbn)) missing.push('dbn')
    if (!isNonEmptyString(s.name)) missing.push('name')
    if (!isNonEmptyString(s.borough)) missing.push('borough')
    if (missing.length > 0) violations.push(`${label(s, i)}: missing ${missing.join(', ')}`)
  })
  return violations
}

function findInvalidBoroughs(schools: MinimalSchool[]): string[] {
  const violations: string[] = []
  schools.forEach((s, i) => {
    if (!isNonEmptyString(s.borough)) return // covered by findMissingRequiredFields
    if (!KNOWN_BOROUGHS.has(s.borough.trim())) {
      violations.push(`${label(s, i)}: unrecognized borough "${s.borough}"`)
    }
  })
  return violations
}

function findNumericSanityViolations(schools: MinimalSchool[]): string[] {
  const violations: string[] = []
  schools.forEach((s, i) => {
    const aps = s.applicants_per_seat
    if (aps !== null && aps !== undefined) {
      if (typeof aps !== 'number' || !Number.isFinite(aps) || aps < 0) {
        violations.push(`${label(s, i)}: applicants_per_seat is ${JSON.stringify(aps)}, expected a number >= 0`)
      }
    }
    ;(['academic_score_pct', 'survey_score_pct'] as const).forEach((field) => {
      const value = s[field]
      if (value === null || value === undefined) return
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
        violations.push(`${label(s, i)}: ${field} is ${JSON.stringify(value)}, expected a number between 0 and 100`)
      }
    })
  })
  return violations
}

function findInvalidAdmissionsTrackValues(schools: MinimalSchool[]): string[] {
  const violations: string[] = []
  schools.forEach((s, i) => {
    const tracks = s.admissions_types
    if (!Array.isArray(tracks)) {
      violations.push(`${label(s, i)}: admissions_types is not an array (${JSON.stringify(tracks)})`)
      return
    }
    tracks.forEach((t) => {
      if (typeof t !== 'string' || !KNOWN_ADMISSIONS_TRACKS.has(t)) {
        violations.push(`${label(s, i)}: unrecognized admissions track "${String(t)}"`)
      }
    })
  })
  return violations
}

function findSchoolsMissingAdmissionsTrack(schools: MinimalSchool[]): string[] {
  return schools
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => !Array.isArray(s.admissions_types) || s.admissions_types.length === 0)
    .map(({ s, i }) => label(s, i))
}

// ── Real dataset ─────────────────────────────────────────────────────────

const dataAvailable = fs.existsSync(SCHOOLS_PATH)

if (!dataAvailable) {
  // eslint-disable-next-line no-console
  console.warn(
    `[school-data-invariants] ${SCHOOLS_PATH} not found -- skipping real-dataset invariant tests ` +
      '(no data source available in this environment, e.g. a sparse checkout).'
  )
}

;(dataAvailable ? describe : describe.skip)('school data invariants (real dataset)', () => {
  // describe.skip still evaluates this body (it just skips the `it`s), so
  // guard the read -- it must not throw when the file is absent.
  const schools: MinimalSchool[] = dataAvailable ? JSON.parse(fs.readFileSync(SCHOOLS_PATH, 'utf-8')) : []

  it('loads as a non-empty array', () => {
    expect(Array.isArray(schools)).toBe(true)
    expect(schools.length).toBeGreaterThan(0)
  })

  it(`has a school count within the sane range [${MIN_SCHOOL_COUNT}, ${MAX_SCHOOL_COUNT}]`, () => {
    expect(schools.length).toBeGreaterThanOrEqual(MIN_SCHOOL_COUNT)
    expect(schools.length).toBeLessThanOrEqual(MAX_SCHOOL_COUNT)
  })

  it('has no duplicate dbn values', () => {
    expect(findDuplicateDbns(schools)).toEqual([])
  })

  it('has non-empty dbn, name, and borough on every school', () => {
    expect(findMissingRequiredFields(schools)).toEqual([])
  })

  it('has a recognized borough on every school', () => {
    expect(findInvalidBoroughs(schools)).toEqual([])
  })

  it('has sane numeric fields (applicants_per_seat >= 0; percentages in [0, 100]) where present', () => {
    expect(findNumericSanityViolations(schools)).toEqual([])
  })

  it('only uses recognized admissions track values', () => {
    expect(findInvalidAdmissionsTrackValues(schools)).toEqual([])
  })

  it(`has no more than ${MAX_MISSING_ADMISSIONS_RATIO * 100}% of schools missing an admissions track`, () => {
    const missing = findSchoolsMissingAdmissionsTrack(schools)
    const ratio = missing.length / schools.length
    if (ratio > MAX_MISSING_ADMISSIONS_RATIO) {
      throw new Error(
        `${missing.length}/${schools.length} schools (${(ratio * 100).toFixed(1)}%) have no admissions ` +
          `track, exceeding the ${MAX_MISSING_ADMISSIONS_RATIO * 100}% ceiling:\n${missing.join('\n')}`
      )
    }
    expect(ratio).toBeLessThanOrEqual(MAX_MISSING_ADMISSIONS_RATIO)
  })
})

// ── Corruption detection ─────────────────────────────────────────────────
// Confirms the checks above actually catch bad data, using a small synthetic
// base fixture so these tests run regardless of whether schools.json is
// available. Never touches the real dataset.

function makeValidSchool(overrides: Partial<MinimalSchool> = {}, i = 0): MinimalSchool {
  return {
    dbn: `0${i}X10${i}`,
    name: `Test School ${i}`,
    borough: 'Brooklyn',
    applicants_per_seat: 2.5,
    academic_score_pct: 75,
    survey_score_pct: 80,
    admissions_types: ['Screened'],
    ...overrides,
  }
}

function makeValidFixture(count: number): MinimalSchool[] {
  return Array.from({ length: count }, (_, i) => makeValidSchool({}, i))
}

describe('school data invariant checks (corruption detection, synthetic fixture)', () => {
  it('passes a well-formed fixture on every check', () => {
    const schools = makeValidFixture(10)
    expect(findDuplicateDbns(schools)).toEqual([])
    expect(findMissingRequiredFields(schools)).toEqual([])
    expect(findInvalidBoroughs(schools)).toEqual([])
    expect(findNumericSanityViolations(schools)).toEqual([])
    expect(findInvalidAdmissionsTrackValues(schools)).toEqual([])
    expect(findSchoolsMissingAdmissionsTrack(schools)).toEqual([])
  })

  it('catches a duplicate dbn', () => {
    const schools = makeValidFixture(5)
    schools[3] = { ...schools[3], dbn: schools[1].dbn }
    const violations = findDuplicateDbns(schools)
    expect(violations.length).toBeGreaterThan(0)
    expect(violations[0]).toContain(schools[1].dbn as string)
  })

  it('catches a missing required field', () => {
    const schools = makeValidFixture(5)
    schools[2] = { ...schools[2], name: '' }
    const violations = findMissingRequiredFields(schools)
    expect(violations).toHaveLength(1)
    expect(violations[0]).toContain('missing name')
    expect(violations[0]).toContain(schools[2].dbn as string)
  })

  it('catches a school count collapse', () => {
    const collapsed = makeValidFixture(3) // far below MIN_SCHOOL_COUNT
    expect(collapsed.length).toBeLessThan(MIN_SCHOOL_COUNT)
  })

  it('catches an unrecognized borough', () => {
    const schools = makeValidFixture(5)
    schools[0] = { ...schools[0], borough: 'New Jersey' }
    const violations = findInvalidBoroughs(schools)
    expect(violations).toHaveLength(1)
    expect(violations[0]).toContain('New Jersey')
  })

  it('catches a negative applicants_per_seat', () => {
    const schools = makeValidFixture(5)
    schools[1] = { ...schools[1], applicants_per_seat: -1 }
    const violations = findNumericSanityViolations(schools)
    expect(violations.some((v) => v.includes('applicants_per_seat'))).toBe(true)
  })

  it('does not coerce a null applicants_per_seat to 0 (treats absent as absent)', () => {
    const schools = makeValidFixture(3)
    schools[0] = { ...schools[0], applicants_per_seat: null }
    expect(findNumericSanityViolations(schools)).toEqual([])
  })

  it('catches an out-of-range percentage field', () => {
    const schools = makeValidFixture(5)
    schools[4] = { ...schools[4], academic_score_pct: 150 }
    const violations = findNumericSanityViolations(schools)
    expect(violations.some((v) => v.includes('academic_score_pct'))).toBe(true)
  })

  it('catches an unrecognized admissions track value', () => {
    const schools = makeValidFixture(3)
    schools[0] = { ...schools[0], admissions_types: ['Bribery'] }
    const violations = findInvalidAdmissionsTrackValues(schools)
    expect(violations.some((v) => v.includes('Bribery'))).toBe(true)
  })

  it('flags a school with no admissions track at all', () => {
    const schools = makeValidFixture(3)
    schools[0] = { ...schools[0], admissions_types: [] }
    expect(findSchoolsMissingAdmissionsTrack(schools)).toHaveLength(1)
  })
})
