import { sql } from '@/lib/db'
import { School } from '@/types'
import bundledSchools from '@/schools.json'

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

// School pages read the schools.json bundled with each deployment instead of
// querying Postgres. Pulling the full table (~4 MB) on every cache miss used up
// the Neon free-plan data transfer and took the site down (HTTP 402). The
// seed-schools cron still upserts the same file into Postgres.
export async function getAllSchools(): Promise<School[]> {
  return bundledSchools as unknown as School[]
}
