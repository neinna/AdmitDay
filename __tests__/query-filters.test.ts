import { extractFilters, hasFilters } from '@/lib/query-filters'

describe('extractFilters (issue #92: hybrid search deterministic pre-filter)', () => {
  it('detects a borough mentioned in the question', () => {
    const filters = extractFilters('What are some good schools in Brooklyn?')
    expect(filters.borough).toBe('Brooklyn')
  })

  it('does not false-match a borough name inside another word', () => {
    const filters = extractFilters('Is Bronxville a good place to live?')
    expect(filters.borough).toBeUndefined()
  })

  it('detects a sport mentioned in the question', () => {
    const filters = extractFilters('Which schools have a strong soccer team?')
    expect(filters.sports).toContain('Soccer')
  })

  it('detects an interest/subject keyword', () => {
    const filters = extractFilters('I want a school with a good CS program')
    expect(filters.interests).toContain('Computer Science')
  })

  it('handles the compound "CS + soccer + Brooklyn" case with all three signals', () => {
    const filters = extractFilters('Looking for CS + soccer + Brooklyn schools')
    expect(filters.borough).toBe('Brooklyn')
    expect(filters.sports).toContain('Soccer')
    expect(filters.interests).toContain('Computer Science')
    expect(hasFilters(filters)).toBe(true)
  })

  it('is case-insensitive', () => {
    const filters = extractFilters('schools in BROOKLYN with basketball')
    expect(filters.borough).toBe('Brooklyn')
    expect(filters.sports).toContain('Basketball')
  })

  it('returns empty filters and hasFilters=false for a plain question with no signals', () => {
    const filters = extractFilters('What is the best school for my kid?')
    expect(filters.borough).toBeUndefined()
    expect(filters.sports).toEqual([])
    expect(filters.interests).toEqual([])
    expect(hasFilters(filters)).toBe(false)
  })

  it('does not duplicate a sport matched by multiple aliases', () => {
    const filters = extractFilters('Any schools with track and field or track?')
    expect(filters.sports.filter((s) => s === 'Track')).toHaveLength(1)
  })
})
