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

describe('data/schema-summary.json (committed artifact)', () => {
  const summaryPath = path.join(REPO_ROOT, 'data', 'schema-summary.json')
  const summaryAvailable = fs.existsSync(summaryPath)

  ;(summaryAvailable ? it : it.skip)('stays under the ~50 KB size ceiling', () => {
    const bytes = fs.statSync(summaryPath).size
    expect(bytes).toBeLessThan(50 * 1024)
  })
})
