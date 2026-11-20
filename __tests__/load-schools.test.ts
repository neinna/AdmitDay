/**
 * Tests for lib/load-schools.ts — getAllSchools().
 *
 * getAllSchools serves the schools.json bundled with the deployment and must
 * never query Postgres: pulling the full table on every cache miss exhausted
 * the Neon free-plan quota and took /find down (HTTP 402).
 */

import bundledSchools from '@/schools.json'

const mockSql = jest.fn()

jest.mock('@/lib/db', () => ({
  sql: (...args: unknown[]) => mockSql(...args),
}))

beforeEach(() => {
  mockSql.mockReset()
  mockSql.mockRejectedValue(new Error('getAllSchools must not query Postgres'))
})

describe('getAllSchools', () => {
  it('returns every school in the bundled schools.json', async () => {
    const { getAllSchools } = await import('@/lib/load-schools')
    const schools = await getAllSchools()
    expect(schools.length).toBe((bundledSchools as unknown[]).length)
    expect(schools.length).toBeGreaterThan(10)
    expect(schools[0].dbn).toBeTruthy()
  })

  it('does not query the database', async () => {
    const { getAllSchools } = await import('@/lib/load-schools')
    await getAllSchools()
    await getAllSchools()
    expect(mockSql).not.toHaveBeenCalled()
  })
})
