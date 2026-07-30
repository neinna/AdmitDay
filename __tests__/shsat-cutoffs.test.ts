import { SHSAT_CUTOFFS, SHSAT_CUTOFFS_YEAR, getShsatCutoff } from '@/lib/shsat-cutoffs'

describe('lib/shsat-cutoffs', () => {
  it('exports a labeled cycle constant', () => {
    expect(SHSAT_CUTOFFS_YEAR).toBe('2024')
  })

  it('getShsatCutoff returns the cutoff for a known specialized HS DBN', () => {
    expect(getShsatCutoff('02M475')).toBe(SHSAT_CUTOFFS['02M475'])
    expect(getShsatCutoff('13K430')).toBe(478)
  })

  it('getShsatCutoff returns undefined for a school with no SHSAT cutoff', () => {
    expect(getShsatCutoff('99Z999')).toBeUndefined()
  })
})
