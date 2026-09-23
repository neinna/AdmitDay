import { extractMatchCount } from '../e2e/find-count'

describe('extractMatchCount (e2e/parent-flow.spec.ts helper)', () => {
  it('parses the citywide count', () => {
    expect(extractMatchCount('426matches citywide', 'citywide')).toBe(426)
  })

  it('parses a borough-filtered count', () => {
    expect(extractMatchCount('114matches in Brooklyn', 'in Brooklyn')).toBe(114)
  })

  it('handles the singular "match" case', () => {
    expect(extractMatchCount('1match in Brooklyn', 'in Brooklyn')).toBe(1)
  })

  it('strips thousands separators', () => {
    expect(extractMatchCount('1,234 matches citywide', 'citywide')).toBe(1234)
  })

  it('returns null when the suffix is not present', () => {
    expect(extractMatchCount('426 matches citywide', 'in Brooklyn')).toBeNull()
  })

  it('returns null when there is no count at all', () => {
    expect(extractMatchCount('School data not yet loaded on the server', 'citywide')).toBeNull()
  })
})
