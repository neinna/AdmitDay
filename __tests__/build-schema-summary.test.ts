import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

// Issue #321: nobody should have to open the 4 MB schools.json to learn its
// shape. scripts/build_schema_summary.py distills it into
// data/schema-summary.json -- every field name on a school record, on
// doe_data, and on a program record, with its type, a presence count, and a
// short example, plus school/program counts and a truncated sample record.
// These tests run the generator against a small synthetic fixture (never the
// real dataset) so they don't depend on schools.json being present.

const REPO_ROOT = path.join(__dirname, '..')
const SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'build_schema_summary.py')

const LONG_TEXT = 'x'.repeat(250)

const FIXTURE_SCHOOLS = [
  {
    dbn: '01M001',
    name: 'Fixture School One',
    borough: 'Manhattan',
    applicants_per_seat: 2.4,
    admissions_types: ['Screened'],
    doe_data: {
      overview: LONG_TEXT,
      graduation_rate: 0.86,
      website: 'example.org',
    },
    programs: [
      {
        dbn: '01M001',
        admissions_method: 'Ed. Opt.',
        grade_span: '9 to 12',
      },
      {
        dbn: '01M001',
        admissions_method: 'Screened',
        grade_span: '9 to 12',
        description: 'short',
      },
    ],
  },
  {
    dbn: '01M002',
    name: 'Fixture School Two',
    borough: 'Brooklyn',
    applicants_per_seat: null,
    admissions_types: [],
    doe_data: {
      overview: 'short overview',
      graduation_rate: null,
      website: 'example2.org',
    },
    programs: [
      {
        dbn: '01M002',
        admissions_method: 'Ed. Opt.',
        grade_span: '6 to 8',
      },
    ],
  },
]

function runGenerator(schools: unknown[]): { output: Record<string, unknown>; outputBytes: number } {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'schema-summary-test-'))
  const inputPath = path.join(tmpDir, 'schools.json')
  const outputPath = path.join(tmpDir, 'schema-summary.json')
  fs.writeFileSync(inputPath, JSON.stringify(schools))

  try {
    execFileSync('python3', [SCRIPT_PATH, inputPath, outputPath], { cwd: REPO_ROOT })
    const raw = fs.readFileSync(outputPath, 'utf-8')
    return { output: JSON.parse(raw), outputBytes: Buffer.byteLength(raw, 'utf-8') }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
}

interface FieldSummary {
  name: string
  type: string
  present: number
  example: unknown
}

function findField(fields: FieldSummary[], name: string): FieldSummary {
  const field = fields.find((f) => f.name === name)
  if (!field) throw new Error(`field "${name}" missing from summary`)
  return field
}

describe('scripts/build_schema_summary.py', () => {
  const { output, outputBytes } = runGenerator(FIXTURE_SCHOOLS)

  it('reports the correct school_count', () => {
    expect(output.school_count).toBe(2)
  })

  it('reports the correct program_count', () => {
    expect(output.program_count).toBe(3)
  })

  it('computes programs_per_school across the fixture', () => {
    expect(output.programs_per_school).toEqual({ min: 1, median: 1.5, max: 2 })
  })

  it('every school field appears exactly once with its type, presence count, and an example', () => {
    const fields = output.school_fields as FieldSummary[]
    const names = fields.map((f) => f.name)
    expect(new Set(names).size).toBe(names.length)
    expect(names.sort()).toEqual(
      ['admissions_types', 'applicants_per_seat', 'borough', 'dbn', 'doe_data', 'name', 'programs'].sort()
    )

    expect(findField(fields, 'applicants_per_seat')).toMatchObject({ type: 'number|null', present: 1, example: 2.4 })
    expect(findField(fields, 'dbn')).toMatchObject({ type: 'string', present: 2, example: '01M001' })
  })

  it('every doe_data field appears exactly once with its type, presence count, and an example', () => {
    const fields = output.doe_data_fields as FieldSummary[]
    expect(fields.map((f) => f.name).sort()).toEqual(['graduation_rate', 'overview', 'website'])
    expect(findField(fields, 'graduation_rate')).toMatchObject({ type: 'number|null', present: 1, example: 0.86 })
    expect(findField(fields, 'website')).toMatchObject({ type: 'string', present: 2 })
  })

  it('every program field appears exactly once with its type, presence count, and an example', () => {
    const fields = output.program_fields as FieldSummary[]
    expect(fields.map((f) => f.name).sort()).toEqual(
      ['admissions_method', 'dbn', 'description', 'grade_span'].sort()
    )
    expect(findField(fields, 'description')).toMatchObject({ type: 'string', present: 1, example: 'short' })
    expect(findField(fields, 'admissions_method')).toMatchObject({ type: 'string', present: 3 })
  })

  it('counts admissions_method values across all programs', () => {
    expect(output.admissions_methods).toEqual(
      expect.arrayContaining([
        { value: 'Ed. Opt.', count: 2 },
        { value: 'Screened', count: 1 },
      ])
    )
  })

  it('truncates a long doe_data string in the example to 200 characters', () => {
    const fields = output.doe_data_fields as FieldSummary[]
    const overview = findField(fields, 'overview')
    expect(typeof overview.example).toBe('string')
    expect((overview.example as string).length).toBeLessThanOrEqual(201) // 200 chars + truncation marker
    expect((overview.example as string).length).toBeLessThan(LONG_TEXT.length)
  })

  it('truncates a long string inside sample_school', () => {
    const sample = output.sample_school as Record<string, unknown>
    const doeData = sample.doe_data as Record<string, unknown>
    expect((doeData.overview as string).length).toBeLessThanOrEqual(201)
  })

  it('never invents a field that is not in the source data', () => {
    const allFieldNames = [
      ...(output.school_fields as FieldSummary[]),
      ...(output.doe_data_fields as FieldSummary[]),
      ...(output.program_fields as FieldSummary[]),
    ].map((f) => f.name)
    expect(allFieldNames).not.toContain('total_students') // never present in the fixture
  })

  it('stays well under the ~50 KB size ceiling', () => {
    expect(outputBytes).toBeLessThan(50 * 1024)
  })

  it('includes an ISO-ish generated_at timestamp', () => {
    expect(typeof output.generated_at).toBe('string')
    expect(new Date(output.generated_at as string).toString()).not.toBe('Invalid Date')
  })
})

