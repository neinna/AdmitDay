import { sql } from '@/lib/db'
import { ensureSchema } from '@/lib/saved-lists-db'
import type { Borough, Student } from '@/lib/students'

/**
 * Students in Postgres. Like lib/saved-lists-db.ts, nothing here reads the
 * session: callers pass a parentId they resolved from `auth()`. The table is
 * created in ensureSchema (lib/saved-lists-db.ts).
 */

interface StudentRow {
  label: string
  home_borough: string
  home_district: number | null
  school_borough: string | null
  school_district: number | null
  zoned_dbn: string | null
  swd: boolean | null
  frl: boolean | null
  lottery: number | null
}

function toStudent(r: StudentRow): Student {
  return {
    label: r.label,
    home_borough: r.home_borough as Borough,
    home_district: r.home_district,
    school_borough: (r.school_borough as Borough | null) ?? null,
    school_district: r.school_district,
    zoned_dbn: r.zoned_dbn ?? null,
    swd: r.swd ?? null,
    frl: r.frl ?? null,
    lottery: r.lottery,
  }
}

/** The parent's student, or null. */
export async function getStudent(parentId: number): Promise<Student | null> {
  await ensureSchema()
  const { rows } = await sql<StudentRow>`
    SELECT label, home_borough, home_district, school_borough, school_district, zoned_dbn, swd, frl, lottery
    FROM students WHERE parent_id = ${parentId}
  `
  return rows[0] ? toStudent(rows[0]) : null
}

/** Creates or replaces the parent's one student. */
export async function saveStudent(parentId: number, s: Student): Promise<Student> {
  await ensureSchema()
  const { rows } = await sql<StudentRow>`
    INSERT INTO students (parent_id, label, home_borough, home_district, school_borough, school_district, zoned_dbn, swd, frl, lottery)
    VALUES (${parentId}, ${s.label}, ${s.home_borough}, ${s.home_district}, ${s.school_borough}, ${s.school_district}, ${s.zoned_dbn}, ${s.swd}, ${s.frl}, ${s.lottery})
    ON CONFLICT (parent_id) DO UPDATE SET
      label = EXCLUDED.label,
      home_borough = EXCLUDED.home_borough,
      home_district = EXCLUDED.home_district,
      school_borough = EXCLUDED.school_borough,
      school_district = EXCLUDED.school_district,
      zoned_dbn = EXCLUDED.zoned_dbn,
      swd = EXCLUDED.swd,
      frl = EXCLUDED.frl,
      lottery = EXCLUDED.lottery,
      updated_at = now()
    RETURNING label, home_borough, home_district, school_borough, school_district, zoned_dbn, swd, frl, lottery
  `
  return toStudent(rows[0])
}

/** Deleting when there is no student is a no-op. */
export async function deleteStudent(parentId: number): Promise<void> {
  await ensureSchema()
  await sql`DELETE FROM students WHERE parent_id = ${parentId}`
}
