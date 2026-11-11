/**
 * Account deletion also removes the parent's student, in the same statement
 * as their lists, so a deleted account leaves no student row behind.
 */
const mockAuth = jest.fn()
const mockDeleteUser = jest.fn()
jest.mock('@clerk/nextjs/server', () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
  clerkClient: async () => ({ users: { deleteUser: (...a: unknown[]) => mockDeleteUser(...a) } }),
}))
const mockSql = jest.fn()
jest.mock('@/lib/db', () => ({ sql: (...args: unknown[]) => mockSql(...args) }))
jest.mock('@/lib/saved-lists-db', () => ({ ensureSchema: jest.fn().mockResolvedValue(undefined) }))
jest.mock('@sentry/nextjs', () => ({ captureException: jest.fn() }))

import { DELETE } from '@/app/api/account/route'

it('deletes from students for the session parent in the same statement as parents', async () => {
  mockAuth.mockResolvedValue({ userId: 'user_a' })
  mockSql.mockResolvedValue({ rows: [], rowCount: 0 })
  mockDeleteUser.mockResolvedValue(undefined)
  const res = await DELETE()
  expect(res.status).toBe(200)
  expect(mockSql).toHaveBeenCalledTimes(1)
  const [strings, ...values] = mockSql.mock.calls[0]
  const text = (strings as string[]).join('$')
  expect(text).toContain('DELETE FROM students WHERE parent_id IN (SELECT id FROM p)')
  expect(text).toContain('DELETE FROM parents')
  expect(values).toEqual(['user_a'])
})
