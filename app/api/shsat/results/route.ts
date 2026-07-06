import { NextRequest, NextResponse } from 'next/server'
import { insertResult } from '@/lib/shsat-db'

const VALID_KIDS = ['alice', 'jake']

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { kid, test_id, raw_score, total_q, scaled_score, time_used_s, answers_json } = body

    if (!VALID_KIDS.includes(kid)) {
      return NextResponse.json({ ok: false, error: 'Invalid kid' }, { status: 400 })
    }
    if (!test_id || typeof test_id !== 'string') {
      return NextResponse.json({ ok: false, error: 'Invalid test_id' }, { status: 400 })
    }
    if (!Number.isInteger(raw_score) || !Number.isInteger(total_q) || !Number.isInteger(time_used_s)) {
      return NextResponse.json({ ok: false, error: 'Invalid numeric fields' }, { status: 400 })
    }
    if (typeof answers_json !== 'string') {
      return NextResponse.json({ ok: false, error: 'answers_json must be a string' }, { status: 400 })
    }
    try {
      JSON.parse(answers_json)
    } catch {
      return NextResponse.json({ ok: false, error: 'answers_json is not valid JSON' }, { status: 400 })
    }

    // Recalculate and verify scaled score server-side
    const expectedScaled = 200 + Math.round((raw_score / total_q) * 600)
    if (scaled_score !== expectedScaled) {
      return NextResponse.json({ ok: false, error: 'scaled_score mismatch' }, { status: 400 })
    }

    const id = await insertResult({
      kid,
      test_id,
      raw_score,
      total_q,
      scaled_score,
      time_used_s,
      answers_json,
    })

    return NextResponse.json({ ok: true, id })
  } catch (err) {
    console.error('POST /api/shsat/results error:', err)
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 })
  }
}
