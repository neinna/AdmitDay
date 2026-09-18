/**
 * lib/rag.ts hard filters (issue #231: "Ask answer recommends schools outside
 * the active filters — Brooklyn filter -> Bronx schools").
 *
 * The /find rail's borough/track/size filters are a hard floor for the
 * visible school list (lib/school-list-utils.ts applyFindFilters). Retrieval
 * for the ask answer must honor the same floor: a school outside the active
 * filters must never become a candidate chunk the model can describe, no
 * matter how well it scores semantically.
 */

jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    embeddings: {
      create: jest.fn().mockResolvedValue({
        data: [{ embedding: new Array(1536).fill(0.01) }],
      }),
    },
  }))
})

process.env.OPENAI_API_KEY = 'test-key'

import { searchSchools } from '@/lib/rag'

describe('searchSchools honors the active /find rail filters (issue #231)', () => {
  it('never returns a school outside the active borough filter', async () => {
    const results = await searchSchools('strong STEM program and a soccer team', 5, {
      boroughs: ['Brooklyn'],
    })
    expect(results.length).toBeGreaterThan(0)
    for (const r of results) {
      expect(r.borough).toBe('Brooklyn')
    }
  })

  it('never returns a school outside multiple active boroughs', async () => {
    const results = await searchSchools('a good school', 5, {
      boroughs: ['Bronx', 'Staten Island'],
    })
    expect(results.length).toBeGreaterThan(0)
    for (const r of results) {
      expect(['Bronx', 'Staten Island']).toContain(r.borough)
    }
  })

  it('never returns a school outside the active track filter', async () => {
    const results = await searchSchools('a good school', 5, { tracks: ['SHSAT'] })
    expect(results.length).toBeGreaterThan(0)
    for (const r of results) {
      expect(r.metadata.admissions_types).toContain('SHSAT')
    }
  })

  it('never returns a school outside the active size filter', async () => {
    const results = await searchSchools('a good school', 5, { size: 'small' })
    expect(results.length).toBeGreaterThan(0)
    for (const r of results) {
      expect(r.metadata.size).toBe('small')
    }
  })

  it('combines borough, track, and size filters', async () => {
    const results = await searchSchools('a good school', 5, {
      boroughs: ['Brooklyn'],
      tracks: ['SHSAT'],
    })
    for (const r of results) {
      expect(r.borough).toBe('Brooklyn')
      expect(r.metadata.admissions_types).toContain('SHSAT')
    }
  })

  it('applies the borough filter even when the question names a different borough', async () => {
    // The question-derived deterministic filter (lib/query-filters.ts) would
    // extract "Bronx" from the text alone; the active rail filter for
    // Brooklyn must still win, since it is the hard floor.
    const results = await searchSchools('any good schools in the Bronx?', 5, {
      boroughs: ['Brooklyn'],
    })
    expect(results.length).toBeGreaterThan(0)
    for (const r of results) {
      expect(r.borough).toBe('Brooklyn')
    }
  })

  it('returns no results when the active filters match zero schools, instead of falling back', async () => {
    // No Staten Island + Audition + small school exists in the dataset; a
    // hard filter must return nothing rather than reaching outside it.
    const results = await searchSchools('a good school', 5, {
      boroughs: ['Staten Island'],
      tracks: ['Audition'],
      size: 'small',
    })
    expect(results).toEqual([])
  })

  it('behaves exactly as before when no hard filters are active', async () => {
    const results = await searchSchools('strong STEM program and a soccer team', 5)
    expect(results.length).toBe(5)
  })
})
