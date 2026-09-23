/**
 * __tests__/find-ask-ranking.test.ts
 *
 * Issue #329 — the /find ask result reorders and annotates the existing rows
 * instead of showing a prose essay above them. #328 made the ask endpoint
 * return `reasons: { dbn, reason }[]` in ranked order; this file exercises
 * app/find/FindClient.tsx's rankFindRows (the pure row-ranking function
 * extracted for this issue) directly, plus source-text assertions for the
 * render pieces this repo's jsdom-less jest config can't otherwise exercise
 * (see __tests__/find-row-affordance.test.ts's convention).
 */

import * as fs from 'fs'
import * as path from 'path'
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

describe('rankFindRows (issue #329)', () => {
  const A = makeSchool({ dbn: 'A' })
  const B = makeSchool({ dbn: 'B' })
  const C = makeSchool({ dbn: 'C' })
  const hardFiltered = [A, B, C]
  const annotated = [
    { school: A, missing: ['sport'] },
    { school: B, missing: [] },
    { school: C, missing: ['neighborhood', 'sport'] },
  ]

  it('with no ask reasons, falls back to the existing fit ordering unchanged', () => {
    const ranked = rankFindRows(hardFiltered, annotated, [])
    expect(ranked).toEqual(
      [...annotated].sort((a, b) => a.missing.length - b.missing.length)
    )
    expect(ranked.map((r) => r.school.dbn)).toEqual(['B', 'A', 'C'])
    expect(ranked.length).toBe(hardFiltered.length)
  })

  it('with reasons present, rows render in the reasons order, restricted to those DBNs, each carrying its reason', () => {
    const reasons = [
      { dbn: 'C', reason: 'Strong robotics program.' },
      { dbn: 'A', reason: 'Small class sizes.' },
    ]
    const ranked = rankFindRows(hardFiltered, annotated, reasons)
    expect(ranked.map((r) => r.school.dbn)).toEqual(['C', 'A'])
    expect(ranked.map((r) => r.reason)).toEqual(['Strong robotics program.', 'Small class sizes.'])
    // B never appears — it has no reason.
    expect(ranked.some((r) => r.school.dbn === 'B')).toBe(false)
  })

  it('a reason whose DBN the active rail filters exclude does not produce a row', () => {
    // Rail filters (applyFindFilters) already dropped D from hardFiltered —
    // the ask must never resurrect a school outside the hard floor.
    const reasons = [
      { dbn: 'D', reason: 'Would match, but filtered out by the rail.' },
      { dbn: 'A', reason: 'Small class sizes.' },
    ]
    const ranked = rankFindRows(hardFiltered, annotated, reasons)
    expect(ranked.map((r) => r.school.dbn)).toEqual(['A'])
    expect(ranked.every((r) => r.school.dbn !== 'D')).toBe(true)
  })

  it('every ranked row has a reason when reasons are active — none render without one', () => {
    const reasons = [
      { dbn: 'A', reason: 'Small class sizes.' },
      { dbn: 'B', reason: 'Great soccer team.' },
    ]
    const ranked = rankFindRows(hardFiltered, annotated, reasons)
    expect(ranked.every((r) => typeof r.reason === 'string' && r.reason.length > 0)).toBe(true)
  })
})

// ── Source-text assertions for the render pieces (no jsdom in this repo's
// jest config — see __tests__/find-row-affordance.test.ts) ─────────────────

function readSource(relPath: string): string {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf-8')
}

const src = readSource('app/find/FindClient.tsx')

describe('/find ask box holds and clears askReasons (issue #329)', () => {
  it('declares askReasons state alongside the existing askSources', () => {
    expect(src).toContain(
      "const [askReasons, setAskReasons] = useState<AskReason[]>([])"
    )
  })

  it('clears askReasons before the empty-question guard, so both a new ask and a cleared ask box reset it', () => {
    const submitIdx = src.indexOf('async function handleAskSubmit')
    const clearIdx = src.indexOf('setAskReasons([])', submitIdx)
    const guardIdx = src.indexOf('if (!trimmed) return', submitIdx)
    expect(clearIdx).toBeGreaterThan(-1)
    expect(guardIdx).toBeGreaterThan(-1)
    // Runs before the guard, so it fires whether trimmed is empty (ask
    // cleared) or not (a new ask starting) — one reset point for both.
    expect(clearIdx).toBeLessThan(guardIdx)
  })

  it('populates askReasons from data.reasons on a successful response', () => {
    expect(src).toContain('Array.isArray(data.reasons) ? data.reasons : []')
    expect(src).toContain('setAskReasons(reasons)')
  })
})

describe('the row list ranking uses rankFindRows (issue #329)', () => {
  it('ranked is computed from hardFiltered, annotated, and askReasons', () => {
    expect(src).toContain('rankFindRows(hardFiltered, annotated, askReasons)')
  })
})

describe('each ranked row shows its reason in the row stat-line muted style (issue #329)', () => {
  it('renders the reason as a single line using the same text-[12.5px] text-faint class as the stat evidence', () => {
    expect(src).toContain("{reason && <p className=\"text-[12.5px] text-faint\">{reason}</p>}")
  })

  it('destructures reason off each visible row', () => {
    expect(src).toContain('visible.map(({ school, reason }, i) => {')
  })
})

describe('the prose answer block is gone; the error path is untouched (issue #329)', () => {
  it('no longer renders the askAnswer paragraph', () => {
    expect(src).not.toMatch(/\{askAnswer\}/)
  })

  it('no longer renders the askSources list', () => {
    expect(src).not.toContain('askSources.map')
    expect(src).not.toMatch(/Sources\s*<\/h2>/)
  })

  it('still renders askAnswerError in an alert paragraph, unchanged', () => {
    expect(src).toContain('{askAnswerError && (')
    expect(src).toContain('role="alert"')
    expect(src).toContain('{askAnswerError}')
  })

  it('still renders FeedbackRow for a successful, non-error answer (issue #195 rating flow, untouched by #329)', () => {
    expect(src).toContain("import FeedbackRow from '@/components/FeedbackRow'")
    expect(src).toContain(
      '<FeedbackRow key={askTraceId ?? \'no-trace\'} screen="find_ask" traceId={askTraceId ?? undefined} />'
    )
  })

  it('keeps the loading line and the Applied signals chips untouched', () => {
    expect(src).toContain('Searching schools and generating an answer…')
    expect(src).toContain('Applied')
    expect(src).toContain('onClick={() => removeChip(signal.kind, signal.value)}')
  })
})

describe('the result-count header reports the ranked row count (issue #329)', () => {
  it('the count above the rows reads off ranked.length, which rankFindRows already restricts when an ask is active', () => {
    const headerIdx = src.indexOf('match{ranked.length === 1')
    expect(headerIdx).toBeGreaterThan(-1)
    const before = src.slice(Math.max(0, headerIdx - 200), headerIdx)
    expect(before).toContain('{ranked.length}')
  })
})
