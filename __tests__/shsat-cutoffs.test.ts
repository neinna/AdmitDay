import { SHSAT_CUTOFFS, SHSAT_CUTOFFS_YEAR, getShsatCutoff } from '@/lib/shsat-cutoffs'

// ── Issue #117: SHSAT cutoffs — one source of truth ─────────────────────────

describe('lib/shsat-cutoffs', () => {
  it('exports a cycle/year constant', () => {
    expect(SHSAT_CUTOFFS_YEAR).toBe('2024')
  })

  it('exports the full cutoffs table with all 8 specialized HS DBNs', () => {
    expect(Object.keys(SHSAT_CUTOFFS).length).toBe(8)
    expect(SHSAT_CUTOFFS['02M475']).toBe(560)
    expect(SHSAT_CUTOFFS['14K449']).toBe(439)
  })

  describe('getShsatCutoff', () => {
    it('returns the cutoff score for a known school DBN', () => {
      expect(getShsatCutoff('02M475')).toBe(560)
      expect(getShsatCutoff('13K430')).toBe(478)
    })

    it('returns undefined for an unknown DBN', () => {
      expect(getShsatCutoff('99Z999')).toBeUndefined()
    })

    it('returns undefined for an empty string', () => {
      expect(getShsatCutoff('')).toBeUndefined()
    })
  })
})
