/**
 * seed-schools.ts
 *
 * Seeds the Vercel Postgres (Neon) `schools` table from local scraped data.
 * Reads data/schools.json and upserts every record keyed by DBN, so the
 * production /list and /requirements pages can load school data from the
 * database instead of the gitignored JSON file.
 *
 * Run manually after each scrape (requires production DB credentials):
 *   npx ts-node scripts/seed-schools.ts
 *
 * Requires: POSTGRES_URL in .env.local
 */

import fs from "fs";
import path from "path";
import dotenv from "dotenv";

// Load env vars from .env.local
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { sql } from "@vercel/postgres";

interface School {
  dbn: string;
  name: string;
  [key: string]: unknown;
}

async function main() {
  // Load schools
  const schoolsPath = path.resolve(process.cwd(), "data", "schools.json");
  if (!fs.existsSync(schoolsPath)) {
    console.error("data/schools.json not found.");
    process.exit(1);
  }

  const schools: School[] = JSON.parse(fs.readFileSync(schoolsPath, "utf-8"));
  console.log(`Loaded ${schools.length} schools from ${schoolsPath}.`);

  await sql`
    CREATE TABLE IF NOT EXISTS schools (
      dbn   TEXT PRIMARY KEY,
      data  JSONB
    )
  `;

  let upserted = 0;
  for (const school of schools) {
    if (!school.dbn) {
      console.warn(`Skipping record with no dbn: ${school.name ?? "(unnamed)"}`);
      continue;
    }
    await sql`
      INSERT INTO schools (dbn, data)
      VALUES (${school.dbn}, ${JSON.stringify(school)})
      ON CONFLICT (dbn) DO UPDATE SET data = EXCLUDED.data
    `;
    upserted++;
    if (upserted % 50 === 0) {
      console.log(`Upserted ${upserted}/${schools.length}...`);
    }
  }

  console.log(`Done. Upserted ${upserted} schools into the schools table.`);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
