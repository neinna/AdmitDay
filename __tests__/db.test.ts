/**
 * Tests for lib/db.ts — lazy neon client and the @vercel/postgres-shaped result.
 */

const mockQuery = jest.fn()
const mockTag = jest.fn()
const mockNeon = jest.fn()

jest.mock('@neondatabase/serverless', () => ({
  neon: (...args: unknown[]) => mockNeon(...args),
}))

async function freshDb() {
  jest.resetModules()
  return import('@/lib/db')
}

beforeEach(() => {
  const result = { rows: [{ n: 1 }], rowCount: 1 }
  mockTag.mockReset().mockResolvedValue(result)
  mockQuery.mockReset().mockResolvedValue(result)
  mockNeon.mockReset().mockImplementation(() => Object.assign(mockTag, { query: mockQuery }))
  process.env.POSTGRES_URL = 'postgres://example/db'
})

describe('lib/db', () => {
  it('does not call neon on import', async () => {
    await freshDb()
    expect(mockNeon).not.toHaveBeenCalled()
  })

  it('creates the client on the first query and returns rows and rowCount', async () => {
    const { sql } = await freshDb()
    const result = await sql`SELECT 1`
    expect(mockNeon).toHaveBeenCalledTimes(1)
    expect(mockNeon).toHaveBeenCalledWith(process.env.POSTGRES_URL, { fullResults: true })
    expect(result).toEqual({ rows: [{ n: 1 }], rowCount: 1 })
  })

  it('reuses the client on later queries', async () => {
    const { sql } = await freshDb()
    await sql`SELECT 1`
    await sql`SELECT 1`
    expect(mockNeon).toHaveBeenCalledTimes(1)
  })

  it('sql.query forwards text and params', async () => {
    const { sql } = await freshDb()
    const result = await sql.query('SELECT $1', [5])
    expect(mockQuery).toHaveBeenCalledWith('SELECT $1', [5])
    expect(result).toEqual({ rows: [{ n: 1 }], rowCount: 1 })
  })
})
