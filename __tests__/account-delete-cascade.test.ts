/**
 * __tests__/account-delete-cascade.test.ts
 *
 * Issue #241 (part of #179) — the specific case the issue's Tests section
 * calls out: with a fake Postgres holding two parents, deleting parent A must
 * leave zero rows for A in all three tables (parents, school_lists,
 * list_schools) and leave parent B's rows untouched. Unlike
 * __tests__/saved-lists-db.test.ts's fake (which answers one query per call),
 * this fake interprets the single multi-statement CTE the route sends and
 * applies its cascade effect directly, since that's the actual shape of the
 * query under test.
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

jest.mock('@sentry/nextjs', () => ({
  captureException: jest.fn(),
}))

import { DELETE } from '@/app/api/account/route'

interface ParentRow {
  id: number
  clerk_user_id: string
}
interface ListRow {
  id: number
  parent_id: number
}
interface SchoolRow {
  list_id: number
  dbn: string
}

function createFakePostgres() {
  const parents: ParentRow[] = [
    { id: 1, clerk_user_id: 'user_a' },
    { id: 2, clerk_user_id: 'user_b' },
  ]
  const lists: ListRow[] = [
    { id: 10, parent_id: 1 },
    { id: 20, parent_id: 2 },
  ]
  const schools: SchoolRow[] = [
    { list_id: 10, dbn: '01M001' },
    { list_id: 20, dbn: '02M002' },
  ]

  const impl = jest.fn((strings: readonly string[], ...values: unknown[]) => {
    const text = strings.join('|')
    if (!text.includes('DELETE FROM parents')) {
      throw new Error(`unhandled query in fake postgres: ${text}`)
    }

    const [clerkUserId] = values as [string]
    const parent = parents.find((p) => p.clerk_user_id === clerkUserId)
    if (parent) {
      const listIds = lists.filter((l) => l.parent_id === parent.id).map((l) => l.id)
      for (let i = schools.length - 1; i >= 0; i--) {
        if (listIds.includes(schools[i].list_id)) schools.splice(i, 1)
      }
      for (let i = lists.length - 1; i >= 0; i--) {
        if (listIds.includes(lists[i].id)) lists.splice(i, 1)
      }
      parents.splice(
        parents.findIndex((p) => p.id === parent.id),
        1
      )
    }
    return Promise.resolve({ rows: [] })
  })

  return { impl, parents, lists, schools }
}

beforeEach(() => {
  jest.clearAllMocks()
})

it("deleting parent A's account removes their rows from all three tables and leaves parent B untouched", async () => {
  const { impl, parents, lists, schools } = createFakePostgres()
  mockSql.mockImplementation(impl)
  mockAuth.mockResolvedValue({ userId: 'user_a' })
  mockClerkClient.mockResolvedValue({ users: { deleteUser: jest.fn().mockResolvedValue(undefined) } })

  const res = await DELETE()

  expect(res.status).toBe(200)

  expect(parents.some((p) => p.clerk_user_id === 'user_a')).toBe(false)
  expect(lists.some((l) => l.parent_id === 1)).toBe(false)
  expect(schools.some((s) => s.list_id === 10)).toBe(false)

  expect(parents.some((p) => p.clerk_user_id === 'user_b')).toBe(true)
  expect(lists.some((l) => l.parent_id === 2)).toBe(true)
  expect(schools.some((s) => s.list_id === 20)).toBe(true)
})
