/**
 * __tests__/saved-programs-db.test.ts
 *
 * Issue #611 — list_programs read/write functions. In-memory SQL fake, same
 * approach as __tests__/saved-lists-db.test.ts.
 */

const mockSql = jest.fn()
jest.mock('@/lib/db', () => ({
  sql: (...args: unknown[]) => mockSql(...args),
}))

interface ProgramRow {
  list_id: number
  dbn: string
  program_code: string
  position: number
}

function createFakePostgres() {
  const parents: { id: number; clerk_user_id: string }[] = []
  const lists: { id: number; parent_id: number }[] = []
  const programs: ProgramRow[] = []
  let nextParentId = 1
  let nextListId = 1

  const impl = jest.fn((strings: readonly string[], ...values: unknown[]) => {
    const text = strings.join('|')

    if (text.includes('CREATE TABLE')) return Promise.resolve({ rows: [] })

    if (text.includes('INSERT INTO parents')) {
      const [clerkUserId] = values as [string]
      let row = parents.find((p) => p.clerk_user_id === clerkUserId)
      if (!row) {
        row = { id: nextParentId++, clerk_user_id: clerkUserId }
        parents.push(row)
      }
      return Promise.resolve({ rows: [{ id: row.id }] })
    }

    if (text.includes('SELECT id FROM school_lists')) {
      const [parentId] = values as [number]
      const owned = lists.filter((l) => l.parent_id === parentId)
      return Promise.resolve({ rows: owned.length ? [{ id: owned[0].id }] : [] })
    }

    if (text.includes('INSERT INTO school_lists')) {
      const [parentId] = values as [number]
      const row = { id: nextListId++, parent_id: parentId }
      lists.push(row)
      return Promise.resolve({ rows: [{ id: row.id }] })
    }

    if (text.includes('SELECT dbn, program_code FROM list_programs')) {
      const [listId] = values as [number]
      const rows = programs
        .filter((p) => p.list_id === listId)
        .sort((a, b) => a.position - b.position)
        .map((p) => ({ dbn: p.dbn, program_code: p.program_code }))
      return Promise.resolve({ rows })
    }

    if (text.includes('INSERT INTO list_programs')) {
      const [listId, dbn, code] = values as [number, string, string]
      if (!programs.some((p) => p.list_id === listId && p.program_code === code)) {
        const maxPos = programs
          .filter((p) => p.list_id === listId)
          .reduce((max, p) => Math.max(max, p.position), -1)
        programs.push({ list_id: listId, dbn, program_code: code, position: maxPos + 1 })
      }
      return Promise.resolve({ rows: [] })
    }

    if (text.includes('DELETE FROM list_programs')) {
      const [listId, code] = values as [number, string]
      const idx = programs.findIndex((p) => p.list_id === listId && p.program_code === code)
      if (idx !== -1) programs.splice(idx, 1)
      return Promise.resolve({ rows: [] })
    }

    if (text.includes('UPDATE list_programs SET position')) {
      const [position, listId, code] = values as [number, number, string]
      const row = programs.find((p) => p.list_id === listId && p.program_code === code)
      if (row) row.position = position
      return Promise.resolve({ rows: [] })
    }

    throw new Error(`unhandled query in fake postgres: ${text}`)
  })

  return { impl, lists, programs }
}

let fake: ReturnType<typeof createFakePostgres>

beforeEach(() => {
  jest.resetModules()
  mockSql.mockReset()
  fake = createFakePostgres()
  mockSql.mockImplementation(fake.impl)
})

function loadModule(): typeof import('@/lib/saved-lists-db') {
  return require('@/lib/saved-lists-db')
}

const stuy = { dbn: '02M475', program_code: 'M89S' }
const other = { dbn: '01M001', program_code: 'X1' }

describe('saved programs', () => {
  it('creates "My list" on first save', async () => {
    const db = loadModule()
    const parentId = await db.getOrCreateParentId('user_a')
    expect(fake.lists).toHaveLength(0)
    expect(await db.addSavedProgram(parentId, stuy)).toEqual([stuy])
    expect(fake.lists).toHaveLength(1)
  })

  it('keeps one row when the same code is added twice', async () => {
    const db = loadModule()
    const parentId = await db.getOrCreateParentId('user_a')
    await db.addSavedProgram(parentId, stuy)
    await db.addSavedProgram(parentId, other)
    expect(await db.addSavedProgram(parentId, stuy)).toEqual([stuy, other])
    expect(fake.programs).toHaveLength(2)
  })

  it('removes a saved program', async () => {
    const db = loadModule()
    const parentId = await db.getOrCreateParentId('user_a')
    await db.addSavedProgram(parentId, stuy)
    await db.addSavedProgram(parentId, other)
    expect(await db.removeSavedProgram(parentId, 'M89S')).toEqual([other])
  })

  it('reorders by program code', async () => {
    const db = loadModule()
    const parentId = await db.getOrCreateParentId('user_a')
    await db.addSavedProgram(parentId, stuy)
    await db.addSavedProgram(parentId, other)
    expect(await db.reorderSavedPrograms(parentId, ['X1', 'M89S'])).toEqual([other, stuy])
  })

  it('ignores codes in the order that are not saved', async () => {
    const db = loadModule()
    const parentId = await db.getOrCreateParentId('user_a')
    await db.addSavedProgram(parentId, stuy)
    await db.addSavedProgram(parentId, other)
    await db.reorderSavedPrograms(parentId, ['NOPE', 'X1', 'M89S'])
    expect(await db.getSavedPrograms(parentId)).toEqual([other, stuy])
    expect(fake.programs).toHaveLength(2)
  })

  it('returns [] for a parent with no list, for every function', async () => {
    const db = loadModule()
    const parentId = await db.getOrCreateParentId('user_b')
    expect(await db.getSavedPrograms(parentId)).toEqual([])
    expect(await db.removeSavedProgram(parentId, 'M89S')).toEqual([])
    expect(await db.reorderSavedPrograms(parentId, ['M89S'])).toEqual([])
    expect(fake.lists).toHaveLength(0)
  })
})

export {}
