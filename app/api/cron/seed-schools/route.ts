/**
 * app/api/cron/seed-schools/route.ts
 *
 * Issue #236, part of #175 option B: the database secret stays in Vercel.
 * A Vercel Cron job hits this route daily, which loads the committed
 * schools.json (bundled with the deployment — data/schools.json is
 * gitignored and never reaches Vercel) and upserts it into Postgres.
 */

import { sql } from '@vercel/postgres'
import schools from '@/schools.json'
import { validateSchoolData } from '@/lib/validate-school-data'
import { ensureSchema } from '@/lib/load-schools'

// A school excluded from this cycle's schools.json (issue #255) must also
// leave production. Deleting unconditionally is one bad file away from
// wiping the table, so a delete that would remove more than this fraction of
// the current rows is skipped instead of run.
const DELETE_SAFETY_CAP_RATIO = 0.05

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const validation = validateSchoolData(schools)
  if (!validation.valid) {
    return Response.json({ errors: validation.errors }, { status: 422 })
  }

  await ensureSchema()
  const result = await sql`
    INSERT INTO schools (dbn, data)
    SELECT x->>'dbn', x FROM jsonb_array_elements(${JSON.stringify(schools)}::jsonb) AS x
    ON CONFLICT (dbn) DO UPDATE SET data = EXCLUDED.data
    WHERE schools.data IS DISTINCT FROM EXCLUDED.data
  `

  const dbns = schools.map((s) => s.dbn)
  let deleted = 0
  let deleteSkipped = 0

  const totalResult = await sql`SELECT COUNT(*) FROM schools`
  const totalRows = Number(totalResult.rows[0]?.count ?? 0)

  if (totalRows > 0) {
    // sql`` only types interpolated values as Primitive; sql.query() (inherited
    // from the underlying Pool) accepts the array param this ALL(...) cast needs.
    const toDeleteResult = await sql.query('SELECT COUNT(*) FROM schools WHERE dbn <> ALL($1::text[])', [dbns])
    const toDeleteCount = Number(toDeleteResult.rows[0]?.count ?? 0)

    if (toDeleteCount > totalRows * DELETE_SAFETY_CAP_RATIO) {
      console.error(
        `[seed-schools] refusing to delete ${toDeleteCount}/${totalRows} rows ` +
          `(over the ${DELETE_SAFETY_CAP_RATIO * 100}% safety cap) -- skipping delete`
      )
      deleteSkipped = toDeleteCount
    } else if (toDeleteCount > 0) {
      const deleteResult = await sql.query('DELETE FROM schools WHERE dbn <> ALL($1::text[])', [dbns])
      deleted = deleteResult.rowCount ?? 0
    }
  }

  const total = schools.length
  const changed = result.rowCount ?? 0
  console.log(`[seed-schools] total=${total} changed=${changed} deleted=${deleted} deleteSkipped=${deleteSkipped}`)
  return Response.json({ total, changed, deleted, deleteSkipped })
}
