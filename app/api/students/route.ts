/**
 * app/api/students/route.ts
 *
 * Read, save and delete the signed-in parent's student. parentId comes only
 * from the session (`auth()`), never the request body. Signed-out requests get
 * 401 and never touch Postgres. The body is validated by parseStudent, which
 * keeps only the allowed fields: a full lottery number is never accepted.
 */

import { NextRequest } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { findParentId, getOrCreateParentId } from '@/lib/saved-lists-db'
import { deleteStudent, getStudent, saveStudent } from '@/lib/students-db'
import { parseStudent } from '@/lib/students'

const UNAUTHORIZED = () => Response.json({ error: 'Sign in required' }, { status: 401 })

export async function GET() {
  const { userId } = await auth()
  if (!userId) return UNAUTHORIZED()
  const parentId = await findParentId(userId)
  const student = parentId === null ? null : await getStudent(parentId)
  return Response.json({ student })
}

export async function PUT(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) return UNAUTHORIZED()
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'invalid JSON' }, { status: 400 })
  }
  const parsed = parseStudent(body)
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 })
  const parentId = (await findParentId(userId)) ?? (await getOrCreateParentId(userId))
  const student = await saveStudent(parentId, parsed.student)
  return Response.json({ student })
}

export async function DELETE() {
  const { userId } = await auth()
  if (!userId) return UNAUTHORIZED()
  const parentId = await findParentId(userId)
  if (parentId !== null) await deleteStudent(parentId)
  return Response.json({ student: null })
}
