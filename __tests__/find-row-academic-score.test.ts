/**
 * Issue #161: academic_score_pct is on every school record and drives the
 * academic-level filter (lib/school-list-utils.ts), but was never rendered
 * anywhere in the UI — a parent could filter to "high academic" and never
 * see the number behind it. This surfaces it as the leading fact in the
 * /find row's structured-facts line (lib/school-detail-utils.ts's
 * buildFindRowFacts/buildFindRowSummary, introduced by issue #164), using
 * the same `pct` formatting the school detail page's "Academic score" stat
 * cell already uses, so the figure reads identically on both screens.
 */

import { buildFindRowFacts, buildFindRowSummary } from '../lib/school-detail-utils'
import { School } from '../types'

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
    programs: overrides.programs ?? [],
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

describe('buildFindRowFacts surfaces academic_score_pct (issue #161)', () => {
  it('renders a populated score as a rounded percentage, leading the fact list', () => {
    const school = makeSchool({
      academic_score_pct: 85,
      doe_data: {
        overview: '',
        language: '',
        extracurriculars: '',
        website: '',
        phone: '',
        address: '',
        zip: '',
        graduation_rate: 0.94,
      },
    })
    expect(buildFindRowFacts(school)).toEqual(['85% academic score', '94% graduation rate'])
    expect(buildFindRowSummary(school)).toBe('85% academic score · 94% graduation rate')
  })

  it('rounds a fractional score the same way the school detail stat cell does', () => {
    const school = makeSchool({ academic_score_pct: 82.6 })
    expect(buildFindRowFacts(school)).toEqual(['83% academic score'])
  })

  it('a null score is omitted entirely — never rendered as 0%', () => {
    const missing = makeSchool({ academic_score_pct: null })
    expect(buildFindRowFacts(missing)).not.toContain('0% academic score')
    expect(buildFindRowFacts(missing).some((f) => f.includes('academic score'))).toBe(false)
    expect(buildFindRowSummary(missing)).not.toContain('academic score')
  })

  it('a genuine DOE-reported 0 still renders — distinguishable from a missing score', () => {
    const school = makeSchool({ academic_score_pct: 0 })
    expect(buildFindRowFacts(school)).toContain('0% academic score')
  })

  it('never emits an empty string or orphaned separator when only the academic score is present', () => {
    const school = makeSchool({ academic_score_pct: 70 })
    const summary = buildFindRowSummary(school)
    expect(summary).toBe('70% academic score')
    expect(summary).not.toMatch(/·\s*·/)
    expect(summary.startsWith('·')).toBe(false)
    expect(summary.endsWith('·')).toBe(false)
  })
})
