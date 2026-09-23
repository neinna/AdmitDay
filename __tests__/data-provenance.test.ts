import fs from 'fs'
import path from 'path'
import {
  DATA_SOURCES,
  DOE_DATASET_ID,
  DOE_DATASET_PUBLISHED,
  SQR_DATASET_ID,
  SQR_DATASET_PUBLISHED,
  buildProvenanceRows,
  summariseDataVintage,
  type SourceProvenance,
} from '@/lib/data-provenance'

/**
 * Issue #138. The app used to stamp every record `last_verified: "2025-2026"`
 * and render it as the cycle the data was verified for — while the DOE half of
 * that record came from NYC Open Data `uq7m-95z8`, the *2019* directory, whose
 * data was dated 2018-08-16.
 *
 * Telling a family that stale requirements were verified for the current cycle
 * is the one failure mode that can actually harm them. These tests exist so the
 * claim cannot quietly return — including via a future data-source change.
 *
 * Issue #289 replaced that 2018 dataset with the Fall 2025 InfoHub HS
 * directory (plus School Quality Reports 2024-25 for attendance and a
 * graduation-rate fallback); the literal vintage asserted below moved with it.
 *
 * Issue #337 removed NYC-SIFT as a source entirely; the remaining sources are
 * MySchools, the DOE HS Directory (Fall 2025), and the DOE School Quality
 * Reports (2024-25).
 */

describe('data provenance — sources', () => {
  it('describes the DOE directory with its real published year, not the current cycle', () => {
    const doe = DATA_SOURCES.find((s) => s.key === 'doe-directory')
    expect(doe).toBeDefined()
    expect(doe!.publishedLabel).toBe(DOE_DATASET_PUBLISHED)
    expect(DOE_DATASET_PUBLISHED).toBe('Fall 2025')
    expect(doe!.url).toContain(DOE_DATASET_ID)
  })

  it('describes the School Quality Reports with their real published year', () => {
    const sqr = DATA_SOURCES.find((s) => s.key === 'sqr')
    expect(sqr).toBeDefined()
    expect(sqr!.publishedLabel).toBe(SQR_DATASET_PUBLISHED)
    expect(SQR_DATASET_PUBLISHED).toBe('2024-25')
    expect(sqr!.url).toContain(SQR_DATASET_ID)
  })

  it('claims no vintage for MySchools, because no fetch date is recorded yet', () => {
    const myschools = DATA_SOURCES.find((s) => s.key === 'myschools')
    expect(myschools).toBeDefined()
    // Honest absence: we do not capture a scrape date, so we assert none.
    expect(myschools!.publishedLabel).toBeNull()
  })

  it('covers the whole record across its three sources, so nothing is silently unattributed', () => {
    expect(DATA_SOURCES).toHaveLength(3)
    const covers = DATA_SOURCES.map((s) => s.covers.toLowerCase()).join(' ')
    expect(covers).toContain('requirements')
    expect(covers).toContain('applicants per seat')
  })
})

describe('data provenance — rendered rows', () => {
  it('renders one row per source, naming what each supplies', () => {
    const rows = buildProvenanceRows()
    expect(rows).toHaveLength(DATA_SOURCES.length)
    expect(rows.map((r) => r.key).sort()).toEqual(['doe-directory', 'myschools', 'sqr'])
  })

  it('shows a published year only for the sources that have one', () => {
    const rows = buildProvenanceRows()
    const doe = rows.find((r) => r.key === 'doe-directory')!
    const sqr = rows.find((r) => r.key === 'sqr')!
    const myschools = rows.find((r) => r.key === 'myschools')!
    expect(doe.value).toContain('published Fall 2025')
    expect(sqr.value).toContain('published 2024-25')
    expect(myschools.value).not.toMatch(/published/i)
  })

  it('never presents the current admissions cycle as a verification date', () => {
    const rendered = buildProvenanceRows()
      .map((r) => `${r.label} ${r.value}`)
      .join(' ')
    expect(rendered).not.toMatch(/2025-?2026|2025–26|2026-?2027|2026–27/)
    expect(rendered).not.toMatch(/verified/i)
  })
})

describe('data provenance — summary line', () => {
  it('reports the oldest known vintage, since that is the honest summary', () => {
    const note = summariseDataVintage()
    expect(note).toContain('2024-25')
    expect(note).toMatch(/confirm at MySchools/i)
  })

  it('does not imply the data was verified for the current cycle', () => {
    const note = summariseDataVintage() ?? ''
    expect(note).not.toMatch(/2025-?2026|2025–26|verified/i)
  })

  it('renders nothing rather than hedging when no vintage is known', () => {
    const unknown: SourceProvenance[] = [
      { key: 'myschools', label: 'X', covers: 'y', publishedLabel: null, url: 'https://example.com' },
    ]
    expect(summariseDataVintage(unknown)).toBeNull()
  })
})

describe('the school page does not re-introduce the typed claim', () => {
  const pageSource = fs.readFileSync(
    path.join(__dirname, '../app/school/[dbn]/page.tsx'),
    'utf-8'
  )

  it('derives provenance from the sources rather than from last_verified', () => {
    expect(pageSource).toContain('buildProvenanceRows')
    // `last_verified` is a typed string on the record; it must not be the basis
    // of anything the page presents as provenance.
    expect(pageSource).not.toMatch(/formatAdmissionsCycle\s*\(\s*school\.last_verified/)
  })

  it('hardcodes no admissions-cycle string in the page', () => {
    expect(pageSource).not.toMatch(/['"`]20\d\d-20\d\d['"`]/)
  })
})
