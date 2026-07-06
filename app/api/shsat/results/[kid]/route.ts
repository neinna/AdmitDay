import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { getPinHash, getResultsByKid } from '@/lib/shsat-db'

const VALID_KIDS = ['alice', 'jake']

export async function GET(
  req: NextRequest,
  { params }: { params: { kid: string } }
) {
  const { kid } = params
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

  const results = await getResultsByKid(kid)

  return NextResponse.json({ ok: true, results })
}
