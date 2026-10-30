import { sql } from '@/lib/db'

/**
 * Issue #200 — saved lists live in Postgres behind the Clerk session from
 * #199. A saved list holds programs (`list_programs`), not schools. Schema is deliberately parent-scoped rather than
 * account-scoped (see the issue): a family applies for more than one child
 * over time, so `school_lists` is a table, not a single column on `parents`.
 * Nothing here stores anything about a child — `dbn` and `program_code` are
 * public DOE identifiers.
 *
 * This module never reads the session itself (no Clerk import) — callers
 * pass a `parentId` they already resolved from `auth()`, which keeps every
 * query here provably scoped to whoever the caller decided that is.
 *
 * Table creation follows the CREATE TABLE IF NOT EXISTS convention already
 * used by lib/load-schools.ts and lib/rate-limit.ts — this repo has no
 * migration tool, so that statement, checked in here, IS the forward-only
 * migration; it runs once per cold start and is a no-op against a database
 * that already has the tables.
 */

let schemaReady: Promise<void> | null = null

export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS parents (
          id SERIAL PRIMARY KEY,
          clerk_user_id TEXT UNIQUE NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `
      await sql`
        CREATE TABLE IF NOT EXISTS school_lists (
          id SERIAL PRIMARY KEY,
          parent_id INTEGER NOT NULL REFERENCES parents(id),
          name TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `
      await sql`DROP TABLE IF EXISTS list_schools`
      await sql`
        CREATE TABLE IF NOT EXISTS list_programs (
          id SERIAL PRIMARY KEY,
          list_id INTEGER NOT NULL REFERENCES school_lists(id),
          dbn TEXT NOT NULL,
          program_code TEXT NOT NULL,
          position INTEGER NOT NULL,
          added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (list_id, program_code)
        )
      `
    })().catch((err) => {
      schemaReady = null
      throw err
    })
  }
  return schemaReady
}

// Parents are stored by Clerk user id only. Name and email stay in Clerk,
// which already holds them: AdmitDay's database keeps no copy, so there is
// less personal data to protect and nothing to fall out of sync.

/** Looks up a parent by Clerk user id. Never creates one. */
export async function findParentId(clerkUserId: string): Promise<number | null> {
  await ensureSchema()
  const { rows } = await sql<{ id: number }>`
    SELECT id FROM parents WHERE clerk_user_id = ${clerkUserId}
  `
  return rows[0]?.id ?? null
}

/**
 * Idempotent: a second call with the same clerk_user_id returns the same id
 * rather than erroring or duplicating the row.
 */
export async function getOrCreateParentId(clerkUserId: string): Promise<number> {
  await ensureSchema()
  const { rows } = await sql<{ id: number }>`
    INSERT INTO parents (clerk_user_id)
    VALUES (${clerkUserId})
    ON CONFLICT (clerk_user_id) DO UPDATE SET clerk_user_id = EXCLUDED.clerk_user_id
    RETURNING id
  `
  return rows[0].id
}

async function getDefaultListId(parentId: number): Promise<number | null> {
  const { rows } = await sql<{ id: number }>`
    SELECT id FROM school_lists
    WHERE parent_id = ${parentId}
    ORDER BY created_at ASC, id ASC
    LIMIT 1
  `
  return rows[0]?.id ?? null
}

async function createDefaultList(parentId: number): Promise<number> {
  const { rows } = await sql<{ id: number }>`
    INSERT INTO school_lists (parent_id, name) VALUES (${parentId}, 'My list') RETURNING id
  `
  return rows[0].id
}

export interface SavedProgram {
  dbn: string
  program_code: string
}

async function orderedPrograms(listId: number): Promise<SavedProgram[]> {
  const { rows } = await sql<SavedProgram>`
    SELECT dbn, program_code FROM list_programs WHERE list_id = ${listId} ORDER BY position ASC
  `
  return rows
}

/** A signed-in parent's saved programs, in rank order. [] if they have no list yet. */
export async function getSavedPrograms(parentId: number): Promise<SavedProgram[]> {
  await ensureSchema()
  const listId = await getDefaultListId(parentId)
  if (listId === null) return []
  return orderedPrograms(listId)
}

/** Adds the program to the parent's list, creating it (named "My list") on first save. */
export async function addSavedProgram(parentId: number, item: SavedProgram): Promise<SavedProgram[]> {
  await ensureSchema()
  let listId = await getDefaultListId(parentId)
  if (listId === null) listId = await createDefaultList(parentId)

  await sql`
    INSERT INTO list_programs (list_id, dbn, program_code, position)
    SELECT ${listId}, ${item.dbn}, ${item.program_code}, COALESCE(MAX(position), -1) + 1 FROM list_programs WHERE list_id = ${listId}
    ON CONFLICT (list_id, program_code) DO NOTHING
  `
  return orderedPrograms(listId)
}

/** Removing from a parent with no list is a no-op that returns []. */
export async function removeSavedProgram(parentId: number, programCode: string): Promise<SavedProgram[]> {
  await ensureSchema()
  const listId = await getDefaultListId(parentId)
  if (listId === null) return []
  await sql`DELETE FROM list_programs WHERE list_id = ${listId} AND program_code = ${programCode}`
  return orderedPrograms(listId)
}

/** Re-ranks the parent's saved programs to match `order` (program codes). Codes not already saved are ignored. */
export async function reorderSavedPrograms(parentId: number, order: string[]): Promise<SavedProgram[]> {
  await ensureSchema()
  const listId = await getDefaultListId(parentId)
  if (listId === null) return []
  for (let i = 0; i < order.length; i++) {
    await sql`
      UPDATE list_programs SET position = ${i} WHERE list_id = ${listId} AND program_code = ${order[i]}
    `
  }
  return orderedPrograms(listId)
}
