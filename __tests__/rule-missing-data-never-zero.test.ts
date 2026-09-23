/**
 * Issue #127, rule 4: missing data is never rendered as zero.
 *
 * A school lacking a statistic must render NOTHING for it — not `0`, not
 * `—`, not an empty cell — while a genuine DOE-reported 0 must still show.
 * A parent reads "0 applicants per seat" as a fact about the school rather
 * than a gap in DOE data, so this is tested per-field (not just the one
 * field lib/school-detail-utils.ts's own tests happen to cover) and,
 * separately, against every school in the real dataset.
 */

import * as fs from 'fs'
import * as path from 'path'
import { buildStatCells, getMissingStatLabels, StatCell } from '../lib/school-detail-utils'
import { School } from '../types'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeSchool(
  overrides: Partial<Omit<School, 'sqr'>> & { dbn?: string; academic_score_pct?: number | null } = {}
): School {
  const { academic_score_pct, ...schoolOverrides } = overrides
  return {
    dbn: schoolOverrides.dbn ?? 'X000',
    name: schoolOverrides.name ?? 'Test School',
    borough: schoolOverrides.borough ?? 'Brooklyn',
    size: schoolOverrides.size ?? 'medium',
    total_students: null,
    applicants_per_seat: null,
    sqr: academic_score_pct != null ? { performance_pctl: academic_score_pct } : undefined,
    admissions_types: [],
    programs: [],
    flags: {
      has_shsat: false,
      has_audition: false,
      has_screened: false,
      has_open: false,
      has_borough_priority: false,
      high_impact: false,
      has_consortium: false,
      has_ib: false,
      ...schoolOverrides.flags,
    },
    doe_data: {
      overview: '',
      language: '',
      extracurriculars: '',
      website: '',
      phone: '',
      address: '',
      zip: '',
      ...schoolOverrides.doe_data,
    },
    last_verified: '',
    ...schoolOverrides,
  }
}

/** Fails with a message naming the rule, not just a bare assertion diff. */
function assertNotZeroed(cells: StatCell[], label: string, fieldKey: string) {
  const cell = cells.find((c) => c.key === fieldKey)
  if (cell !== undefined) {
    throw new Error(
      `Rule (issue #127, rule 4): missing data is never rendered as zero. "${label}" is absent (null) on ` +
        `this school, but buildStatCells still produced a cell for it (value "${cell.value}"). A parent ` +
        `reads a rendered zero/dash as a fact about the school, not a gap in DOE data — the field must be ` +
        `omitted entirely.`
    )
  }
}

// Every stat field this rule governs, each with a plausible genuine-zero
// value distinct from "absent".
const ZERO_CASES: { key: string; label: string; overrides: Partial<School> }[] = [
  { key: 'applicantsPerSeat', label: 'Applicants per seat', overrides: { applicants_per_seat: 0 } },
  { key: 'totalStudents', label: 'Total students', overrides: { total_students: 0 } },
  { key: 'results', label: 'Results', overrides: { sqr: { performance_pctl: 0 } } },
  { key: 'impact', label: 'Impact', overrides: { sqr: { impact_pctl: 0 } } },
  {
    key: 'graduationRate',
    label: 'Graduation rate',
    overrides: { doe_data: { overview: '', language: '', extracurriculars: '', website: '', phone: '', address: '', zip: '', graduation_rate: 0 } },
  },
  {
    key: 'attendanceRate',
    label: 'Attendance rate',
    overrides: { doe_data: { overview: '', language: '', extracurriculars: '', website: '', phone: '', address: '', zip: '', attendance_rate: 0 } },
  },
  {
    key: 'collegeCareerRate',
    label: 'College and career',
    overrides: { doe_data: { overview: '', language: '', extracurriculars: '', website: '', phone: '', address: '', zip: '', college_career_rate: 0 } },
  },
]

describe('Rule #127.4: missing data is never rendered as zero (per-field)', () => {
  it.each(ZERO_CASES)('$label: absent (null) renders no cell at all', ({ key, label }) => {
    const school = makeSchool() // every stat field null by default
    const cells = buildStatCells(school)
    assertNotZeroed(cells, label, key)
    expect(getMissingStatLabels(school).length).toBeGreaterThan(0)
  })

  it.each(ZERO_CASES)('$label: a genuine DOE-reported 0 IS rendered — distinguishable from absence', ({ key, label, overrides }) => {
    const school = makeSchool(overrides)
    const cells = buildStatCells(school)
    const cell = cells.find((c) => c.key === key)
    if (!cell) {
      throw new Error(
        `Rule (issue #127, rule 4): missing data is never rendered as zero — the flip side also matters. ` +
          `"${label}" was set to a genuine 0 on this school, but buildStatCells omitted it entirely, as if ` +
          `it were absent. A real zero must still be distinguishable from a missing value.`
      )
    }
    expect(cell.value).not.toBe('')
  })

  it('never emits the literal string "0" or "—" as a cell value when every field is null', () => {
    const school = makeSchool()
    const cells = buildStatCells(school)
    expect(cells).toEqual([])
    expect(cells.map((c) => c.value)).not.toContain('0')
    expect(cells.map((c) => c.value)).not.toContain('—')
  })
})

// ── Real, full-size dataset ─────────────────────────────────────────────────
// See LESSONS.md: schools.json is the tracked root-level scrape output,
// present in every checkout including CI, and matches the School shape.

const SCHOOLS_PATH = path.resolve(__dirname, '../schools.json')
const dataAvailable = fs.existsSync(SCHOOLS_PATH)

if (!dataAvailable) {
  // eslint-disable-next-line no-console
  console.warn(
    `[rule-missing-data-never-zero] ${SCHOOLS_PATH} not found -- skipping real-dataset checks ` +
      '(no data source available in this environment).'
  )
}

const realSchools: School[] = dataAvailable
  ? JSON.parse(fs.readFileSync(SCHOOLS_PATH, 'utf-8'))
  : []

;(dataAvailable ? describe : describe.skip)(
  'Rule #127.4: missing data is never rendered as zero (real dataset)',
  () => {
    it('loads a non-trivial number of real schools to test against', () => {
      expect(realSchools.length).toBeGreaterThan(100)
    })

    it('every real school with a stat field genuinely absent (null/undefined) never gets a cell for it', () => {
      const violations: string[] = []
      const fieldGetters: [string, (s: School) => number | null | undefined][] = [
        ['applicantsPerSeat', (s) => s.applicants_per_seat],
        ['totalStudents', (s) => s.total_students],
        ['results', (s) => s.sqr?.performance_pctl],
        ['impact', (s) => s.sqr?.impact_pctl],
        ['graduationRate', (s) => s.doe_data?.graduation_rate],
        ['attendanceRate', (s) => s.doe_data?.attendance_rate],
        ['collegeCareerRate', (s) => s.doe_data?.college_career_rate],
      ]
      for (const school of realSchools) {
        const cells = buildStatCells(school)
        for (const [key, get] of fieldGetters) {
          const raw = get(school)
          const isAbsent = raw === null || raw === undefined
          const hasCell = cells.some((c) => c.key === key)
          if (isAbsent && hasCell) {
            violations.push(`${school.dbn} (${school.name}): ${key} is absent but rendered a cell`)
          }
        }
      }
      if (violations.length > 0) {
        throw new Error(
          `Rule (issue #127, rule 4): missing data is never rendered as zero. Found ${violations.length} ` +
            `real school(s) where an absent field still produced a rendered stat cell:\n${violations.join('\n')}`
        )
      }
      expect(violations).toEqual([])
    })
  }
)
