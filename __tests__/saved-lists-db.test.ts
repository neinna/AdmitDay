/**
 * __tests__/saved-lists-db.test.ts
 *
 * Issue #200 — saved lists in Postgres behind the #199 session. Mocks
 * @vercel/postgres with a minimal in-memory fake of the three tables
 * (parents, school_lists), following the same pattern as
 * __tests__/rate-limit.test.ts.
 *
 * The reviewer-risk case the issue calls out — one parent reading another's
 * list — is tested explicitly below rather than only reasoned about.
 */

const mockSql = jest.fn()
jest.mock('@/lib/db', () => ({
  sql: (...args: unknown[]) => mockSql(...args),
}))

interface ParentRow {
  id: number
  clerk_user_id: string
  email: string | null
  first_name: string | null
  last_name: string | null
}
interface ListRow {
  id: number
  parent_id: number
  name: string
}
function createFakePostgres() {
  const parents: ParentRow[] = []
  const lists: ListRow[] = []
  let nextParentId = 1
  let nextListId = 1

  const impl = jest.fn((strings: readonly string[], ...values: unknown[]) => {
    const text = strings.join('|')

    if (text.includes('CREATE TABLE') || text.includes('DROP TABLE')) return Promise.resolve({ rows: [] })

    if (text.includes('INSERT INTO parents')) {
      const [clerkUserId, email, firstName, lastName] = values as [
        string,
        string | null,
        string | null,
        string | null
      ]
      let row = parents.find((p) => p.clerk_user_id === clerkUserId)
      if (!row) {
        row = { id: nextParentId++, clerk_user_id: clerkUserId, email, first_name: firstName, last_name: lastName }
        parents.push(row)
      }
      return Promise.resolve({ rows: [{ id: row.id }] })
    }

    if (text.includes('SELECT id FROM parents WHERE clerk_user_id')) {
      const [clerkUserId] = values as [string]
      const row = parents.find((p) => p.clerk_user_id === clerkUserId)
      return Promise.resolve({ rows: row ? [{ id: row.id }] : [] })
    }

    if (text.includes('SELECT id FROM school_lists')) {
      const [parentId] = values as [number]
      const owned = lists.filter((l) => l.parent_id === parentId)
      return Promise.resolve({ rows: owned.length ? [{ id: owned[0].id }] : [] })
    }

    if (text.includes('INSERT INTO school_lists')) {
      // 'My list' is a literal in the real query, not a parameter — only
      // parentId is interpolated.
      const [parentId] = values as [number]
      const row: ListRow = { id: nextListId++, parent_id: parentId, name: 'My list' }
      lists.push(row)
      return Promise.resolve({ rows: [{ id: row.id }] })
    }


    throw new Error(`unhandled query in fake postgres: ${text}`)
  })

  return { impl, parents, lists }
}

beforeEach(() => {
  jest.resetModules()
  mockSql.mockReset()
  const { impl } = createFakePostgres()
  mockSql.mockImplementation(impl)
})

function loadModule(): typeof import('@/lib/saved-lists-db') {
  return require('@/lib/saved-lists-db')
}

describe('getOrCreateParentId / findParentId', () => {
  it('creates a parent on first call and returns the same id on repeat calls', async () => {
    const db = loadModule()
    const id1 = await db.getOrCreateParentId('user_a')
    const id2 = await db.getOrCreateParentId('user_a')
    expect(id2).toBe(id1)
  })

  it('findParentId returns null for a clerk user with no parent row', async () => {
    const db = loadModule()
    expect(await db.findParentId('nobody')).toBeNull()
  })

  it('findParentId finds a parent created by getOrCreateParentId', async () => {
    const db = loadModule()
    const id = await db.getOrCreateParentId('user_b')
    expect(await db.findParentId('user_b')).toBe(id)
  })
})

describe('ensureSchema', () => {
  it('drops the retired list_schools table and does not recreate it', async () => {
    const db = loadModule()
    await db.ensureSchema()
    const texts = mockSql.mock.calls.map(([strings]) => (strings as string[]).join('|'))
    expect(texts.some((t) => t.includes('DROP TABLE IF EXISTS list_schools'))).toBe(true)
    expect(texts.some((t) => t.includes('CREATE TABLE IF NOT EXISTS list_schools'))).toBe(false)
  })
})
