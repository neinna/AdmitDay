import { sql } from '@vercel/postgres'
import { School } from '@/types'

// School data lives in Vercel Postgres. data/schools.json is gitignored scraped
// output, so it never reaches Vercel deploys — the schools table is seeded
// manually from it via scripts/seed-schools.ts after each scrape.

// Create the table once per cold start. The guard promise dedupes concurrent
// calls; on failure it resets so the next request can retry.
let schemaReady: Promise<void> | null = null

export function ensureSchema(): Promise<void> {
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
// failure doesn't pin [] for the lifetime of the lambda. The cache expires
// after CACHE_TTL_MS so a warm instance picks up a seed without waiting for
// the instance to recycle or the next deploy.
const CACHE_TTL_MS = 5 * 60 * 1000
let cachedSchools: School[] | null = null
let cachedAt = 0

export async function getAllSchools(): Promise<School[]> {
  if (cachedSchools && Date.now() - cachedAt < CACHE_TTL_MS) return cachedSchools
  try {
    await ensureSchema()
    const { rows } = await sql<{ data: School }>`SELECT data FROM schools`
    const schools = rows.map((row) => row.data)
    if (schools.length === 0) {
      // Connected fine but the table is empty (or points at the wrong DB) —
      // surface the connection identity (no credentials) so an empty /list
      // isn't a silent mystery in production.
      const host = (process.env.POSTGRES_URL || '(unset)').replace(/^.*@/, '').split('/')[0]
      const meta = await sql`SELECT current_database() AS db, current_schema() AS schema`
      console.warn(
        '[load-schools] 0 rows; host=' + host + ' db=' + meta.rows[0].db + ' schema=' + meta.rows[0].schema,
      )
    }
    if (schools.length > 0) {
      cachedSchools = schools
      cachedAt = Date.now()
    }
    return schools
  } catch (e) {
    // Return [] so the page shows its empty-state banner instead of crashing —
    // but log the real error; a silent catch made a prod outage undiagnosable.
    console.error('[load-schools] getAllSchools failed:', (e as Error)?.message ?? e)
    return []
  }
}
