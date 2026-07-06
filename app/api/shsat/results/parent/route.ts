import { NextResponse } from 'next/server'
import { getResultsForKids } from '@/lib/shsat-db'

export const dynamic = 'force-dynamic'

const KIDS = ['alice', 'jake']

export async function GET() {
  try {
    const rows = await getResultsForKids(KIDS)

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
