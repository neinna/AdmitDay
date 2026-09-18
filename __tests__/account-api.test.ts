/**
 * __tests__/account-api.test.ts
 *
 * Issue #241 (part of #179): DELETE /api/account removes our Postgres rows
 * and the Clerk user. Mocks @clerk/nextjs/server (auth/clerkClient),
 * @vercel/postgres, and @sentry/nextjs directly — same "import and call the
 * handler" approach as __tests__/saved-schools-api.test.ts.
 */

const mockAuth = jest.fn()
const mockClerkClient = jest.fn()
jest.mock('@clerk/nextjs/server', () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
  clerkClient: (...args: unknown[]) => mockClerkClient(...args),
}))

const mockSql = jest.fn()
const mockEnsureSchema = jest.fn().mockResolvedValue(undefined)
jest.mock('@/lib/saved-lists-db', () => ({
  ensureSchema: (...args: unknown[]) => mockEnsureSchema(...args),
}))

jest.mock('@vercel/postgres', () => ({
  sql: (...args: unknown[]) => mockSql(...args),
}))

const mockCaptureException = jest.fn()
jest.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}))

import { DELETE } from '@/app/api/account/route'

const mockDeleteUser = jest.fn()

beforeEach(() => {
  jest.clearAllMocks()
  mockSql.mockResolvedValue({ rows: [] })
  mockClerkClient.mockResolvedValue({ users: { deleteUser: mockDeleteUser } })
})

describe('DELETE /api/account — signed out', () => {
  it('returns 401 without touching Postgres or Clerk', async () => {
    mockAuth.mockResolvedValue({ userId: null })

    const res = await DELETE()

    expect(res.status).toBe(401)
    expect(mockSql).not.toHaveBeenCalled()
    expect(mockClerkClient).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/account — signed in', () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue({ userId: 'user_1' })
  })

  it('runs the delete statement, then deletes the Clerk user with the session id only', async () => {
    mockDeleteUser.mockResolvedValue(undefined)

    const res = await DELETE()

    expect(mockSql).toHaveBeenCalledTimes(1)
    const [strings, ...values] = mockSql.mock.calls[0]
    const text = strings.join('|')
    expect(text).toContain('DELETE FROM parents')
    expect(text).toContain('DELETE FROM list_schools')
    expect(text).toContain('DELETE FROM school_lists')
    expect(values).toEqual(['user_1'])

    expect(mockDeleteUser).toHaveBeenCalledWith('user_1')
    expect(res.status).toBe(200)
  })

  it('deletes the database rows before calling Clerk', async () => {
    const order: string[] = []
    mockSql.mockImplementation(() => {
      order.push('sql')
      return Promise.resolve({ rows: [] })
    })
    mockDeleteUser.mockImplementation(() => {
      order.push('clerk')
      return Promise.resolve(undefined)
    })

    await DELETE()

    expect(order).toEqual(['sql', 'clerk'])
  })

  it('returns 500 and reports to Sentry when the Clerk delete fails, after the database delete already ran', async () => {
    const clerkError = new Error('clerk unavailable')
    mockDeleteUser.mockRejectedValue(clerkError)

    const res = await DELETE()

    expect(mockSql).toHaveBeenCalledTimes(1)
    expect(res.status).toBe(500)
    expect(mockCaptureException).toHaveBeenCalledWith(clerkError)
  })
})

describe('DELETE /api/account — schema guard', () => {
  it('creates the tables (no-op when present) before running the delete, so a parent who never saved can still delete', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_1' })
    const order: string[] = []
    mockEnsureSchema.mockImplementation(async () => { order.push('schema') })
    mockSql.mockImplementation(async () => { order.push('sql'); return { rows: [] } })
    await DELETE()
    expect(order.slice(0, 2)).toEqual(['schema', 'sql'])
  })
})
