import {
  validateSchoolData,
  EXPECTED_SCHOOL_COUNT,
  MYSCHOOLS_COVERAGE_THRESHOLD,
} from '../lib/validate-school-data'

// ── Issue #118: data refresh validation (split from #93) ───────────────────
// No network calls -- all fixtures are plain in-memory arrays.

function makeValidSchools(count: number): { dbn: string; name: string; borough: string }[] {
  return Array.from({ length: count }, (_, i) => ({
    dbn: `0${i}X${100 + i}`,
    name: `Test School ${i}`,
    borough: 'Brooklyn',
  }))
}

describe('validateSchoolData', () => {
  it('passes a well-formed set within the expected count range', () => {
    const schools = makeValidSchools(20)
    const result = validateSchoolData(schools, null, { expectedCount: 20, countTolerance: 0.1 })
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.invalidRecords).toEqual([])
    expect(result.schoolCount).toBe(20)
  })

  it('fails when the scrape is drastically smaller than the expected baseline', () => {
    const schools = makeValidSchools(5)
    // Use the real default baseline (~457) -- 5 schools is obviously too small.
    const result = validateSchoolData(schools)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('outside the expected range'))).toBe(true)
  })

  it('fails when the count drops more than ~10% versus the previous file', () => {
    const previous = makeValidSchools(100)
    const dropped = makeValidSchools(85) // 15% drop
    const result = validateSchoolData(dropped, previous, { expectedCount: 100, countTolerance: 0.5 })
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('dropped from 100 to 85'))).toBe(true)
  })

  it('passes when the count drops less than 10% versus the previous file', () => {
    const previous = makeValidSchools(100)
    const current = makeValidSchools(95) // 5% drop
    const result = validateSchoolData(current, previous, { expectedCount: 100, countTolerance: 0.5 })
    expect(result.valid).toBe(true)
  })

  it('fails and reports a record missing a required field (name)', () => {
    const schools = makeValidSchools(10) as { dbn: string; name: string; borough: string }[]
    ;(schools[3] as { name: string }).name = ''
    const result = validateSchoolData(schools, null, { expectedCount: 10, countTolerance: 0.1 })
    expect(result.valid).toBe(false)
    expect(result.invalidRecords).toHaveLength(1)
    expect(result.invalidRecords[0].index).toBe(3)
    expect(result.invalidRecords[0].reasons).toContain('missing name')
  })

  it('fails and reports a record missing borough', () => {
    const schools = makeValidSchools(10)
    ;(schools[0] as { borough: string }).borough = ''
    const result = validateSchoolData(schools, null, { expectedCount: 10, countTolerance: 0.1 })
    expect(result.valid).toBe(false)
    expect(result.invalidRecords[0].reasons).toContain('missing borough')
  })

  it('fails and reports a record missing dbn', () => {
    const schools = makeValidSchools(10)
    ;(schools[0] as { dbn: string }).dbn = ''
    const result = validateSchoolData(schools, null, { expectedCount: 10, countTolerance: 0.1 })
    expect(result.valid).toBe(false)
    expect(result.invalidRecords[0].reasons).toContain('missing dbn')
  })

  it('fails on duplicate dbn values', () => {
    const schools = makeValidSchools(10)
    schools[5].dbn = schools[2].dbn
    const result = validateSchoolData(schools, null, { expectedCount: 10, countTolerance: 0.1 })
    expect(result.valid).toBe(false)
    const duplicateRecord = result.invalidRecords.find((r) => r.index === 5)
    expect(duplicateRecord).toBeDefined()
    expect(duplicateRecord!.reasons.some((r) => r.startsWith('duplicate dbn'))).toBe(true)
  })

  it('rejects non-array input', () => {
    const result = validateSchoolData({ not: 'an array' })
    expect(result.valid).toBe(false)
    expect(result.schoolCount).toBe(0)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('computes added and removed dbns versus the previous set', () => {
    const previous = makeValidSchools(5) // dbns 00X100..04X104
    const current = [...makeValidSchools(4), { dbn: 'NEWDBN', name: 'New School', borough: 'Queens' }]
    const result = validateSchoolData(current, previous, { expectedCount: 5, countTolerance: 0.5 })
    expect(result.added).toEqual(['NEWDBN'])
    expect(result.removed).toEqual([previous[4].dbn])
  })

  it('requires MySchools program provenance when the refresh pipeline asks for it', () => {
    const schools = makeValidSchools(1) as any[]
    schools[0].programs = [
      {
        program_name: 'Dance',
        program_code: 'M80K',
        admissions_type: 'Audition',
        provenance: {
          source: 'MySchools',
          url: 'https://www.myschools.nyc/en/api/v2/schools/process/1/03M485/',
          fetched_at: '2026-08-07T00:00:00+00:00',
        },
      },
    ]

    const result = validateSchoolData(schools, null, {
      expectedCount: 1,
      countTolerance: 0,
      requireMySchoolsPrograms: true,
    })

    expect(result.valid).toBe(true)
  })

  it('rejects empty or legacy-only program rows when MySchools programs are required', () => {
    const schools = makeValidSchools(1) as any[]
    schools[0].programs = [{ admissions_type: 'Audition', raw_method: 'Audition' }]

    const result = validateSchoolData(schools, null, {
      expectedCount: 1,
      countTolerance: 0,
      requireMySchoolsPrograms: true,
    })

    expect(result.valid).toBe(false)
    expect(result.invalidRecords[0].reasons).toEqual(
      expect.arrayContaining([
        'program[0] missing MySchools provenance source',
        'program[0] missing provenance url',
        'program[0] missing provenance fetched_at',
      ])
    )
  })

  it('rejects empty strings inside MySchools program rows because absent fields should be omitted', () => {
    const schools = makeValidSchools(1) as any[]
    schools[0].programs = [
      {
        program_name: 'Dance',
        program_code: '',
        admissions_type: 'Audition',
        provenance: {
          source: 'MySchools',
          url: 'https://www.myschools.nyc/en/api/v2/schools/process/1/03M485/',
          fetched_at: '2026-08-07T00:00:00+00:00',
        },
      },
    ]

    const result = validateSchoolData(schools, null, {
      expectedCount: 1,
      countTolerance: 0,
      requireMySchoolsPrograms: true,
    })

    expect(result.valid).toBe(false)
    expect(result.invalidRecords[0].reasons).toContain(
      'program[0] contains empty string; omit missing fields instead'
    )
  })

  it('default EXPECTED_SCHOOL_COUNT reflects today\'s known-good baseline (~457)', () => {
    expect(EXPECTED_SCHOOL_COUNT).toBe(457)
  })
})

