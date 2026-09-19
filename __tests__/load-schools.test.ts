/**
 * Tests for lib/load-schools.ts — getAllSchools().
 *
 * @vercel/postgres is mocked: these tests (and CI) run with no live database
 * and no POSTGRES_URL.
 */

import { School } from '@/types'

const mockSql = jest.fn()

jest.mock('@vercel/postgres', () => ({
  sql: (...args: unknown[]) => mockSql(...args),
}))

const schoolA = { dbn: '02M475', name: 'Stuyvesant High School' } as School
const schoolB = { dbn: '13K430', name: 'Brooklyn Technical High School' } as School

// getAllSchools caches in module state, so each test gets a fresh module copy.
async function freshGetAllSchools() {
  jest.resetModules()
  const mod = await import('@/lib/load-schools')
  return mod.getAllSchools
}

// The mocked sql is a tagged template: first arg is the template strings array.
function queryText(callArgs: unknown[]): string {
  return (callArgs[0] as string[]).join('')
}

beforeEach(() => {
  mockSql.mockReset()
})

describe('getAllSchools', () => {
  it('returns the parsed data column of every row', async () => {
    mockSql.mockImplementation((strings: string[]) =>
      strings.join('').includes('SELECT data FROM schools')
        ? Promise.resolve({ rows: [{ data: schoolA }, { data: schoolB }] })
        : Promise.resolve({ rows: [] })
    )
    const getAllSchools = await freshGetAllSchools()

    const schools = await getAllSchools()
    expect(schools).toEqual([schoolA, schoolB])

    // Schema was created before querying
    const queries = mockSql.mock.calls.map((c) => queryText(c))
    expect(queries.some((q) => q.includes('CREATE TABLE IF NOT EXISTS schools'))).toBe(true)
  })

  it('returns [] when the table is empty', async () => {
    mockSql.mockResolvedValue({ rows: [] })
    const getAllSchools = await freshGetAllSchools()

    await expect(getAllSchools()).resolves.toEqual([])
  })

  it('returns [] instead of throwing when the DB is unreachable', async () => {
    mockSql.mockRejectedValue(new Error('missing_connection_string'))
    const getAllSchools = await freshGetAllSchools()

    await expect(getAllSchools()).resolves.toEqual([])
  })

  it('caches a non-empty result so repeated calls do not re-query', async () => {
    mockSql.mockResolvedValue({ rows: [{ data: schoolA }] })
    const getAllSchools = await freshGetAllSchools()

    await getAllSchools()
    const callsAfterFirst = mockSql.mock.calls.length
    const again = await getAllSchools()

    expect(again).toEqual([schoolA])
    expect(mockSql.mock.calls.length).toBe(callsAfterFirst)
  })

  it('retries after a failure instead of pinning the error state', async () => {
    mockSql.mockRejectedValueOnce(new Error('connection refused'))
    mockSql.mockResolvedValue({ rows: [{ data: schoolA }] })
    const getAllSchools = await freshGetAllSchools()

    await expect(getAllSchools()).resolves.toEqual([])
    await expect(getAllSchools()).resolves.toEqual([schoolA])
  })

  it('reuses the cache for a second call inside the 5 minute TTL', async () => {
    jest.useFakeTimers()
    try {
      mockSql.mockResolvedValue({ rows: [{ data: schoolA }] })
      const getAllSchools = await freshGetAllSchools()

      await getAllSchools()
      const callsAfterFirst = mockSql.mock.calls.length

      jest.advanceTimersByTime(4 * 60 * 1000)
      const again = await getAllSchools()

      expect(again).toEqual([schoolA])
      expect(mockSql.mock.calls.length).toBe(callsAfterFirst)
    } finally {
      jest.useRealTimers()
    }
  })

  it('re-queries after the cache is older than 5 minutes and returns the new rows', async () => {
    jest.useFakeTimers()
    try {
      mockSql.mockResolvedValue({ rows: [{ data: schoolA }] })
      const getAllSchools = await freshGetAllSchools()

      await expect(getAllSchools()).resolves.toEqual([schoolA])

      jest.advanceTimersByTime(5 * 60 * 1000 + 1)
      mockSql.mockResolvedValue({ rows: [{ data: schoolB }] })

      await expect(getAllSchools()).resolves.toEqual([schoolB])
    } finally {
      jest.useRealTimers()
    }
  })
})
