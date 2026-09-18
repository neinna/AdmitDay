import { sql } from '@vercel/postgres'

/**
 * Issue #200 — saved lists move from localStorage to Postgres behind the
 * Clerk session from #199. Schema is deliberately parent-scoped rather than
 * account-scoped (see the issue): a family applies for more than one child
 * over time, so `school_lists` is a table, not a single column on `parents`.
 * Nothing here stores anything about a child — `dbn` is a public DOE school
 * identifier.
 *
 * This module never reads the session itself (no Clerk import) — callers
 * pass a `parentId` they already resolved from `auth()`, which keeps every
 * query here provably scoped to whoever the caller decided that is. The one
 * exception, `getOwnedList`, takes a caller-supplied listId AND the caller's
 * own parentId and returns data only when both match — the guard against the
 * IDOR risk called out in the issue.
 *
 * Table creation follows the CREATE TABLE IF NOT EXISTS convention already
 * used by lib/load-schools.ts and lib/rate-limit.ts — this repo has no
 * migration tool, so that statement, checked in here, IS the forward-only
 * migration; it runs once per cold start and is a no-op against a database
 * that already has the tables.
 */

let schemaReady: Promise<void> | null = null

function ensureSchema(): Promise<void> {
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
      await sql`
        CREATE TABLE IF NOT EXISTS list_schools (
          id SERIAL PRIMARY KEY,
          list_id INTEGER NOT NULL REFERENCES school_lists(id),
          dbn TEXT NOT NULL,
          position INTEGER NOT NULL,
          added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (list_id, dbn)
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

async function orderedDbns(listId: number): Promise<string[]> {
  const { rows } = await sql<{ dbn: string }>`
    SELECT dbn FROM list_schools WHERE list_id = ${listId} ORDER BY position ASC
  `
  return rows.map((r) => r.dbn)
}

/** A signed-in parent's saved dbns, in rank order. [] if they have no list yet. */
export async function getSavedDbns(parentId: number): Promise<string[]> {
  await ensureSchema()
  const listId = await getDefaultListId(parentId)
  if (listId === null) return []
  return orderedDbns(listId)
}

/** Adds dbn to the parent's list, creating it (named "My list") on first save. */
export async function addSavedSchool(parentId: number, dbn: string): Promise<string[]> {
  await ensureSchema()
  let listId = await getDefaultListId(parentId)
  if (listId === null) listId = await createDefaultList(parentId)

  await sql`
    INSERT INTO list_schools (list_id, dbn, position)
    SELECT ${listId}, ${dbn}, COALESCE(MAX(position), -1) + 1 FROM list_schools WHERE list_id = ${listId}
    ON CONFLICT (list_id, dbn) DO NOTHING
  `
  return orderedDbns(listId)
}

/** Removing from a parent with no list is a no-op that returns []. */
export async function removeSavedSchool(parentId: number, dbn: string): Promise<string[]> {
  await ensureSchema()
  const listId = await getDefaultListId(parentId)
  if (listId === null) return []
  await sql`DELETE FROM list_schools WHERE list_id = ${listId} AND dbn = ${dbn}`
  return orderedDbns(listId)
}

/** Re-ranks the parent's existing saved schools to match `order`. Dbns not already saved are ignored — this reorders, it does not add. */
export async function reorderSavedSchools(parentId: number, order: string[]): Promise<string[]> {
  await ensureSchema()
  const listId = await getDefaultListId(parentId)
  if (listId === null) return []
  for (let i = 0; i < order.length; i++) {
    await sql`
      UPDATE list_schools SET position = ${i} WHERE list_id = ${listId} AND dbn = ${order[i]}
    `
  }
  return orderedDbns(listId)
}

export interface OwnedList {
  id: number
  name: string
  dbns: string[]
}

/**
 * Fetches a list by id, but only ever returns it when parentId matches the
 * list's owner. "Doesn't exist" and "belongs to someone else" both return
 * null — the caller must turn both into the same 404, or list ids become
 * enumerable. This is the query the issue's reviewer-risk note is about.
 */
export async function getOwnedList(listId: number, parentId: number): Promise<OwnedList | null> {
  await ensureSchema()
  const { rows } = await sql<{ id: number; name: string }>`
    SELECT id, name FROM school_lists WHERE id = ${listId} AND parent_id = ${parentId}
  `
  const list = rows[0]
  if (!list) return null
  return { id: list.id, name: list.name, dbns: await orderedDbns(list.id) }
}
