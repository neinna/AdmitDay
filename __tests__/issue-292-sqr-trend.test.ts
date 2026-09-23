/**
 * Issue #292: Results and Impact trend over the last 4 reported years on the
 * school page. school.sqr_history holds one entry per year DOE actually
 * published a numeric score for -- a year it didn't is left out entirely,
 * never zeroed (same convention as school.sqr and buildStatCells).
 */

import { School, SchoolFlags, SqrHistoryEntry } from '../types'
import {
  buildTrendPoints,
  buildTrendText,
  buildImpactBadge,
  buildSqrTrends,
  TrendPoint,
} from '../lib/school-detail-utils'

function makeFlags(overrides: Partial<SchoolFlags> = {}): SchoolFlags {
  return {
    has_shsat: false,
    has_audition: false,
    has_screened: false,
    has_open: false,
    has_borough_priority: false,
    high_impact: false,
    has_consortium: false,
    has_ib: false,
    ...overrides,
  }
}

function makeSchool(sqr_history?: SqrHistoryEntry[]): School {
  return {
    dbn: 'X000',
    name: 'Test School',
    borough: 'Brooklyn',
    size: 'medium',
    total_students: null,
    applicants_per_seat: null,
    sqr_history,
    admissions_types: [],
    programs: [],
    doe_data: {
      overview: '',
      language: '',
      extracurriculars: '',
      website: '',
      phone: '',
      address: '',
      zip: '',
    },
    last_verified: '',
    flags: makeFlags(),
  }
}

const RISE_HISTORY: SqrHistoryEntry[] = [
  { year: '2021-22', impact_pctl: 62, performance_pctl: 40 },
  { year: '2022-23', impact_pctl: 71, performance_pctl: 45 },
  { year: '2023-24', impact_pctl: 80, performance_pctl: 50 },
  { year: '2024-25', impact_pctl: 89, performance_pctl: 55 },
]

// ── buildTrendPoints: a missing year is skipped, not zeroed ────────────────

describe('buildTrendPoints', () => {
  it('returns one point per year that published this metric, oldest first', () => {
    expect(buildTrendPoints(RISE_HISTORY, 'impact')).toEqual([
      { year: '2021-22', pctl: 62 },
      { year: '2022-23', pctl: 71 },
      { year: '2023-24', pctl: 80 },
      { year: '2024-25', pctl: 89 },
    ])
  })

  it('skips a year missing from the history instead of inserting a zero', () => {
    const history: SqrHistoryEntry[] = [
      { year: '2021-22', impact_pctl: 62 },
      { year: '2022-23' }, // DOE published no impact score this year
      { year: '2023-24', impact_pctl: 75 },
      { year: '2024-25', impact_pctl: 89 },
    ]
    expect(buildTrendPoints(history, 'impact')).toEqual([
      { year: '2021-22', pctl: 62 },
      { year: '2023-24', pctl: 75 },
      { year: '2024-25', pctl: 89 },
    ])
  })

  it('returns [] when sqr_history is undefined', () => {
    expect(buildTrendPoints(undefined, 'impact')).toEqual([])
  })

  it('reads performance and impact independently', () => {
    const history: SqrHistoryEntry[] = [{ year: '2024-25', performance_pctl: 55 }]
    expect(buildTrendPoints(history, 'performance')).toEqual([{ year: '2024-25', pctl: 55 }])
    expect(buildTrendPoints(history, 'impact')).toEqual([])
  })
})

// ── buildTrendText: a rise, a fall, and a single year ───────────────────────

describe('buildTrendText', () => {
  it('formats a rise with an arrow and the full year range, matching the issue example', () => {
    const points: TrendPoint[] = [
      { year: '2021-22', pctl: 62 },
      { year: '2024-25', pctl: 89 },
    ]
    expect(buildTrendText(points, 'Impact')).toBe('Impact: 62nd → 89th percentile, 2021-22 to 2024-25')
  })

  it('formats a fall the same way -- declines read identically to rises', () => {
    const points: TrendPoint[] = [
      { year: '2021-22', pctl: 80 },
      { year: '2024-25', pctl: 55 },
    ]
    expect(buildTrendText(points, 'Results')).toBe('Results: 80th → 55th percentile, 2021-22 to 2024-25')
  })

  it('drops the arrow and range for a single reported year', () => {
    const points: TrendPoint[] = [{ year: '2024-25', pctl: 64 }]
    expect(buildTrendText(points, 'Impact')).toBe('Impact: 64th percentile, 2024-25')
  })

  it('returns null when there is no data at all', () => {
    expect(buildTrendText([], 'Impact')).toBeNull()
  })

  it('uses correct ordinal suffixes (1st/2nd/3rd/11th-13th exceptions)', () => {
    expect(buildTrendText([{ year: '2024-25', pctl: 1 }], 'Impact')).toContain('1st percentile')
    expect(buildTrendText([{ year: '2024-25', pctl: 2 }], 'Impact')).toContain('2nd percentile')
    expect(buildTrendText([{ year: '2024-25', pctl: 3 }], 'Impact')).toContain('3rd percentile')
    expect(buildTrendText([{ year: '2024-25', pctl: 11 }], 'Impact')).toContain('11th percentile')
    expect(buildTrendText([{ year: '2024-25', pctl: 12 }], 'Impact')).toContain('12th percentile')
    expect(buildTrendText([{ year: '2024-25', pctl: 13 }], 'Impact')).toContain('13th percentile')
    expect(buildTrendText([{ year: '2024-25', pctl: 21 }], 'Impact')).toContain('21st percentile')
  })
})

