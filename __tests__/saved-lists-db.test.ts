/**
 * __tests__/saved-lists-db.test.ts
 *
 * Issue #200 — saved lists in Postgres behind the #199 session. Mocks
 * @vercel/postgres with a minimal in-memory fake of the three tables
 * (parents, school_lists, list_schools), following the same pattern as
 * __tests__/rate-limit.test.ts.
 *
 * The reviewer-risk case the issue calls out — one parent reading another's
 * list — is tested explicitly below rather than only reasoned about.
 */

const mockSql = jest.fn()
jest.mock('@vercel/postgres', () => ({
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
interface SchoolRow {
  list_id: number
  dbn: string
  position: number
}

function createFakePostgres() {
  const parents: ParentRow[] = []
  const lists: ListRow[] = []
  const schools: SchoolRow[] = []
  let nextParentId = 1
  let nextListId = 1

  const impl = jest.fn((strings: readonly string[], ...values: unknown[]) => {
    const text = strings.join('|')

    if (text.includes('CREATE TABLE')) return Promise.resolve({ rows: [] })

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

    if (text.includes('SELECT dbn FROM list_schools')) {
      const [listId] = values as [number]
      const rows = schools
        .filter((s) => s.list_id === listId)
        .sort((a, b) => a.position - b.position)
        .map((s) => ({ dbn: s.dbn }))
      return Promise.resolve({ rows })
    }

    if (text.includes('INSERT INTO list_schools')) {
      const [listId, dbn] = values as [number, string]
      if (!schools.some((s) => s.list_id === listId && s.dbn === dbn)) {
        const maxPos = schools
          .filter((s) => s.list_id === listId)
          .reduce((max, s) => Math.max(max, s.position), -1)
        schools.push({ list_id: listId, dbn, position: maxPos + 1 })
      }
      return Promise.resolve({ rows: [] })
    }

    if (text.includes('DELETE FROM list_schools')) {
      const [listId, dbn] = values as [number, string]
      const idx = schools.findIndex((s) => s.list_id === listId && s.dbn === dbn)
      if (idx !== -1) schools.splice(idx, 1)
      return Promise.resolve({ rows: [] })
    }

    if (text.includes('UPDATE list_schools SET position')) {
      const [position, listId, dbn] = values as [number, number, string]
      const row = schools.find((s) => s.list_id === listId && s.dbn === dbn)
      if (row) row.position = position
      return Promise.resolve({ rows: [] })
    }

    if (text.includes('SELECT id, name FROM school_lists')) {
      const [listId, parentId] = values as [number, number]
      const row = lists.find((l) => l.id === listId && l.parent_id === parentId)
      return Promise.resolve({ rows: row ? [{ id: row.id, name: row.name }] : [] })
    }

    throw new Error(`unhandled query in fake postgres: ${text}`)
  })

  return { impl, parents, lists, schools }
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

describe('getSavedDbns', () => {
  it('returns [] for a parent with no list yet', async () => {
    const db = loadModule()
    const parentId = await db.getOrCreateParentId('user_c')
    expect(await db.getSavedDbns(parentId)).toEqual([])
  })
})

describe('addSavedSchool', () => {
  it('creates a list named "My list" on first save', async () => {
    const db = loadModule()
    const parentId = await db.getOrCreateParentId('user_d')
    await db.addSavedSchool(parentId, '01M001')
    const list = await db.getOwnedList(1, parentId)
    expect(list?.name).toBe('My list')
  })

  it('appends dbns in save order and is idempotent for a repeat add', async () => {
    const db = loadModule()
    const parentId = await db.getOrCreateParentId('user_e')
    await db.addSavedSchool(parentId, '01M001')
    await db.addSavedSchool(parentId, '02M002')
    await db.addSavedSchool(parentId, '01M001') // duplicate add
    expect(await db.getSavedDbns(parentId)).toEqual(['01M001', '02M002'])
  })

  it('gives each parent their own list — one parent adding a school never appears in another parent\'s list', async () => {
    const db = loadModule()
    const parentA = await db.getOrCreateParentId('user_f')
    const parentB = await db.getOrCreateParentId('user_g')
    await db.addSavedSchool(parentA, '01M001')
    expect(await db.getSavedDbns(parentB)).toEqual([])
    expect(await db.getSavedDbns(parentA)).toEqual(['01M001'])
  })
})

describe('removeSavedSchool', () => {
  it('removes a saved dbn', async () => {
    const db = loadModule()
    const parentId = await db.getOrCreateParentId('user_h')
    await db.addSavedSchool(parentId, '01M001')
    await db.addSavedSchool(parentId, '02M002')
    expect(await db.removeSavedSchool(parentId, '01M001')).toEqual(['02M002'])
  })

  it('is a no-op returning [] for a parent with no list', async () => {
    const db = loadModule()
    const parentId = await db.getOrCreateParentId('user_i')
    expect(await db.removeSavedSchool(parentId, '01M001')).toEqual([])
  })
})

describe('reorderSavedSchools', () => {
  it('re-ranks existing saved schools to match the given order', async () => {
    const db = loadModule()
    const parentId = await db.getOrCreateParentId('user_j')
    await db.addSavedSchool(parentId, '01M001')
    await db.addSavedSchool(parentId, '02M002')
    await db.addSavedSchool(parentId, '03M003')
    expect(await db.reorderSavedSchools(parentId, ['03M003', '01M001', '02M002'])).toEqual([
      '03M003',
      '01M001',
      '02M002',
    ])
  })

  it('ignores dbns in the order that are not already saved — it reorders, it does not add', async () => {
    const db = loadModule()
    const parentId = await db.getOrCreateParentId('user_k')
    await db.addSavedSchool(parentId, '01M001')
    await db.addSavedSchool(parentId, '02M002')
    await db.reorderSavedSchools(parentId, ['09Z999', '02M002', '01M001'])
    expect(await db.getSavedDbns(parentId)).toEqual(['02M002', '01M001'])
  })
})

describe('getOwnedList — the cross-parent isolation case (issue #200 reviewer risk)', () => {
  it('returns the list and its dbns when the requesting parent owns it', async () => {
    const db = loadModule()
    const parentId = await db.getOrCreateParentId('user_l')
    await db.addSavedSchool(parentId, '01M001')
    const list = await db.getOwnedList(1, parentId)
    expect(list).toEqual({ id: 1, name: 'My list', dbns: ['01M001'] })
  })

  it('returns null — never the data — when a different parent requests the same list id', async () => {
    const db = loadModule()
    const owner = await db.getOrCreateParentId('owner')
    const attacker = await db.getOrCreateParentId('attacker')
    await db.addSavedSchool(owner, '01M001')
    const ownersListId = (await db.getOwnedList(1, owner))!.id

    expect(await db.getOwnedList(ownersListId, attacker)).toBeNull()
  })

  it('returns null for a list id that does not exist at all, same as a list owned by someone else', async () => {
    const db = loadModule()
    const parentId = await db.getOrCreateParentId('user_m')
    expect(await db.getOwnedList(999, parentId)).toBeNull()
  })
})
