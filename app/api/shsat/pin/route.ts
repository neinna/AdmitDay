import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { getDb } from '@/lib/shsat-db'

const VALID_KIDS = ['alice', 'jake']
const PIN_REGEX = /^\d{4}$/

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { kid, action, pin } = body

    if (!VALID_KIDS.includes(kid)) {
      return NextResponse.json({ ok: false, error: 'Invalid kid' }, { status: 400 })
    }
    if (action !== 'create' && action !== 'verify') {
      return NextResponse.json({ ok: false, error: 'Invalid action' }, { status: 400 })
    }
    if (!PIN_REGEX.test(pin)) {
      return NextResponse.json({ ok: false, error: 'PIN must be exactly 4 numeric digits' }, { status: 400 })
    }

    const db = getDb()

    if (action === 'create') {
      const existing = db.prepare('SELECT kid FROM shsat_pins WHERE kid = ?').get(kid)
      if (existing) {
        return NextResponse.json({ ok: false, error: 'PIN already set' }, { status: 400 })
      }
      const hash = await bcrypt.hash(pin, 10)
      db.prepare('INSERT INTO shsat_pins (kid, pin_hash) VALUES (?, ?)').run(kid, hash)
      return NextResponse.json({ ok: true })
    }

    // action === 'verify'
    const row = db.prepare('SELECT pin_hash FROM shsat_pins WHERE kid = ?').get(kid) as { pin_hash: string } | undefined
    if (!row) {
      return NextResponse.json({ ok: false, error: 'Invalid PIN' })
    }
    const match = await bcrypt.compare(pin, row.pin_hash)
    if (!match) {
      return NextResponse.json({ ok: false, error: 'Invalid PIN' })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('POST /api/shsat/pin error:', err)
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  // Check if a kid has a PIN set (returns hasPIN without revealing hash)
  const kid = req.nextUrl.searchParams.get('kid')
  if (!kid || !VALID_KIDS.includes(kid)) {
    return NextResponse.json({ ok: false, error: 'Invalid kid' }, { status: 400 })
  }
  const db = getDb()
  const row = db.prepare('SELECT kid FROM shsat_pins WHERE kid = ?').get(kid)
  return NextResponse.json({ ok: true, hasPIN: !!row })
}
