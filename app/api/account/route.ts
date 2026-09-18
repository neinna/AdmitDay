/**
 * app/api/account/route.ts
 *
 * Issue #241 (part of #179): account deletion. Parents' name, email, and
 * password live in Clerk, not our Postgres — deleting only our rows would
 * leave the Clerk account alive, so this removes both. Database first, then
 * Clerk: the delete statement is idempotent, so if the Clerk call fails and
 * the client retries, re-running the database delete against already-gone
 * rows is a safe no-op.
 *
 * The user id comes only from the session (`auth()`), never from the request
 * body — there is no field a caller can send to delete someone else's
 * account.
 */

import { auth, clerkClient } from '@clerk/nextjs/server'
import { sql } from '@vercel/postgres'
import * as Sentry from '@sentry/nextjs'

export async function DELETE() {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: 'Sign in required' }, { status: 401 })

  await sql`
    WITH p AS (SELECT id FROM parents WHERE clerk_user_id = ${userId}),
         l AS (SELECT id FROM school_lists WHERE parent_id IN (SELECT id FROM p)),
         ls AS (DELETE FROM list_schools WHERE list_id IN (SELECT id FROM l)),
         sl AS (DELETE FROM school_lists WHERE id IN (SELECT id FROM l))
    DELETE FROM parents WHERE id IN (SELECT id FROM p)
  `

  try {
    await (await clerkClient()).users.deleteUser(userId)
  } catch (err) {
    Sentry.captureException(err)
    return Response.json({ error: 'Failed to delete account' }, { status: 500 })
  }

  return Response.json({ ok: true })
}
