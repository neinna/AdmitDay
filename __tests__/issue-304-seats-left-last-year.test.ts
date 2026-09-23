/**
 * Issue #304: capture and show "Seats left last year" from MySchools.
 *
 * The fact must read as last year's data (never "filled every seat" --
 * that reads as a chance of admission) and the cycle label shown must come
 * from what MySchools reports, never a hardcoded year.
 */

import * as fs from 'fs'
import * as path from 'path'
import { dedupePrograms } from '@/lib/school-detail-utils'
import { School } from '@/types'

function program(overrides: Partial<School['programs'][number]>): School['programs'][number] {
  return {
    program_name: 'Dance',
    program_code: 'M80K',
    admissions_type: 'Audition',
    ...overrides,
  } as unknown as School['programs'][number]
}

describe('dedupePrograms: seats left last year', () => {
  it('renders nothing when seats_filled_last_year is absent', () => {
    const rows = dedupePrograms([program({})])
    expect(rows[0].seatsLeftLastYear).toBeUndefined()
  })

  it('renders nothing when general_education seats were all filled (true)', () => {
    const rows = dedupePrograms([
      program({ seats_filled_last_year: { general_education: true } }),
    ])
    expect(rows[0].seatsLeftLastYear).toBeUndefined()
  })

  it('surfaces the fact, with the cycle label, when general_education seats were left open (false)', () => {
    const rows = dedupePrograms([
      program({
        seats_filled_last_year: { general_education: false, students_with_disabilities: true },
        provenance: {
          source: 'MySchools',
          url: 'https://www.myschools.nyc/en/api/v2/schools/process/1/03M485/',
          fetched_at: '2026-08-07T00:00:00+00:00',
          admissions_cycle: '2025-26 School Year',
        },
      }),
    ])
    expect(rows[0].seatsLeftLastYear).toEqual({ cycle: '2025-26 School Year' })
  })
})

describe('SchoolDetailClient: seats left last year copy', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'app/school/[dbn]/SchoolDetailClient.tsx'),
    'utf8'
  )

  it('shows the "Seats left last year" label', () => {
    expect(src).toContain('Seats left last year')
  })

  it('hover text names MySchools and the cycle, and never the opposite claim', () => {
    expect(src).toContain("Some seats were still open after last year's offers")
    expect(src).not.toMatch(/filled every seat/i)
  })

  it('never hardcodes a school year in the seats-left-last-year copy', () => {
    const seatsLine = src
      .split('\n')
      .filter((l) => l.includes('Seats left last year') || l.includes('seatsLeftLastYear'))
      .join('\n')
    expect(seatsLine).not.toMatch(/20\d\d/)
  })
})
