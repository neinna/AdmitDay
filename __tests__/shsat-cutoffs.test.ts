import { SHSAT_CUTOFFS, SHSAT_CUTOFFS_YEAR, getShsatCutoff, getShsatCutoffs } from '@/lib/shsat-cutoffs'

const SPECIALIZED_DBNS = ['02M475', '05M692', '10X445', '10X696', '13K430', '14K449', '28Q687', '31R605']

describe('lib/shsat-cutoffs', () => {
  it('exports a labeled latest-cycle constant', () => {
    expect(SHSAT_CUTOFFS_YEAR).toBe('2026')
  })

  it('getShsatCutoff returns the latest-year cutoff for a known specialized HS DBN', () => {
    const entries = SHSAT_CUTOFFS['02M475']
    expect(getShsatCutoff('02M475')).toBe(entries[entries.length - 1].score)
    expect(getShsatCutoff('13K430')).toBe(506)
  })

  it('getShsatCutoff returns undefined for a school with no SHSAT cutoff', () => {
    expect(getShsatCutoff('99Z999')).toBeUndefined()
  })
})

// Issue #192: the old single-year constant was mislabeled '2024' but held
// values matching no published year for any school. Cutoffs now carry three
// offer years per DBN, each with a source and the date it was verified.
describe('getShsatCutoffs (issue #192)', () => {
  it.each(SPECIALIZED_DBNS)('%s has cutoffs for 2024, 2025, and 2026', (dbn) => {
    const cutoffs = getShsatCutoffs(dbn)
    expect(cutoffs).toBeDefined()
    expect(cutoffs!.map((c) => c.year).sort()).toEqual(['2024', '2025', '2026'])
  })

  it.each(SPECIALIZED_DBNS)('%s cutoffs each carry a source URL, verified date, and numeric score', (dbn) => {
    const cutoffs = getShsatCutoffs(dbn)!
    cutoffs.forEach((entry) => {
      expect(entry.source).toMatch(/^https:\/\//)
      expect(entry.verifiedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(Number.isInteger(entry.score)).toBe(true)
    })
  })

  it('returns undefined for a DBN with no published cutoff', () => {
    expect(getShsatCutoffs('99Z999')).toBeUndefined()
  })

  it('matches the verified per-year cutoff values', () => {
    const expected: Record<string, [number, number, number]> = {
      '02M475': [561, 556, 561],
      '10X445': [526, 518, 525],
      '13K430': [507, 505, 506],
      '14K449': [492, 496, 495],
      '05M692': [542, 526, 539],
      '10X696': [514, 504, 507],
      '28Q687': [524, 518, 531],
      '31R605': [519, 527, 517],
    }
    for (const [dbn, [y2024, y2025, y2026]] of Object.entries(expected)) {
      const byYear = Object.fromEntries(getShsatCutoffs(dbn)!.map((c) => [c.year, c.score]))
      expect(byYear['2024']).toBe(y2024)
      expect(byYear['2025']).toBe(y2025)
      expect(byYear['2026']).toBe(y2026)
    }
  })

  it('getShsatCutoff returns the 2026 score, matching getShsatCutoffs\' last entry', () => {
    for (const dbn of SPECIALIZED_DBNS) {
      const cutoffs = getShsatCutoffs(dbn)!
      const latest = cutoffs.find((c) => c.year === SHSAT_CUTOFFS_YEAR)!
      expect(getShsatCutoff(dbn)).toBe(latest.score)
    }
  })
})
