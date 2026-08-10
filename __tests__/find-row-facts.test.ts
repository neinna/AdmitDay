/**
 * Issue #164: the /find row rationale line used to be
 * `truncate(school.doe_data?.overview ?? '', 140)` — DOE marketing prose,
 * identical for every parent and chopped mid-sentence. It's replaced with a
 * few structured, DOE-published facts (lib/school-detail-utils.ts's
 * buildFindRowFacts/buildFindRowSummary), consistent with how #116 selects
 * and formats facts for the school detail page.
 */

import * as fs from 'fs'
import * as path from 'path'
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

describe('buildFindRowFacts (issue #164)', () => {
  it('a school missing every optional field yields no facts at all', () => {
    expect(buildFindRowFacts(makeSchool())).toEqual([])
    expect(buildFindRowSummary(makeSchool())).toBe('')
  })

  it('selects graduation rate, college & career rate, and AP course count, in that fixed order', () => {
    const school = makeSchool({
      doe_data: {
        overview: '',
        language: '',
        extracurriculars: '',
        website: '',
        phone: '',
        address: '',
        zip: '',
        graduation_rate: 0.94,
        college_career_rate: 0.88,
        advancedplacement_courses: 'Calculus AB, Biology, US History',
      },
    })
    expect(buildFindRowFacts(school)).toEqual([
      '94% graduation rate',
      '88% college & career rate',
      '3 AP courses',
    ])
    expect(buildFindRowSummary(school)).toBe(
      '94% graduation rate · 88% college & career rate · 3 AP courses'
    )
  })

  it('singularizes a single AP course', () => {
    const school = makeSchool({
      doe_data: {
        overview: '',
        language: '',
        extracurriculars: '',
        website: '',
        phone: '',
        address: '',
        zip: '',
        advancedplacement_courses: 'Calculus AB',
      },
    })
    expect(buildFindRowFacts(school)).toEqual(['1 AP course'])
  })

  it('a sparse record with only one published fact renders a short, single-fact line', () => {
    const school = makeSchool({
      doe_data: {
        overview: '',
        language: '',
        extracurriculars: '',
        website: '',
        phone: '',
        address: '',
        zip: '',
        graduation_rate: 0.72,
      },
    })
    expect(buildFindRowFacts(school)).toEqual(['72% graduation rate'])
    expect(buildFindRowSummary(school)).toBe('72% graduation rate')
  })

  it('omits a missing rate rather than rendering it as zero, while a genuine DOE-reported 0 still shows', () => {
    const missing = makeSchool()
    expect(buildFindRowFacts(missing)).not.toContain('0% graduation rate')

    const genuineZero = makeSchool({
      doe_data: {
        overview: '',
        language: '',
        extracurriculars: '',
        website: '',
        phone: '',
        address: '',
        zip: '',
        graduation_rate: 0,
      },
    })
    expect(buildFindRowFacts(genuineZero)).toContain('0% graduation rate')
  })

  it('never emits an empty string or orphaned separator when facts are missing', () => {
    const school = makeSchool({
      doe_data: {
        overview: '',
        language: '',
        extracurriculars: '',
        website: '',
        phone: '',
        address: '',
        zip: '',
        college_career_rate: 0.81,
      },
    })
    const summary = buildFindRowSummary(school)
    expect(summary).toBe('81% college & career rate')
    expect(summary).not.toMatch(/·\s*·/)
    expect(summary.startsWith('·')).toBe(false)
    expect(summary.endsWith('·')).toBe(false)
  })
})

describe('/find row no longer renders the DOE overview prose (issue #164)', () => {
  const src = fs.readFileSync(path.join(__dirname, '../app/find/FindClient.tsx'), 'utf-8')

  it('FindClient.tsx does not read doe_data.overview', () => {
    expect(src).not.toContain('doe_data?.overview')
    expect(src).not.toContain('doe_data.overview')
  })

  it('the row rationale is built from buildFindRowSummary, not a raw truncated string', () => {
    expect(src).toContain('buildFindRowSummary(school)')
  })
})

describe('SchoolRow omits the rationale line entirely when empty (issue #164)', () => {
  it('guards the rationale div with a truthiness check so a sparse row renders shorter, not with a blank line', () => {
    const src = fs.readFileSync(path.join(__dirname, '../components/ui/SchoolRow.tsx'), 'utf-8')
    expect(src).toMatch(/\{rationale\s*&&/)
  })
})

describe('/find row against the real dataset (issue #164)', () => {
  const SCHOOLS_PATH = path.resolve(__dirname, '../schools.json')
  const dataAvailable = fs.existsSync(SCHOOLS_PATH)

  ;(dataAvailable ? it : it.skip)(
    'never produces a fact list containing an empty string, for any real school',
    () => {
      const schools: School[] = JSON.parse(fs.readFileSync(SCHOOLS_PATH, 'utf-8'))
      for (const school of schools) {
        const facts = buildFindRowFacts(school)
        expect(facts.every((f) => f.trim().length > 0)).toBe(true)
      }
    }
  )
})
