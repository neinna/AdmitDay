import { getUnmetCriteria } from '../lib/soft-match'
import { QueryFilters } from '../lib/query-filters'
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
    admissions_types: [],
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

function makeFilters(overrides: Partial<QueryFilters> = {}): QueryFilters {
  return {
    borough: undefined,
    sports: [],
    interests: [],
    ...overrides,
  }
}

// ── getUnmetCriteria ─────────────────────────────────────────────────────────

describe('getUnmetCriteria (issue #108: soft, annotated chat criteria)', () => {
  it('returns no missing labels when the school satisfies every criterion', () => {
    const school = makeSchool({
      borough: 'Brooklyn',
      doe_data: {
        overview: '',
        language: '',
        extracurriculars: 'PSAL Soccer, Chess Club',
        website: '',
        phone: '',
        address: '',
        zip: '',
        interests: ['Computer Science & Technology'],
      },
    })
    const filters = makeFilters({ borough: 'Brooklyn', sports: ['Soccer'], interests: ['Computer Science'] })

    expect(getUnmetCriteria(school, filters)).toEqual([])
  })

  it('reports a single missing criterion when only one is unmet', () => {
    const school = makeSchool({
      borough: 'Brooklyn',
      doe_data: {
        overview: '',
        language: '',
        extracurriculars: 'Chess Club only — no team sports',
        website: '',
        phone: '',
        address: '',
        zip: '',
        interests: [],
      },
    })
    const filters = makeFilters({ borough: 'Brooklyn', sports: ['Soccer'] })

    const missing = getUnmetCriteria(school, filters)
    expect(missing).toEqual(['Soccer (PSAL)'])
  })

  it('reports several missing criteria when the school satisfies none of them', () => {
    const school = makeSchool({
      borough: 'Queens',
      doe_data: {
        overview: 'A humanities-focused school.',
        language: '',
        extracurriculars: 'Debate team',
        website: '',
        phone: '',
        address: '',
        zip: '',
        interests: ['Humanities & Interdisciplinary'],
      },
    })
    const filters = makeFilters({
      borough: 'Brooklyn',
      sports: ['Soccer'],
      interests: ['Computer Science'],
    })

    const missing = getUnmetCriteria(school, filters)
    expect(missing).toEqual(['Brooklyn', 'Soccer (PSAL)', 'Computer Science'])
  })

  it('matches a sport via the psal sports fields, not just extracurriculars text', () => {
    const school = makeSchool({
      doe_data: {
        overview: '',
        language: '',
        extracurriculars: '',
        website: '',
        phone: '',
        address: '',
        zip: '',
        psal_sports_girls: 'Soccer, Volleyball',
      },
    })
    const filters = makeFilters({ sports: ['Soccer'] })

    expect(getUnmetCriteria(school, filters)).toEqual([])
  })

  it('matches an interest via the school interests list even when the wording differs from the text', () => {
    const school = makeSchool({
      doe_data: {
        overview: 'Nothing about it in the overview.',
        language: '',
        extracurriculars: '',
        website: '',
        phone: '',
        address: '',
        zip: '',
        interests: ['Computer Science & Technology'],
      },
    })
    const filters = makeFilters({ interests: ['Computer Science'] })

    expect(getUnmetCriteria(school, filters)).toEqual([])
  })

  it('returns no missing labels when no criteria were extracted', () => {
    const school = makeSchool()
    expect(getUnmetCriteria(school, makeFilters())).toEqual([])
  })
})
