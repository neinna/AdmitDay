/**
 * __tests__/find-sort-toggle.test.ts
 *
 * Issue #400 — with no ask and no filters, every school's `missing.length`
 * was 0, so the old "Sorted by fit" comparator returned 0 throughout and the
 * list just kept its incoming DBN-ascending order. The header claimed a
 * ranking the code never performed. This replaces it with a real two-option
 * sort (Results / Fewest applicants) that FindClient's rankFindRows applies
 * whenever askReasons is empty; the ask ordering (issue #329) is untouched
 * when reasons are present.
 */

import { rankFindRows } from '../app/find/FindClient'
import { School } from '../types'

function makeSchool(overrides: Partial<School> & { dbn?: string } = {}): School {
  return {
    dbn: overrides.dbn ?? 'X000',
    name: overrides.name ?? 'Test School',
    borough: overrides.borough ?? 'Brooklyn',
    size: overrides.size ?? 'medium',
    total_students: null,
    applicants_per_seat: null,
    admissions_types: overrides.admissions_types ?? [],
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

describe('rankFindRows sort toggle (issue #400)', () => {
  const high = makeSchool({ dbn: 'HIGH', sqr: { performance_pctl: 90 } })
  const low = makeSchool({ dbn: 'LOW', sqr: { performance_pctl: 20 } })
  const none = makeSchool({ dbn: 'NONE' })
  const hardFiltered = [low, none, high]
  const annotated = [
    { school: low, missing: [] },
    { school: none, missing: [] },
    { school: high, missing: [] },
  ]

  it('(a) Results puts the higher performance_pctl first', () => {
    const ranked = rankFindRows(hardFiltered, annotated, [], 'results')
    expect(ranked.map((r) => r.school.dbn)).toEqual(['HIGH', 'LOW', 'NONE'])
  })

  it('(c) Results sorts a school with no sqr last', () => {
    const ranked = rankFindRows(hardFiltered, annotated, [], 'results')
    expect(ranked[ranked.length - 1].school.dbn).toBe('NONE')
  })

  it('defaults to Results when no sortMode is passed', () => {
    const ranked = rankFindRows(hardFiltered, annotated, [])
    expect(ranked.map((r) => r.school.dbn)).toEqual(['HIGH', 'LOW', 'NONE'])
  })

  describe('Fewest applicants', () => {
    const few = makeSchool({ dbn: 'FEW', applicants_per_seat: 1.2 })
    const many = makeSchool({ dbn: 'MANY', applicants_per_seat: 8.5 })
    const unknown = makeSchool({ dbn: 'UNKNOWN', applicants_per_seat: null })
    const hf = [many, unknown, few]
    const ann = [
      { school: many, missing: [] },
      { school: unknown, missing: [] },
      { school: few, missing: [] },
    ]

    it('(b) puts the lower applicants_per_seat first', () => {
      const ranked = rankFindRows(hf, ann, [], 'fewest_applicants')
      expect(ranked.map((r) => r.school.dbn)).toEqual(['FEW', 'MANY', 'UNKNOWN'])
    })

    it('(c) sorts a school with no applicants_per_seat last', () => {
      const ranked = rankFindRows(hf, ann, [], 'fewest_applicants')
      expect(ranked[ranked.length - 1].school.dbn).toBe('UNKNOWN')
    })
  })

  it('distance still breaks ties in both modes (issue #344)', () => {
    const a = makeSchool({ dbn: 'A', sqr: { performance_pctl: 50 } })
    const b = makeSchool({ dbn: 'B', sqr: { performance_pctl: 50 } })
    const ann = [
      { school: a, missing: [], distance: 3 },
      { school: b, missing: [], distance: 1 },
    ]
    const ranked = rankFindRows([a, b], ann, [], 'results')
    expect(ranked.map((r) => r.school.dbn)).toEqual(['B', 'A'])
  })

  it('(d) with ask reasons present, the toggle does not reorder — the reasons order wins regardless of sortMode', () => {
    const reasons = [
      { dbn: 'LOW', reason: 'Great fit.' },
      { dbn: 'HIGH', reason: 'Also a good fit.' },
    ]
    const resultsOrder = rankFindRows(hardFiltered, annotated, reasons, 'results').map((r) => r.school.dbn)
    const fewestOrder = rankFindRows(hardFiltered, annotated, reasons, 'fewest_applicants').map(
      (r) => r.school.dbn
    )
    expect(resultsOrder).toEqual(['LOW', 'HIGH'])
    expect(fewestOrder).toEqual(['LOW', 'HIGH'])
  })
})

// ── Source-text assertions for the toggle UI (no jsdom in this repo's jest
// config — see __tests__/find-row-affordance.test.ts's convention) ─────────

import * as fs from 'fs'
import * as path from 'path'

function readSource(relPath: string): string {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf-8')
}

const src = readSource('app/find/FindClient.tsx')

describe('the sort toggle UI (issue #400)', () => {
  it('declares sortMode state defaulting to results', () => {
    expect(src).toContain("const [sortMode, setSortMode] = useState<FindSortMode>('results')")
  })

  it('offers exactly a Results and a Fewest applicants option', () => {
    expect(src).toContain('Results')
    expect(src).toContain('Fewest applicants')
  })

  it('only shows the toggle when askReasons is empty; ask ordering still reads "Sorted by your ask"', () => {
    expect(src).toContain("askReasons.length > 0 ? (\n                'Sorted by your ask'")
  })

  it('passes sortMode into rankFindRows', () => {
    expect(src).toContain('rankFindRows(hardFiltered, annotated, askReasons, sortMode)')
  })
})
