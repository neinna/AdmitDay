import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { getPinHash, getResultByKidAndTest } from '@/lib/shsat-db'

const VALID_KIDS = ['alice', 'jake']

export async function GET(
  req: NextRequest,
  { params }: { params: { kid: string; testId: string } }
) {
  const { kid, testId } = params
  if (!VALID_KIDS.includes(kid)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const pin = req.headers.get('x-shsat-pin')
  if (!pin) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const pinHash = await getPinHash(kid)
  if (!pinHash) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const match = await bcrypt.compare(pin, pinHash)
  if (!match) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const row = await getResultByKidAndTest(kid, testId)

  if (!row) {
    return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({
    ok: true,
    result: {
      ...row,
      answers_json: JSON.parse(row.answers_json),
    },
  })
}
