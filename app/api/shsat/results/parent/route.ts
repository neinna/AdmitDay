import { NextResponse } from 'next/server'
import { getDb } from '@/lib/shsat-db'

export const dynamic = 'force-dynamic'

const KIDS = ['alice', 'jake']

export async function GET() {
  try {
    const db = getDb()
    const rows = db
      .prepare(
        `SELECT id, kid, test_id, timestamp, raw_score, total_q, scaled_score, time_used_s, answers_json
         FROM shsat_results WHERE kid IN (${KIDS.map(() => '?').join(',')})
         ORDER BY timestamp DESC`
      )
      .all(...KIDS) as {
      id: number
      kid: string
      test_id: string
      timestamp: string
      raw_score: number
      total_q: number
      scaled_score: number
      time_used_s: number
      answers_json: string
    }[]

    const results = rows.map((r) => ({
      ...r,
      answers_json: JSON.parse(r.answers_json),
    }))

    return NextResponse.json({ ok: true, results })
  } catch (err) {
    console.error('GET /api/shsat/results/parent error:', err)
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 })
  }
}
