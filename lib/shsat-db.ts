import { sql } from '@vercel/postgres'

// Serverless-friendly Postgres data layer for SHSAT results + PINs.
// Replaces the old local better-sqlite3 file DB (which can't persist on Vercel).
// Connection comes from the POSTGRES_URL env var, injected automatically when
// you attach a Vercel Postgres store to the project.

export interface ShsatResultRow {
  id: number
  kid: string
  test_id: string
  timestamp: string
  raw_score: number
  total_q: number
  scaled_score: number
  time_used_s: number
  answers_json: string
}

export type ShsatResultSummary = Omit<ShsatResultRow, 'answers_json'>

// Create tables once per cold start. The guard promise dedupes concurrent calls;
// on failure it resets so the next request can retry.
let schemaReady: Promise<void> | null = null

export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS shsat_results (
          id            SERIAL PRIMARY KEY,
          kid           TEXT NOT NULL,
          test_id       TEXT NOT NULL,
          timestamp     TIMESTAMPTZ DEFAULT now(),
          raw_score     INTEGER NOT NULL,
          total_q       INTEGER NOT NULL,
          scaled_score  INTEGER NOT NULL,
          time_used_s   INTEGER NOT NULL,
          answers_json  TEXT NOT NULL
        )
      `
      await sql`
        CREATE TABLE IF NOT EXISTS shsat_pins (
          kid       TEXT PRIMARY KEY,
          pin_hash  TEXT NOT NULL
        )
      `
    })().catch((err) => {
      schemaReady = null
      throw err
    })
  }
  return schemaReady
}

// ---- PINs ----

export async function pinExists(kid: string): Promise<boolean> {
  await ensureSchema()
  const { rows } = await sql`SELECT kid FROM shsat_pins WHERE kid = ${kid}`
  return rows.length > 0
}

export async function getPinHash(kid: string): Promise<string | undefined> {
  await ensureSchema()
  const { rows } = await sql<{ pin_hash: string }>`
    SELECT pin_hash FROM shsat_pins WHERE kid = ${kid}
  `
  return rows[0]?.pin_hash
}

export async function createPin(kid: string, pinHash: string): Promise<void> {
  await ensureSchema()
  await sql`INSERT INTO shsat_pins (kid, pin_hash) VALUES (${kid}, ${pinHash})`
}

// ---- Results ----

export async function insertResult(r: {
  kid: string
  test_id: string
  raw_score: number
  total_q: number
  scaled_score: number
  time_used_s: number
  answers_json: string
}): Promise<number> {
  await ensureSchema()
  const { rows } = await sql<{ id: number }>`
    INSERT INTO shsat_results
      (kid, test_id, raw_score, total_q, scaled_score, time_used_s, answers_json)
    VALUES
      (${r.kid}, ${r.test_id}, ${r.raw_score}, ${r.total_q}, ${r.scaled_score}, ${r.time_used_s}, ${r.answers_json})
    RETURNING id
  `
  return rows[0].id
}

export async function getResultsByKid(kid: string): Promise<ShsatResultSummary[]> {
  await ensureSchema()
  const { rows } = await sql<ShsatResultSummary>`
    SELECT id, kid, test_id, timestamp, raw_score, total_q, scaled_score, time_used_s
    FROM shsat_results WHERE kid = ${kid} ORDER BY timestamp DESC
  `
  return rows
}

export async function getResultByKidAndTest(
  kid: string,
  testId: string
): Promise<ShsatResultRow | undefined> {
  await ensureSchema()
  const { rows } = await sql<ShsatResultRow>`
    SELECT id, kid, test_id, timestamp, raw_score, total_q, scaled_score, time_used_s, answers_json
    FROM shsat_results WHERE kid = ${kid} AND test_id = ${testId}
    ORDER BY timestamp DESC LIMIT 1
  `
  return rows[0]
}

export async function getResultsForKids(kids: string[]): Promise<ShsatResultRow[]> {
  await ensureSchema()
  const placeholders = kids.map((_, i) => `$${i + 1}`).join(', ')
  const { rows } = await sql.query<ShsatResultRow>(
    `SELECT id, kid, test_id, timestamp, raw_score, total_q, scaled_score, time_used_s, answers_json
     FROM shsat_results WHERE kid IN (${placeholders}) ORDER BY timestamp DESC`,
    kids
  )
  return rows
}