// ── Issue #189: bounded MySchools fallback shouldn't abort the refresh ─────

function makeMySchoolsProgram(dbn: string) {
  return {
    program_name: 'Program',
    program_code: `${dbn}-M1`,
    admissions_type: 'Screened',
    provenance: {
      source: 'MySchools',
      url: `https://www.myschools.nyc/en/api/v2/schools/process/1/${dbn}/`,
      fetched_at: '2026-09-12T00:00:00+00:00',
    },
  }
}

function makeFallbackProgram(sift_url: string) {
  return {
    program_name: 'Screened',
    admissions_type: 'Screened',
    raw_method: 'Screened',
    provenance: {
      source: 'NYC-SIFT',
      url: sift_url,
      fetched_at: '2026-09-12T00:00:00+00:00',
    },
  }
}

function makeSchoolsWithMySchoolsCoverage(total: number, myschoolsCount: number) {
  return Array.from({ length: total }, (_, i) => {
    const dbn = `0${i}X${100 + i}`
    const school: Record<string, unknown> = {
      dbn,
      name: `Test School ${i}`,
      borough: 'Brooklyn',
    }
    if (i < myschoolsCount) {
      school.programs = [makeMySchoolsProgram(dbn)]
    } else {
      school.myschools_status = 'not_listed'
      school.programs = [makeFallbackProgram(`https://nycsift.com/school.phtml?id=${dbn}`)]
    }
    return school
  })
}

describe('validateSchoolData MySchools coverage threshold (issue #189)', () => {
  it('passes when 448/457 schools have a MySchools-sourced program (98% coverage)', () => {
    const schools = makeSchoolsWithMySchoolsCoverage(457, 448)
    const result = validateSchoolData(schools, null, { requireMySchoolsPrograms: true })
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('fails when only 400/457 schools have a MySchools-sourced program (87.5% coverage)', () => {
    const schools = makeSchoolsWithMySchoolsCoverage(457, 400)
    const result = validateSchoolData(schools, null, { requireMySchoolsPrograms: true })
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('MySchools coverage 400/457'))).toBe(true)
  })

  it('marks a fallback school and never reports it as MySchools-sourced', () => {
    const schools = makeSchoolsWithMySchoolsCoverage(457, 448)
    const fallbackSchool = schools[456] as Record<string, unknown>
    expect(fallbackSchool.myschools_status).toBe('not_listed')

    // The fallback school itself is not flagged invalid -- NYC-SIFT provenance
    // is recognized -- so it must not appear in invalidRecords.
    const result = validateSchoolData(schools, null, { requireMySchoolsPrograms: true })
    const fallbackRecord = result.invalidRecords.find((r) => r.dbn === fallbackSchool.dbn)
    expect(fallbackRecord).toBeUndefined()

    // A threshold between 448/457 (actual coverage) and 449/457 fails only if
    // the fallback school is correctly excluded from the MySchools count --
    // proving it is never reported as MySchools-sourced.
    const strict = validateSchoolData(schools, null, {
      requireMySchoolsPrograms: true,
      myschoolsCoverageThreshold: 0.981,
    })
    expect(strict.valid).toBe(false)
    expect(strict.errors.some((e) => e.includes('MySchools coverage 448/457'))).toBe(true)
  })

  it('respects a custom myschoolsCoverageThreshold', () => {
    const schools = makeSchoolsWithMySchoolsCoverage(10, 8) // 80% coverage
    const strict = validateSchoolData(schools, null, {
      expectedCount: 10,
      countTolerance: 0,
      requireMySchoolsPrograms: true,
      myschoolsCoverageThreshold: 0.9,
    })
    expect(strict.valid).toBe(false)

    const lenient = validateSchoolData(schools, null, {
      expectedCount: 10,
      countTolerance: 0,
      requireMySchoolsPrograms: true,
      myschoolsCoverageThreshold: 0.7,
    })
    expect(lenient.valid).toBe(true)
  })

  it('default MYSCHOOLS_COVERAGE_THRESHOLD is 95%', () => {
    expect(MYSCHOOLS_COVERAGE_THRESHOLD).toBe(0.95)
  })
})
