import {
  isEligible,
  applyFilters,
  getResults,
  selectSHSATSchools,
  getPrimarySection,
  matchesAcademicRating,
  noBorough,
  groupSchools,
} from '../lib/school-list-utils'
import { School, UserInputs } from '../types'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeSchool(overrides: Partial<School> & { dbn?: string }): School {
  return {
    dbn: overrides.dbn ?? 'X000',
    name: overrides.name ?? 'Test School',
    borough: overrides.borough ?? 'Manhattan',
    size: overrides.size ?? 'medium',
    total_students: null,
    applicants_per_seat: null,
    academic_score_pct: overrides.academic_score_pct ?? null,
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

function makeInputs(overrides: Partial<UserInputs> = {}): UserInputs {
  return {
    boroughs: [],
    interests: [],
    sports: [],
    shsat: false,
    auditions: false,
    academicRatings: [],
    iep: false,
    size: 'medium',
    ...overrides,
  }
}

// ── noBorough ────────────────────────────────────────────────────────────────

describe('noBorough', () => {
  it('returns true when no boroughs selected', () => {
    expect(noBorough([])).toBe(true)
  })

  it('returns true when all 5 boroughs selected', () => {
    expect(noBorough(['Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island'])).toBe(true)
  })

  it('returns false when 1 borough selected', () => {
    expect(noBorough(['Manhattan'])).toBe(false)
  })

  it('returns false when 2-4 boroughs selected', () => {
    expect(noBorough(['Manhattan', 'Brooklyn'])).toBe(false)
    expect(noBorough(['Manhattan', 'Brooklyn', 'Queens'])).toBe(false)
  })
})

// ── matchesAcademicRating ────────────────────────────────────────────────────

describe('matchesAcademicRating', () => {
  it('exceptional matches score >= 90', () => {
    const s = makeSchool({ academic_score_pct: 95 })
    expect(matchesAcademicRating(s, ['exceptional'])).toBe(true)
    expect(matchesAcademicRating(s, ['strong'])).toBe(false)
  })

  it('strong matches score 70–89', () => {
    const s = makeSchool({ academic_score_pct: 80 })
    expect(matchesAcademicRating(s, ['strong'])).toBe(true)
    expect(matchesAcademicRating(s, ['exceptional'])).toBe(false)
  })

  it('above_average matches score 50–69', () => {
    const s = makeSchool({ academic_score_pct: 60 })
    expect(matchesAcademicRating(s, ['above_average'])).toBe(true)
    expect(matchesAcademicRating(s, ['exceptional'])).toBe(false)
  })

  it('null score maps to above_average only', () => {
    const s = makeSchool({ academic_score_pct: null })
    expect(matchesAcademicRating(s, ['above_average'])).toBe(true)
    expect(matchesAcademicRating(s, ['exceptional'])).toBe(false)
    expect(matchesAcademicRating(s, ['strong'])).toBe(false)
  })

  it('score exactly at boundary 90 matches exceptional', () => {
    const s = makeSchool({ academic_score_pct: 90 })
    expect(matchesAcademicRating(s, ['exceptional'])).toBe(true)
  })

  it('score exactly at boundary 70 matches strong', () => {
    const s = makeSchool({ academic_score_pct: 70 })
    expect(matchesAcademicRating(s, ['strong'])).toBe(true)
    expect(matchesAcademicRating(s, ['exceptional'])).toBe(false)
  })
})

// ── isEligible ───────────────────────────────────────────────────────────────

describe('isEligible', () => {
  it('audition-only school + auditions=NO → false', () => {
    const school = makeSchool({ flags: { has_audition: true, has_screened: false, has_shsat: false, has_open: false, has_borough_priority: false, is_hidden_gem: false, has_consortium: false, has_ib: false } })
    const inputs = makeInputs({ auditions: false })
    expect(isEligible(school, inputs)).toBe(false)
  })

  it('screened+audition school + auditions=NO → true (eligible via screened)', () => {
    const school = makeSchool({
      flags: { has_audition: true, has_screened: true, has_shsat: false, has_open: false, has_borough_priority: false, is_hidden_gem: false, has_consortium: false, has_ib: false },
      academic_score_pct: 85,
    })
    const inputs = makeInputs({ auditions: false, academicRatings: ['strong'] })
    expect(isEligible(school, inputs)).toBe(true)
  })

  it('SHSAT school + shsat=YES → true', () => {
    const school = makeSchool({ flags: { has_shsat: true, has_audition: false, has_screened: false, has_open: false, has_borough_priority: false, is_hidden_gem: false, has_consortium: false, has_ib: false } })
    const inputs = makeInputs({ shsat: true })
    expect(isEligible(school, inputs)).toBe(true)
  })

  it('SHSAT+audition school + auditions=NO → true (eligible via SHSAT)', () => {
    const school = makeSchool({
      flags: { has_shsat: true, has_audition: true, has_screened: false, has_open: false, has_borough_priority: false, is_hidden_gem: false, has_consortium: false, has_ib: false },
    })
    const inputs = makeInputs({ shsat: true, auditions: false })
    expect(isEligible(school, inputs)).toBe(true)
  })

  it('open school → always true regardless of other inputs', () => {
    const school = makeSchool({ flags: { has_open: true, has_audition: false, has_screened: false, has_shsat: false, has_borough_priority: false, is_hidden_gem: false, has_consortium: false, has_ib: false } })
    expect(isEligible(school, makeInputs())).toBe(true)
    expect(isEligible(school, makeInputs({ auditions: false, shsat: false }))).toBe(true)
  })

  it('lottery school (no flags) → uses academicRatings fallback', () => {
    const school = makeSchool({ academic_score_pct: 60 })
    expect(isEligible(school, makeInputs({ academicRatings: ['above_average'] }))).toBe(true)
    expect(isEligible(school, makeInputs({ academicRatings: ['exceptional'] }))).toBe(false)
  })

  it('screened school shows when exceptional/strong selected', () => {
    // academic_score_pct=95 so matchesAcademicRating fallback won't match above_average (50-69)
    const school = makeSchool({
      academic_score_pct: 95,
      flags: { has_screened: true, has_audition: false, has_shsat: false, has_open: false, has_borough_priority: false, is_hidden_gem: false, has_consortium: false, has_ib: false },
    })
    expect(isEligible(school, makeInputs({ academicRatings: ['exceptional'] }))).toBe(true)
    expect(isEligible(school, makeInputs({ academicRatings: ['strong'] }))).toBe(true)
    expect(isEligible(school, makeInputs({ academicRatings: ['above_average'] }))).toBe(false)
  })
})

// ── applyFilters ─────────────────────────────────────────────────────────────

describe('applyFilters', () => {
  const manhattanOpen = makeSchool({ dbn: 'M001', borough: 'Manhattan', flags: { has_open: true, has_audition: false, has_screened: false, has_shsat: false, has_borough_priority: false, is_hidden_gem: false, has_consortium: false, has_ib: false } })
  const brooklynOpen = makeSchool({ dbn: 'K001', borough: 'Brooklyn', flags: { has_open: true, has_audition: false, has_screened: false, has_shsat: false, has_borough_priority: false, is_hidden_gem: false, has_consortium: false, has_ib: false } })
  const auditionOnly = makeSchool({ dbn: 'M002', borough: 'Manhattan', flags: { has_audition: true, has_open: false, has_screened: false, has_shsat: false, has_borough_priority: false, is_hidden_gem: false, has_consortium: false, has_ib: false } })

  it('excludes ineligible schools (audition-only when auditions=NO)', () => {
    const result = applyFilters([manhattanOpen, auditionOnly], makeInputs({ auditions: false }), false)
    expect(result.map((s) => s.dbn)).not.toContain('M002')
    expect(result.map((s) => s.dbn)).toContain('M001')
  })

  it('filters by borough when single borough selected', () => {
    const inputs = makeInputs({ boroughs: ['Manhattan'] })
    const result = applyFilters([manhattanOpen, brooklynOpen], inputs, false)
    expect(result.map((s) => s.dbn)).toContain('M001')
    expect(result.map((s) => s.dbn)).not.toContain('K001')
  })

  it('includes all boroughs when relaxBorough=true', () => {
    const inputs = makeInputs({ boroughs: ['Manhattan'] })
    const result = applyFilters([manhattanOpen, brooklynOpen], inputs, true)
    expect(result.length).toBe(2)
  })

  it('includes all boroughs when no borough filter applied', () => {
    const inputs = makeInputs({ boroughs: [] })
    const result = applyFilters([manhattanOpen, brooklynOpen], inputs, false)
    expect(result.length).toBe(2)
  })

  it('exceptional rating filter: only includes schools with score >= 90', () => {
    const exceptional = makeSchool({ dbn: 'E001', academic_score_pct: 95, flags: { has_open: false, has_audition: false, has_screened: true, has_shsat: false, has_borough_priority: false, is_hidden_gem: false, has_consortium: false, has_ib: false } })
    const average = makeSchool({ dbn: 'A001', academic_score_pct: 60 })
    const inputs = makeInputs({ academicRatings: ['exceptional'] })
    const result = applyFilters([exceptional, average], inputs, false)
    expect(result.map((s) => s.dbn)).toContain('E001')
    expect(result.map((s) => s.dbn)).not.toContain('A001')
  })
})

// ── getResults ───────────────────────────────────────────────────────────────

describe('getResults', () => {
  it('returns only eligible schools', () => {
    const openSchool = makeSchool({ dbn: 'O001', flags: { has_open: true, has_audition: false, has_screened: false, has_shsat: false, has_borough_priority: false, is_hidden_gem: false, has_consortium: false, has_ib: false } })
    const auditionOnly = makeSchool({ dbn: 'AU01', flags: { has_audition: true, has_open: false, has_screened: false, has_shsat: false, has_borough_priority: false, is_hidden_gem: false, has_consortium: false, has_ib: false } })
    const { results } = getResults([openSchool, auditionOnly], makeInputs({ auditions: false }))
    expect(results.map((s) => s.dbn)).toContain('O001')
    expect(results.map((s) => s.dbn)).not.toContain('AU01')
  })

  it('prioritizes large schools when size=large', () => {
    const small = makeSchool({ dbn: 'S001', size: 'small', flags: { has_open: true, has_audition: false, has_screened: false, has_shsat: false, has_borough_priority: false, is_hidden_gem: false, has_consortium: false, has_ib: false } })
    const large = makeSchool({ dbn: 'L001', size: 'large', flags: { has_open: true, has_audition: false, has_screened: false, has_shsat: false, has_borough_priority: false, is_hidden_gem: false, has_consortium: false, has_ib: false } })
    const { results } = getResults([small, large], makeInputs({ size: 'large' }))
    expect(results[0].dbn).toBe('L001')
  })

  it('prioritizes home borough schools when single borough selected', () => {
    const home = makeSchool({ dbn: 'H001', borough: 'Brooklyn', flags: { has_open: true, has_audition: false, has_screened: false, has_shsat: false, has_borough_priority: false, is_hidden_gem: false, has_consortium: false, has_ib: false } })
    const away = makeSchool({ dbn: 'A001', borough: 'Manhattan', flags: { has_open: true, has_audition: false, has_screened: false, has_shsat: false, has_borough_priority: false, is_hidden_gem: false, has_consortium: false, has_ib: false } })
    const { results } = getResults([away, home], makeInputs({ boroughs: ['Brooklyn'] }))
    expect(results[0].dbn).toBe('H001')
  })
})

// ── getPrimarySection ────────────────────────────────────────────────────────

describe('getPrimarySection', () => {
  it('SHSAT school → shsat', () => {
    const s = makeSchool({ flags: { has_shsat: true, has_audition: false, has_screened: false, has_open: false, has_borough_priority: false, is_hidden_gem: false, has_consortium: false, has_ib: false } })
    expect(getPrimarySection(s)).toBe('shsat')
  })

  it('screened+audition school → screened (not audition)', () => {
    const s = makeSchool({ flags: { has_audition: true, has_screened: true, has_shsat: false, has_open: false, has_borough_priority: false, is_hidden_gem: false, has_consortium: false, has_ib: false } })
    expect(getPrimarySection(s)).toBe('screened')
  })

  it('audition-only school → audition', () => {
    const s = makeSchool({ flags: { has_audition: true, has_screened: false, has_shsat: false, has_open: false, has_borough_priority: false, is_hidden_gem: false, has_consortium: false, has_ib: false } })
    expect(getPrimarySection(s)).toBe('audition')
  })

  it('screened-only school → screened', () => {
    const s = makeSchool({ flags: { has_screened: true, has_audition: false, has_shsat: false, has_open: false, has_borough_priority: false, is_hidden_gem: false, has_consortium: false, has_ib: false } })
    expect(getPrimarySection(s)).toBe('screened')
  })

  it('open/lottery school → lottery', () => {
    const s = makeSchool({ flags: { has_open: true, has_audition: false, has_screened: false, has_shsat: false, has_borough_priority: false, is_hidden_gem: false, has_consortium: false, has_ib: false } })
    expect(getPrimarySection(s)).toBe('lottery')
  })

  it('no admissions flags → lottery', () => {
    const s = makeSchool({ dbn: 'NO01' })
    expect(getPrimarySection(s)).toBe('lottery')
  })
})

// ── selectSHSATSchools ───────────────────────────────────────────────────────

describe('selectSHSATSchools', () => {
  const shsatManhattan = makeSchool({ dbn: 'SM01', borough: 'Manhattan', flags: { has_shsat: true, has_audition: false, has_screened: false, has_open: false, has_borough_priority: false, is_hidden_gem: false, has_consortium: false, has_ib: false } })
  const shsatBrooklyn = makeSchool({ dbn: 'SK01', borough: 'Brooklyn', flags: { has_shsat: true, has_audition: false, has_screened: false, has_open: false, has_borough_priority: false, is_hidden_gem: false, has_consortium: false, has_ib: false } })
  const nonShsat = makeSchool({ dbn: 'O001', flags: { has_open: true, has_audition: false, has_screened: false, has_shsat: false, has_borough_priority: false, is_hidden_gem: false, has_consortium: false, has_ib: false } })

  it('returns only SHSAT schools', () => {
    const result = selectSHSATSchools([shsatManhattan, shsatBrooklyn, nonShsat], makeInputs())
    expect(result.every((s) => s.flags.has_shsat)).toBe(true)
    expect(result.map((s) => s.dbn)).not.toContain('O001')
  })

  it('no borough filter: returns all SHSAT schools', () => {
    const result = selectSHSATSchools([shsatManhattan, shsatBrooklyn], makeInputs({ boroughs: [] }))
    expect(result.length).toBe(2)
  })

  it('single borough filter: prioritizes home borough schools', () => {
    const result = selectSHSATSchools([shsatBrooklyn, shsatManhattan], makeInputs({ boroughs: ['Manhattan'] }))
    expect(result[0].dbn).toBe('SM01')
  })

  it('multiple borough filter: returns SHSAT schools from selected boroughs only', () => {
    const shsatBronx = makeSchool({ dbn: 'BX01', borough: 'Bronx', flags: { has_shsat: true, has_audition: false, has_screened: false, has_open: false, has_borough_priority: false, is_hidden_gem: false, has_consortium: false, has_ib: false } })
    const result = selectSHSATSchools(
      [shsatManhattan, shsatBrooklyn, shsatBronx],
      makeInputs({ boroughs: ['Manhattan', 'Brooklyn'] })
    )
    expect(result.map((s) => s.dbn)).toContain('SM01')
    expect(result.map((s) => s.dbn)).toContain('SK01')
    expect(result.map((s) => s.dbn)).not.toContain('BX01')
  })

  it('caps at 5 schools for single borough when home has enough', () => {
    const manyManhattan = Array.from({ length: 8 }, (_, i) =>
      makeSchool({ dbn: `SM0${i}`, borough: 'Manhattan', flags: { has_shsat: true, has_audition: false, has_screened: false, has_open: false, has_borough_priority: false, is_hidden_gem: false, has_consortium: false, has_ib: false } })
    )
    const result = selectSHSATSchools(manyManhattan, makeInputs({ boroughs: ['Manhattan'] }))
    expect(result.length).toBe(5)
  })
})

// ── groupSchools ─────────────────────────────────────────────────────────────

describe('groupSchools', () => {
  it('groups schools into correct sections', () => {
    const shsat = makeSchool({ dbn: 'SH01', flags: { has_shsat: true, has_audition: false, has_screened: false, has_open: false, has_borough_priority: false, is_hidden_gem: false, has_consortium: false, has_ib: false } })
    const screened = makeSchool({ dbn: 'SC01', flags: { has_screened: true, has_audition: false, has_shsat: false, has_open: false, has_borough_priority: false, is_hidden_gem: false, has_consortium: false, has_ib: false } })
    const audition = makeSchool({ dbn: 'AU01', flags: { has_audition: true, has_screened: false, has_shsat: false, has_open: false, has_borough_priority: false, is_hidden_gem: false, has_consortium: false, has_ib: false } })
    const open = makeSchool({ dbn: 'OP01', flags: { has_open: true, has_audition: false, has_screened: false, has_shsat: false, has_borough_priority: false, is_hidden_gem: false, has_consortium: false, has_ib: false } })

    const groups = groupSchools([shsat, screened, audition, open])
    const types = groups.map((g) => g.type)
    expect(types).toContain('shsat')
    expect(types).toContain('screened')
    expect(types).toContain('audition')
    expect(types).toContain('lottery')
  })

  it('screened+audition school goes into screened section, not audition', () => {
    const mixed = makeSchool({ dbn: 'MX01', flags: { has_screened: true, has_audition: true, has_shsat: false, has_open: false, has_borough_priority: false, is_hidden_gem: false, has_consortium: false, has_ib: false } })
    const groups = groupSchools([mixed])
    const screenedGroup = groups.find((g) => g.type === 'screened')
    const auditionGroup = groups.find((g) => g.type === 'audition')
    expect(screenedGroup?.schools.map((s) => s.dbn)).toContain('MX01')
    expect(auditionGroup).toBeUndefined()
  })

  it('returns empty groups list for empty input', () => {
    expect(groupSchools([])).toEqual([])
  })
})
