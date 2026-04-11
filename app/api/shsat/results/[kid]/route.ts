import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { getDb } from '@/lib/shsat-db'

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

  const db = getDb()
  const pinRow = db.prepare('SELECT pin_hash FROM shsat_pins WHERE kid = ?').get(kid) as
    | { pin_hash: string }
    | undefined
  if (!pinRow) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const match = await bcrypt.compare(pin, pinRow.pin_hash)
  if (!match) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const results = db
    .prepare(
      `SELECT id, kid, test_id, timestamp, raw_score, total_q, scaled_score, time_used_s
       FROM shsat_results WHERE kid = ? ORDER BY timestamp DESC`
    )
    .all(kid)

  return NextResponse.json({ ok: true, results })
}
