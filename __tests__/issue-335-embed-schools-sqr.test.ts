/**
 * Issue #335: scripts/embed-schools.ts still read the fields #302 removed
 * (academic_score_pct, survey_score_pct, is_hidden_gem) and wrote the retired
 * "hidden gem" sentence into the identity chunk. These tests exercise the
 * chunk builder directly against the current data shape (sqr, flags.high_impact).
 */

// The OpenAI client is constructed at module scope; give it a harmless key so
// importing the script for its pure chunk-building logic doesn't throw or
// touch the network (main() itself only runs when the script is executed
// directly, guarded by `require.main === module`).
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key'

import { buildIdentityParts, DoeData, School, SchoolFlags } from '@/scripts/embed-schools'

function makeDoeData(overrides: Partial<DoeData> = {}): DoeData {
  return {
    overview: '',
    language: '',
    extracurriculars: '',
    academic_opportunities: '',
    prgdesc: '',
    interests: [],
    graduation_rate: null,
    attendance_rate: null,
    college_career_rate: null,
    advancedplacement_courses: '',
    neighborhood: 'Test Neighborhood',
    address: '',
    zip: '',
    subway: '',
    bus: '',
    psal_sports_boys: '',
    psal_sports_girls: '',
    psal_sports_coed: '',
    addtl_info: '',
    ...overrides,
  }
}

function makeFlags(overrides: Partial<SchoolFlags> = {}): SchoolFlags {
  return {
    has_shsat: false,
    has_audition: false,
    has_screened: false,
    has_open: false,
    has_borough_priority: false,
    high_impact: false,
    has_consortium: false,
    has_ib: false,
    ...overrides,
  }
}

function makeSchool(overrides: Partial<School> = {}): School {
  return {
    dbn: '01M001',
    name: 'Test High School',
    borough: 'Manhattan',
    size: 'small',
    total_students: 400,
    applicants_per_seat: 1.2,
    admissions_types: [],
    programs: [],
    flags: makeFlags(),
    doe_data: makeDoeData(),
    sift_url: '',
    shsat_cutoff_score: null,
    ...overrides,
  }
}

describe('issue #335: embed-schools identity chunk reflects sqr / flags.high_impact', () => {
  it('produces the sqr and high-impact sentences when both are present', () => {
    const school = makeSchool({
      sqr: { performance_pctl: 67, impact_pctl: 64, rating: 'Fair', year: '2024-25' },
      flags: makeFlags({ high_impact: true }),
    })

    const text = buildIdentityParts(school).join('\n')

    expect(text).toContain('Results: better than 67% of NYC high schools.')
    expect(text).toContain('Impact: students grow more than at 64% of schools.')
    expect(text).toContain('DOE rating: Fair (2024-25).')
    expect(text).toContain('Students grow more here than at 80%+ of NYC high schools (DOE 2024-25).')
  })

  it('produces none of those sentences when sqr and high_impact are absent', () => {
    const school = makeSchool()

    const text = buildIdentityParts(school).join('\n')

    expect(text).not.toContain('Results: better than')
    expect(text).not.toContain('Impact: students grow more than at')
    expect(text).not.toContain('DOE rating:')
    expect(text).not.toContain('Students grow more here than at 80%+')
  })

  it('never writes the retired hidden-gem or old score language into any chunk', () => {
    const schools = [
      makeSchool({
        sqr: { performance_pctl: 90, impact_pctl: 10, rating: 'Excellent', year: '2024-25' },
        flags: makeFlags({ high_impact: true }),
      }),
      makeSchool(),
    ]

    for (const school of schools) {
      const text = buildIdentityParts(school).join('\n').toLowerCase()
      expect(text).not.toContain('hidden gem')
      expect(text).not.toContain('academic score')
      expect(text).not.toContain('survey score')
    }
  })
})
