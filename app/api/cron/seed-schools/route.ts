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

  const total = schools.length
  const changed = result.rowCount ?? 0
  console.log(`[seed-schools] total=${total} changed=${changed}`)
  return Response.json({ total, changed })
}