// ── buildImpactBadge: "Impact up 3 years running" edge cases ───────────────

describe('buildImpactBadge', () => {
  it('awards the badge when impact rose in each of the last 3 steps by 10+ points total', () => {
    const points = buildTrendPoints(RISE_HISTORY, 'impact')
    expect(buildImpactBadge(points)).toBe('Impact up 3 years running')
  })

  it('returns null with fewer than 4 points (not enough steps to prove "3 years running")', () => {
    const points: TrendPoint[] = [
      { year: '2022-23', pctl: 71 },
      { year: '2023-24', pctl: 80 },
      { year: '2024-25', pctl: 89 },
    ]
    expect(buildImpactBadge(points)).toBeNull()
  })

  it('returns null when one of the last 3 steps is flat', () => {
    const points: TrendPoint[] = [
      { year: '2021-22', pctl: 62 },
      { year: '2022-23', pctl: 62 },
      { year: '2023-24', pctl: 75 },
      { year: '2024-25', pctl: 89 },
    ]
    expect(buildImpactBadge(points)).toBeNull()
  })

  it('returns null when one of the last 3 steps declines', () => {
    const points: TrendPoint[] = [
      { year: '2021-22', pctl: 70 },
      { year: '2022-23', pctl: 85 },
      { year: '2023-24', pctl: 80 },
      { year: '2024-25', pctl: 95 },
    ]
    expect(buildImpactBadge(points)).toBeNull()
  })

  it('returns null when every step rises but the total rise is under 10 points', () => {
    const points: TrendPoint[] = [
      { year: '2021-22', pctl: 60 },
      { year: '2022-23', pctl: 62 },
      { year: '2023-24', pctl: 65 },
      { year: '2024-25', pctl: 68 },
    ]
    expect(buildImpactBadge(points)).toBeNull()
  })

  it('awards the badge when the total rise is exactly 10 points', () => {
    const points: TrendPoint[] = [
      { year: '2021-22', pctl: 60 },
      { year: '2022-23', pctl: 63 },
      { year: '2023-24', pctl: 66 },
      { year: '2024-25', pctl: 70 },
    ]
    expect(buildImpactBadge(points)).toBe('Impact up 3 years running')
  })

  it('only looks at the last 3 steps when there are more than 4 points', () => {
    // First step (2020-21 -> 2021-22) declines, but the last 3 steps all
    // rise by 10+ total -- the badge only judges the last 3 steps.
    const points: TrendPoint[] = [
      { year: '2020-21', pctl: 90 },
      { year: '2021-22', pctl: 60 },
      { year: '2022-23', pctl: 63 },
      { year: '2023-24', pctl: 66 },
      { year: '2024-25', pctl: 70 },
    ]
    expect(buildImpactBadge(points)).toBe('Impact up 3 years running')
  })
})

// ── buildSqrTrends: wires both metrics together for the school page ────────

describe('buildSqrTrends', () => {
  it('returns Results and Impact cells in that order when both are published', () => {
    const school = makeSchool(RISE_HISTORY)
    const cells = buildSqrTrends(school)
    expect(cells.map((c) => c.key)).toEqual(['results', 'impact'])
    expect(cells[0].text).toBe('Results: 40th → 55th percentile, 2021-22 to 2024-25')
    expect(cells[1].text).toBe('Impact: 62nd → 89th percentile, 2021-22 to 2024-25')
  })

  it('only attaches the badge to the impact cell, never results', () => {
    const school = makeSchool(RISE_HISTORY)
    const cells = buildSqrTrends(school)
    expect(cells.find((c) => c.key === 'results')?.badge).toBeNull()
    expect(cells.find((c) => c.key === 'impact')?.badge).toBe('Impact up 3 years running')
  })

  it('returns [] when the school has no sqr_history', () => {
    expect(buildSqrTrends(makeSchool(undefined))).toEqual([])
  })

  it('omits a metric entirely when DOE never published it for this school', () => {
    const school = makeSchool([{ year: '2024-25', performance_pctl: 55 }])
    const cells = buildSqrTrends(school)
    expect(cells.map((c) => c.key)).toEqual(['results'])
  })
})
