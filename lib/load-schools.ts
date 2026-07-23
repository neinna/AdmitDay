import { sql } from '@vercel/postgres'
import { School } from '@/types'

// School data lives in Vercel Postgres (same Neon store as SHSAT results in
// lib/shsat-db.ts). data/schools.json is gitignored scraped output, so it never
// reaches Vercel deploys — the schools table is seeded manually from it via
// scripts/seed-schools.ts after each scrape.

// Create the table once per cold start. The guard promise dedupes concurrent
// calls; on failure it resets so the next request can retry.
let schemaReady: Promise<void> | null = null

function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS schools (
          dbn   TEXT PRIMARY KEY,
          data  JSONB
        )
      `
    })().catch((err) => {
      schemaReady = null
      throw err
    })
  }
  return schemaReady
}

// Cached per lambda so repeated calls in the same instance don't re-query.
// Only non-empty results are cached, so an empty table or a transient DB
// failure doesn't pin [] for the lifetime of the lambda.
let cachedSchools: School[] | null = null

export async function getAllSchools(): Promise<School[]> {
  if (cachedSchools) return cachedSchools
  try {
    await ensureSchema()
    const { rows } = await sql<{ data: School }>`SELECT data FROM schools`
    const schools = rows.map((row) => row.data)
    if (schools.length === 0) {
      // Connected fine but the table is empty (or points at the wrong DB) —
      // surface it so an empty /list isn't a silent mystery in production.
      console.warn('[load-schools] SELECT returned 0 rows from the schools table')
    }
    if (schools.length > 0) cachedSchools = schools
    return schools
  } catch (e) {
    // Return [] so the page shows its empty-state banner instead of crashing —
    // but log the real error; a silent catch made a prod outage undiagnosable.
    console.error('[load-schools] getAllSchools failed:', (e as Error)?.message ?? e)
    return []
  }
}
