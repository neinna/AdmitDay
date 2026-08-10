import {
  validateSchoolData,
  EXPECTED_SCHOOL_COUNT,
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
