/**
 * app/api/saved-programs/route.ts
 *
 * The signed-in read/write path for a family's saved programs. Every handler resolves parentId from the session
 * (`auth()`), never from the request body. Signed-out requests get 401 and
 * never touch Postgres.
 */

import { NextRequest } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import {
  findParentId,
  getOrCreateParentId,
  getSavedPrograms,
  addSavedProgram,
  removeSavedProgram,
  reorderSavedPrograms,
} from '@/lib/saved-lists-db'

const UNAUTHORIZED = () => Response.json({ error: 'Sign in required' }, { status: 401 })

// NYC DOE school code: district, borough letter, school number (e.g. 02M475).
const DBN = /^\d{2}[MKXQR]\d{3}$/
// High-school program code (e.g. M89S, Q60A).
const PROGRAM_CODE = /^[A-Z]\d{2}[A-Z]$/
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
  const programs = parentId === null ? [] : await getSavedPrograms(parentId)
  return Response.json({ programs })
}

export async function POST(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) return UNAUTHORIZED()

  const { dbn, program_code } = await request.json()
  if (typeof dbn !== 'string' || !DBN.test(dbn) || typeof program_code !== 'string' || !PROGRAM_CODE.test(program_code)) {
    return Response.json({ error: 'a valid dbn and program_code are required' }, { status: 400 })
  }

  const parentId = await resolveParentId(userId)
  const programs = await addSavedProgram(parentId, { dbn, program_code })
  return Response.json({ programs })
}

export async function DELETE(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) return UNAUTHORIZED()

  const { program_code } = await request.json()
  if (typeof program_code !== 'string' || !PROGRAM_CODE.test(program_code)) {
    return Response.json({ error: 'a valid program_code is required' }, { status: 400 })
  }

  const parentId = await findParentId(userId)
  const programs = parentId === null ? [] : await removeSavedProgram(parentId, program_code)
  return Response.json({ programs })
}

export async function PUT(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) return UNAUTHORIZED()

  const { order } = await request.json()
  if (!Array.isArray(order) || order.length > MAX_ORDER || !order.every((c) => typeof c === 'string' && PROGRAM_CODE.test(c))) {
    return Response.json({ error: 'order must be a program_code array' }, { status: 400 })
  }

  const parentId = await findParentId(userId)
  const programs = parentId === null ? [] : await reorderSavedPrograms(parentId, order)
  return Response.json({ programs })
}