// ── open_house / hours / school_website (issue #346) ────────────────────────
// These are top-level, optional school fields MySchools publishes directly
// (open-house text + when it was fetched, school hours, independent
// website). Most schools have none of them -- absence must produce no key,
// never an empty string -- so this uses its own fixture rather than adding
// the fields to FIXTURE_SCHOOLS above, which would change the exact field
// lists other tests in this file already assert on.

const OPEN_HOUSE_FIXTURE_SCHOOLS = [
  {
    dbn: '01M001',
    name: 'Fixture School With Open House',
    borough: 'Manhattan',
    admissions_types: [],
    programs: [],
    open_house: { text: 'Wed Oct 15, 6:00pm - 8:00pm', fetched_at: '2026-09-01T00:00:00+00:00' },
    hours: { start: '08:00am', end: '03:00pm' },
    school_website: 'https://example.org/',
  },
  {
    dbn: '01M002',
    name: 'Fixture School Without Open House',
    borough: 'Brooklyn',
    admissions_types: [],
    programs: [],
  },
]

describe('scripts/build_schema_summary.py -- open_house/hours/school_website (#346)', () => {
  const { output } = runGenerator(OPEN_HOUSE_FIXTURE_SCHOOLS)

  it('includes open_house, hours, and school_website in school_fields, present on only one of two schools', () => {
    const fields = output.school_fields as FieldSummary[]
    expect(findField(fields, 'open_house')).toMatchObject({ type: 'object', present: 1 })
    expect(findField(fields, 'hours')).toMatchObject({ type: 'object', present: 1 })
    expect(findField(fields, 'school_website')).toMatchObject({
      type: 'string',
      present: 1,
      example: 'https://example.org/',
    })
  })

  it('describes open_house sub-fields (text, fetched_at) the same way doe_data sub-fields are described', () => {
    const fields = output.open_house_fields as FieldSummary[]
    expect(fields.map((f) => f.name).sort()).toEqual(['fetched_at', 'text'])
    expect(findField(fields, 'text')).toMatchObject({
      type: 'string',
      present: 1,
      example: 'Wed Oct 15, 6:00pm - 8:00pm',
    })
  })

  it('describes hours sub-fields (start, end)', () => {
    const fields = output.hours_fields as FieldSummary[]
    expect(fields.map((f) => f.name).sort()).toEqual(['end', 'start'])
    expect(findField(fields, 'start')).toMatchObject({ type: 'string', present: 1, example: '08:00am' })
  })

  it('does not invent open_house/hours fields for the school missing them', () => {
    // Second fixture school has neither key -- open_house_fields/hours_fields
    // must describe only the one record that actually has them, not both.
    const openHouseFields = output.open_house_fields as FieldSummary[]
    const hoursFields = output.hours_fields as FieldSummary[]
    expect(openHouseFields.every((f) => f.present === 1)).toBe(true)
    expect(hoursFields.every((f) => f.present === 1)).toBe(true)
  })
})

describe('data/schema-summary.json (committed artifact)', () => {
  const summaryPath = path.join(REPO_ROOT, 'data', 'schema-summary.json')
  const summaryAvailable = fs.existsSync(summaryPath)

  ;(summaryAvailable ? it : it.skip)('stays under the ~50 KB size ceiling', () => {
    const bytes = fs.statSync(summaryPath).size
    expect(bytes).toBeLessThan(50 * 1024)
  })
})
