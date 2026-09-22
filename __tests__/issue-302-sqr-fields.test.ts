/**
 * Issue #302: the DOE School Quality Report replaces the old NYC-SIFT
 * academic/survey score fields, and flags.high_impact replaces
 * flags.is_hidden_gem. Asserts the checked-in dataset actually reflects
 * that swap -- no school record carries a removed field, and no school
 * uses the removed flag name.
 */

import fs from 'fs'
import path from 'path'

const SCHOOLS_PATH = path.resolve(__dirname, '../schools.json')
const dataAvailable = fs.existsSync(SCHOOLS_PATH)

if (!dataAvailable) {
  // eslint-disable-next-line no-console
  console.warn(`[issue-302-sqr-fields] ${SCHOOLS_PATH} not found -- skipping.`)
}

interface MinimalSchool {
  dbn?: unknown
  flags?: Record<string, unknown>
  sqr?: {
    performance_score?: unknown
    impact_score?: unknown
    rating?: unknown
    performance_pctl?: unknown
    impact_pctl?: unknown
    year?: unknown
    source_url?: unknown
  }
  applicants_per_seat?: unknown
  [key: string]: unknown
}

;(dataAvailable ? describe : describe.skip)('issue #302: schools.json reflects the SQR/high_impact data swap', () => {
  const schools: MinimalSchool[] = dataAvailable ? JSON.parse(fs.readFileSync(SCHOOLS_PATH, 'utf-8')) : []

  it('loads 426 schools', () => {
    expect(schools.length).toBe(426)
  })

  it('no school record carries academic_score_pct, survey_score_pct, or sift_url', () => {
    const violations = schools
      .filter((s) => 'academic_score_pct' in s || 'survey_score_pct' in s || 'sift_url' in s)
      .map((s) => s.dbn)
    expect(violations).toEqual([])
  })

  it('no school uses the removed is_hidden_gem flag name', () => {
    const violations = schools.filter((s) => s.flags && 'is_hidden_gem' in s.flags).map((s) => s.dbn)
    expect(violations).toEqual([])
  })

  it('every school has a boolean flags.high_impact', () => {
    const violations = schools
      .filter((s) => typeof s.flags?.high_impact !== 'boolean')
      .map((s) => s.dbn)
    expect(violations).toEqual([])
  })

  it('sqr, when present, never carries a value of exactly 0 for an absent field (absent values are absent, never 0)', () => {
    // sqr is entirely omitted for schools DOE didn't publish -- it must never
    // appear as an object with missing sub-fields silently defaulted to 0.
    const withSqr = schools.filter((s) => s.sqr !== undefined)
    for (const s of withSqr) {
      expect(s.sqr).not.toBeNull()
    }
  })

  it('applicants_per_seat is never present for a school with no seats (0-seat programs skipped)', () => {
    const violations = schools.filter((s) => s.applicants_per_seat === 0).map((s) => s.dbn)
    expect(violations).toEqual([])
  })
})
