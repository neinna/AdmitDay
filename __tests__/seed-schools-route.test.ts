/**
 * Tests for app/api/cron/seed-schools/route.ts — GET.
 *
 * @vercel/postgres is mocked, the same way __tests__/load-schools.test.ts
 * does it: these tests (and CI) run with no live database.
 */

import fs from 'fs'
import path from 'path'

const mockSql = jest.fn()

jest.mock('@vercel/postgres', () => ({
  sql: (...args: unknown[]) => mockSql(...args),
}))

const mockValidateSchoolData = jest.fn()

jest.mock('@/lib/validate-school-data', () => ({
  validateSchoolData: (...args: unknown[]) => mockValidateSchoolData(...args),
}))

function queryText(callArgs: unknown[]): string {
  return (callArgs[0] as string[]).join('')
}

beforeEach(() => {
  mockSql.mockReset()
  mockValidateSchoolData.mockReset()
  mockValidateSchoolData.mockReturnValue({ valid: true, errors: [] })
  process.env.CRON_SECRET = 'test-secret'
})

async function freshGET() {
  jest.resetModules()
  const mod = await import('@/app/api/cron/seed-schools/route')
  return mod.GET
}

describe('GET /api/cron/seed-schools', () => {
  it('returns 401 and touches the database when the header is missing', async () => {
    const GET = await freshGET()
    const res = await GET(new Request('http://localhost/api/cron/seed-schools'))

    expect(res.status).toBe(401)
    expect(mockSql).not.toHaveBeenCalled()
  })

  it('returns 401 when the secret is wrong', async () => {
    const GET = await freshGET()
    const res = await GET(
      new Request('http://localhost/api/cron/seed-schools', {
        headers: { authorization: 'Bearer wrong-secret' },
      })
    )

    expect(res.status).toBe(401)
    expect(mockSql).not.toHaveBeenCalled()
  })

  it('returns 401 when CRON_SECRET is unset', async () => {
    delete process.env.CRON_SECRET
    const GET = await freshGET()
    const res = await GET(
      new Request('http://localhost/api/cron/seed-schools', {
        headers: { authorization: 'Bearer test-secret' },
      })
    )

    expect(res.status).toBe(401)
    expect(mockSql).not.toHaveBeenCalled()
  })

  it('returns 422 and writes nothing when validation fails', async () => {
    mockValidateSchoolData.mockReturnValue({ valid: false, errors: ['bad data'] })
    const GET = await freshGET()
    const res = await GET(
      new Request('http://localhost/api/cron/seed-schools', {
        headers: { authorization: 'Bearer test-secret' },
      })
    )
    const body = await res.json()

    expect(res.status).toBe(422)
    expect(body.errors).toEqual(['bad data'])
    expect(mockSql).not.toHaveBeenCalled()
  })

  it('upserts on valid data and reports total/changed', async () => {
    mockSql.mockImplementation((strings: string[]) =>
      strings.join('').includes('INSERT INTO schools')
        ? Promise.resolve({ rowCount: 3, rows: [] })
        : Promise.resolve({ rows: [] })
    )
    const GET = await freshGET()
    const res = await GET(
      new Request('http://localhost/api/cron/seed-schools', {
        headers: { authorization: 'Bearer test-secret' },
      })
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(typeof body.total).toBe('number')
    expect(body.changed).toBe(3)

    const upsertCall = mockSql.mock.calls.find((c) => queryText(c).includes('INSERT INTO schools'))
    expect(upsertCall).toBeDefined()
    const sqlText = queryText(upsertCall!)
    expect(sqlText).toContain('ON CONFLICT (dbn) DO UPDATE')
    expect(sqlText).toContain('IS DISTINCT FROM')

    // Schema was ensured before the upsert.
    const queries = mockSql.mock.calls.map((c) => queryText(c))
    expect(queries.some((q) => q.includes('CREATE TABLE IF NOT EXISTS schools'))).toBe(true)
  })
})

describe('vercel.json', () => {
  it('has the seed-schools cron entry and keeps the git.deploymentEnabled block', () => {
    const config = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'vercel.json'), 'utf8'))

    expect(config.crons).toEqual(
      expect.arrayContaining([{ path: '/api/cron/seed-schools', schedule: '0 14 * * *' }])
    )
    expect(config.git.deploymentEnabled).toEqual({ 'agent-*': false, 'task-*': false })
  })
})
