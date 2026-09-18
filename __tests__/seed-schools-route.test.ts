/**
 * Tests for app/api/cron/seed-schools/route.ts — GET.
 *
 * @vercel/postgres is mocked, the same way __tests__/load-schools.test.ts
 * does it: these tests (and CI) run with no live database.
 */

import fs from 'fs'
import path from 'path'

const mockSql = jest.fn()
const mockQuery = jest.fn()

jest.mock('@vercel/postgres', () => ({
  sql: Object.assign(
    (...args: unknown[]) => mockSql(...args),
    { query: (...args: unknown[]) => mockQuery(...args) }
  ),
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
  mockQuery.mockReset()
  mockQuery.mockResolvedValue({ rows: [{ count: '0' }], rowCount: 0 })
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

  it('deletes rows missing from the deployed schools.json when under the safety cap', async () => {
    mockSql.mockImplementation((strings: string[]) => {
      const text = strings.join('')
      if (text.includes('INSERT INTO schools')) return Promise.resolve({ rowCount: 3, rows: [] })
      if (text.includes('SELECT COUNT(*) FROM schools')) return Promise.resolve({ rows: [{ count: '100' }] })
      return Promise.resolve({ rows: [] })
    })
    mockQuery.mockImplementation((text: string) => {
      if (text.includes('DELETE FROM schools')) return Promise.resolve({ rowCount: 3, rows: [] })
      // 3/100 = 3%, under the 5% cap.
      return Promise.resolve({ rows: [{ count: '3' }] })
    })

    const GET = await freshGET()
    const res = await GET(
      new Request('http://localhost/api/cron/seed-schools', {
        headers: { authorization: 'Bearer test-secret' },
      })
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.deleted).toBe(3)
    expect(body.deleteSkipped).toBe(0)

    const deleteCall = mockQuery.mock.calls.find((c) => (c[0] as string).includes('DELETE FROM schools'))
    expect(deleteCall).toBeDefined()
    expect((deleteCall![0] as string)).toContain('dbn <> ALL')
  })

  it('skips the delete and reports deleteSkipped when it would remove more than 5% of rows', async () => {
    mockSql.mockImplementation((strings: string[]) => {
      const text = strings.join('')
      if (text.includes('INSERT INTO schools')) return Promise.resolve({ rowCount: 3, rows: [] })
      if (text.includes('SELECT COUNT(*) FROM schools')) return Promise.resolve({ rows: [{ count: '100' }] })
      return Promise.resolve({ rows: [] })
    })
    mockQuery.mockImplementation((text: string) => {
      if (text.includes('DELETE FROM schools')) return Promise.resolve({ rowCount: 10, rows: [] })
      // 10/100 = 10%, over the 5% cap.
      return Promise.resolve({ rows: [{ count: '10' }] })
    })
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

    const GET = await freshGET()
    const res = await GET(
      new Request('http://localhost/api/cron/seed-schools', {
        headers: { authorization: 'Bearer test-secret' },
      })
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.deleted).toBe(0)
    expect(body.deleteSkipped).toBe(10)

    const deleteCall = mockQuery.mock.calls.find((c) => (c[0] as string).includes('DELETE FROM schools'))
    expect(deleteCall).toBeUndefined()
    expect(consoleErrorSpy).toHaveBeenCalled()

    consoleErrorSpy.mockRestore()
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
