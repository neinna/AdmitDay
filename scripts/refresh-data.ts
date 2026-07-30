/**
 * refresh-data.ts
 *
 * The one entry point for refreshing NYC school data for a new admissions
 * cycle. Runs the existing pieces in order and writes data/schools.json:
 *
 *   1. Scrape current DOE / NYC-SIFT data (build_school_data.py) -> schools.json
 *   2. Validate the scrape (lib/validate-school-data.ts) -- fails loudly and
 *      exits without writing anything if the result looks broken.
 *   3. Write data/schools.json from the validated scrape.
 *   4. Reseed the Postgres `schools` table (scripts/seed-schools.ts).
 *   5. Re-embed school data (scripts/embed-schools.ts).
 *
 * Run:
 *   npm run refresh:data
 *
 * Requires POSTGRES_URL and OPENAI_API_KEY in .env.local (steps 4 and 5 read
 * them the same way scripts/seed-schools.ts and scripts/embed-schools.ts
 * already do).
 */

import fs from 'fs'
import path from 'path'
import { spawnSync } from 'child_process'
import { validateSchoolData, RawSchoolRecord } from '../lib/validate-school-data'

const ROOT_SCHOOLS_PATH = path.resolve(process.cwd(), 'schools.json')
const DATA_SCHOOLS_PATH = path.resolve(process.cwd(), 'data', 'schools.json')

function readJsonArray(filePath: string): unknown[] | null {
  if (!fs.existsSync(filePath)) return null
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  return Array.isArray(parsed) ? parsed : null
}

function run(command: string, args: string[]): void {
  console.log(`\n$ ${command} ${args.join(' ')}`)
  const result = spawnSync(command, args, { stdio: 'inherit' })
  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    throw new Error(`Command failed (exit ${result.status}): ${command} ${args.join(' ')}`)
  }
}

function printSummary(
  previousCount: number | null,
  newCount: number,
  added: string[],
  removed: string[],
  invalidRecords: { index: number; dbn?: string; reasons: string[] }[]
): void {
  console.log('\n── Refresh summary ─────────────────────────────────')
  console.log(`Schools before: ${previousCount ?? '(none)'}`)
  console.log(`Schools after:  ${newCount}`)
  console.log(`Added:          ${added.length}`)
  if (added.length > 0) console.log(`  ${added.join(', ')}`)
  console.log(`Removed:        ${removed.length}`)
  if (removed.length > 0) console.log(`  ${removed.join(', ')}`)
  console.log(`Failed validation: ${invalidRecords.length}`)
  invalidRecords.forEach((r) => {
    console.log(`  [${r.index}] ${r.dbn ?? '(no dbn)'}: ${r.reasons.join('; ')}`)
  })
  console.log('─────────────────────────────────────────────────────')
}

async function main(): Promise<void> {
  // Baseline for the drop check: the currently-seeded data/schools.json if
  // present, otherwise whatever schools.json already has.
  const previousSchools = readJsonArray(DATA_SCHOOLS_PATH) ?? readJsonArray(ROOT_SCHOOLS_PATH)

  // 1. Scrape.
  run('python3', ['build_school_data.py'])

  const scraped = readJsonArray(ROOT_SCHOOLS_PATH)
  if (!scraped) {
    throw new Error(`${ROOT_SCHOOLS_PATH} was not produced by the scrape (or is not a JSON array).`)
  }

  // 2. Validate.
  const result = validateSchoolData(scraped as RawSchoolRecord[], previousSchools)
  printSummary(result.previousCount, result.schoolCount, result.added, result.removed, result.invalidRecords)

  if (!result.valid) {
    console.error('\nValidation FAILED -- refusing to write data/schools.json.')
    result.errors.forEach((e) => console.error(`  - ${e}`))
    process.exit(1)
  }
  console.log('\nValidation passed.')

  // 3. Write data/schools.json.
  fs.mkdirSync(path.dirname(DATA_SCHOOLS_PATH), { recursive: true })
  fs.writeFileSync(DATA_SCHOOLS_PATH, JSON.stringify(scraped, null, 2))
  console.log(`Wrote ${DATA_SCHOOLS_PATH}`)

  // 4. Reseed Postgres.
  run('npx', [
    'ts-node',
    '--compiler-options',
    '{"module":"commonjs","moduleResolution":"node"}',
    '--transpile-only',
    'scripts/seed-schools.ts',
  ])

  // 5. Re-embed.
  run('npx', [
    'ts-node',
    '--compiler-options',
    '{"module":"commonjs","moduleResolution":"node"}',
    '--transpile-only',
    'scripts/embed-schools.ts',
  ])

  console.log('\nData refresh complete.')
}

main().catch((err) => {
  console.error('Error:', err instanceof Error ? err.message : err)
  process.exit(1)
})
