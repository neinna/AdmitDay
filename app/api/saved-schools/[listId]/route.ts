/**
 * app/api/saved-schools/[listId]/route.ts
 *
 * Issue #200: read-only lookup of one list by id. The schema allows more
 * than one list per parent (a family applies for more than one child over
 * time), so a list id is a real, caller-supplied identifier — unlike the
 * plain /api/saved-schools route, which never takes one. getOwnedList only
 * ever returns a list that belongs to the session's own parentId, and
 * "doesn't exist" and "belongs to someone else" both come back as the same
 * 404 with no schools attached, so a guessed id can't be used to tell the
 * two apart or to read another family's list.
 */

import { auth } from '@clerk/nextjs/server'
import { findParentId, getOwnedList } from '@/lib/saved-lists-db'

const NOT_FOUND = () => Response.json({ error: 'Not found' }, { status: 404 })

export async function GET(_request: Request, { params }: { params: { listId: string } }) {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: 'Sign in required' }, { status: 401 })

  const listId = Number(params.listId)
  if (!Number.isInteger(listId)) return NOT_FOUND()

  const parentId = await findParentId(userId)
  if (parentId === null) return NOT_FOUND()

  const list = await getOwnedList(listId, parentId)
  if (!list) return NOT_FOUND()

  return Response.json(list)
}
