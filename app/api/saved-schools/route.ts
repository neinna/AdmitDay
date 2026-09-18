/**
 * app/api/saved-schools/route.ts
 *
 * Issue #200: the signed-in read/write path for a family's saved list. Every
 * handler resolves parentId from the session (`auth()`), never from the
 * request body — so there is no field a caller can send to read or write
 * someone else's list. Signed-out requests get 401 and never touch Postgres.
 */

import { NextRequest } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import {
  findParentId,
  getOrCreateParentId,
  getSavedDbns,
  addSavedSchool,
  removeSavedSchool,
  reorderSavedSchools,
} from '@/lib/saved-lists-db'

const UNAUTHORIZED = () => Response.json({ error: 'Sign in required' }, { status: 401 })

// NYC DOE school code: district, borough letter, school number (e.g. 02M475).
// Anything else is rejected before it reaches Postgres.
const DBN = /^\d{2}[MKXQR]\d{3}$/
const MAX_ORDER = 500

async function resolveParentId(userId: string): Promise<number> {
  const existing = await findParentId(userId)
  if (existing !== null) return existing
  return getOrCreateParentId(userId)
}

export async function GET() {
  const { userId } = await auth()
  if (!userId) return UNAUTHORIZED()

  const parentId = await findParentId(userId)
  const dbns = parentId === null ? [] : await getSavedDbns(parentId)
  return Response.json({ dbns })
}

export async function POST(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) return UNAUTHORIZED()

  const { dbn } = await request.json()
  if (typeof dbn !== 'string' || !DBN.test(dbn)) {
    return Response.json({ error: 'a valid dbn is required' }, { status: 400 })
  }

  const parentId = await resolveParentId(userId)
  const dbns = await addSavedSchool(parentId, dbn)
  return Response.json({ dbns })
}

export async function DELETE(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) return UNAUTHORIZED()

  const { dbn } = await request.json()
  if (typeof dbn !== 'string' || !DBN.test(dbn)) {
    return Response.json({ error: 'a valid dbn is required' }, { status: 400 })
  }

  const parentId = await findParentId(userId)
  const dbns = parentId === null ? [] : await removeSavedSchool(parentId, dbn)
  return Response.json({ dbns })
}

export async function PUT(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) return UNAUTHORIZED()

  const { order } = await request.json()
  if (!Array.isArray(order) || order.length > MAX_ORDER || !order.every((d) => typeof d === 'string' && DBN.test(d))) {
    return Response.json({ error: 'order must be a string array' }, { status: 400 })
  }

  const parentId = await findParentId(userId)
  const dbns = parentId === null ? [] : await reorderSavedSchools(parentId, order)
  return Response.json({ dbns })
}
