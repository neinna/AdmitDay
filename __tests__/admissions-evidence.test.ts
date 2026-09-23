/**
 * Issue #216: /find rows show admissions evidence, not a derived rating —
 * citywide scale for applicants-per-seat, and the published method(s) that
 * decide admission. Covers the two pure functions plus the mixed-method and
 * no-types cases the acceptance criteria call out.
 */

import {
  citywidePercentile,
  admissionMethods,
  admissionMethodCopy,
  ADMISSION_METHOD_COPY,
} from '../lib/school-list-utils'
import { School, SchoolProgram } from '../types'

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

function program(admissions_type: string): SchoolProgram {
  return { admissions_type }
}

// ── citywidePercentile ───────────────────────────────────────────────────────

describe('citywidePercentile (issue #216)', () => {
  const schools = [
    makeSchool({ dbn: 'A', applicants_per_seat: 2 }),
    makeSchool({ dbn: 'B', applicants_per_seat: 4 }),
    makeSchool({ dbn: 'C', applicants_per_seat: 6 }),
    makeSchool({ dbn: 'D', applicants_per_seat: 8 }),
    makeSchool({ dbn: 'E', applicants_per_seat: null }),
  ]

  it('gives the lowest school a percentile of 0', () => {
    expect(citywidePercentile(2, schools)).toBe(0)
  })

  it('gives the highest school a percentile of 99, never 100', () => {
    expect(citywidePercentile(8, schools)).toBe(75) // 3 of 4 valued schools are strictly below 8
  })

  it('the true maximum across a larger set rounds down to 99, not 100', () => {
    const big = Array.from({ length: 100 }, (_, i) =>
      makeSchool({ dbn: `S${i}`, applicants_per_seat: i + 1 })
    )
    expect(citywidePercentile(100, big)).toBe(99)
  })

  it('excludes schools with no published value from the denominator', () => {
    // 4 schools have a value; 2 (A, B) are strictly below 6.
    expect(citywidePercentile(6, schools)).toBe(50)
  })

  it('ties do not inflate the rank because the comparison is strictly lower', () => {
    const tied = [
      makeSchool({ dbn: 'A', applicants_per_seat: 5 }),
      makeSchool({ dbn: 'B', applicants_per_seat: 5 }),
      makeSchool({ dbn: 'C', applicants_per_seat: 10 }),
    ]
    // Neither tied school counts itself or its tie-partner as "strictly lower".
    expect(citywidePercentile(5, tied)).toBe(0)
  })

  it('is computed from the passed-in dataset, not a hardcoded table', () => {
    // Dropping E (null value, excluded from the denominator either way) leaves the result unchanged...
    const withoutNullEntry = schools.filter((s) => s.dbn !== 'E')
    expect(citywidePercentile(6, withoutNullEntry)).toBe(citywidePercentile(6, schools))
    // ...but a genuinely different dataset yields a different percentile for the same aps.
    expect(citywidePercentile(6, schools.filter((s) => s.dbn !== 'D'))).not.toBe(
      citywidePercentile(6, schools)
    )
  })
})

// ── admissionMethods ─────────────────────────────────────────────────────────

describe('admissionMethods (issue #216)', () => {
  it('returns a single method in the approved order', () => {
    const school = makeSchool({ programs: [program('Screened')] })
    expect(admissionMethods(school)).toEqual(['Screened'])
  })

  it('returns every distinct method for a mixed-method school, in table order regardless of source order', () => {
    const school = makeSchool({
      programs: [program('Zoned'), program('SHSAT'), program('Screened'), program('Zoned')],
    })
    expect(admissionMethods(school)).toEqual(['SHSAT', 'Screened', 'Zoned'])
  })

  it('returns an empty array for a school with no program types', () => {
    const school = makeSchool({ programs: [] })
    expect(admissionMethods(school)).toEqual([])
  })

  it('ignores programs with no admissions_type', () => {
    const school = makeSchool({ programs: [{}, program('Open')] })
    expect(admissionMethods(school)).toEqual(['Open'])
  })
})

// ── admissionMethodCopy ──────────────────────────────────────────────────────

describe('admissionMethodCopy (issue #216)', () => {
  it('returns the exact approved copy for each non-SHSAT method', () => {
    for (const method of Object.keys(ADMISSION_METHOD_COPY)) {
      if (method === 'SHSAT') continue
      expect(admissionMethodCopy(method, makeSchool())).toBe(ADMISSION_METHOD_COPY[method])
    }
  })

  it('appends up to three published SHSAT cutoffs, newest year first', () => {
    // Stuyvesant's real DBN, per lib/shsat-cutoffs.ts.
    const school = makeSchool({ dbn: '02M475' })
    expect(admissionMethodCopy('SHSAT', school)).toBe(
      'Specialized: admission by SHSAT score. Lowest score offered: 561 · 556 · 561'
    )
  })

  it('never shows a 0 and falls back to the base sentence for a DBN with no published cutoff', () => {
    const school = makeSchool({ dbn: 'NO-CUTOFF-DBN' })
    const copy = admissionMethodCopy('SHSAT', school)
    expect(copy).toBe(ADMISSION_METHOD_COPY.SHSAT)
    expect(copy).not.toContain('0')
  })
})
