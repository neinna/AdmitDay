import { isLotteryValue } from '@/lib/lottery'
import type { School } from '@/types'

/**
 * A student is a label the parent picks ("Kid 1", not a name) plus the few
 * facts that decide admissions priority: where the child lives, where their
 * current school is, their zoned high school, and the first two characters of
 * the lottery number as 0-255. No name, school name, grade or date of birth,
 * no disability or lunch status, and never the full 32-character lottery number.
 *
 * Pure: no I/O, safe to import in the browser.
 */

export type Borough = 'M' | 'K' | 'X' | 'Q' | 'R'

export const BOROUGHS: { code: Borough; name: string }[] = [
  { code: 'M', name: 'Manhattan' },
  { code: 'X', name: 'Bronx' },
  { code: 'K', name: 'Brooklyn' },
  { code: 'Q', name: 'Queens' },
  { code: 'R', name: 'Staten Island' },
]

/** NYC community school districts by borough. */
export const DISTRICTS: Record<Borough, number[]> = {
  M: [1, 2, 3, 4, 5, 6],
  X: [7, 8, 9, 10, 11, 12],
  K: [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 32],
  Q: [24, 25, 26, 27, 28, 29, 30],
  R: [31],
}

export const LABEL_MAX = 20

export interface Student {
  label: string
  home_borough: Borough
  home_district: number | null
  school_borough: Borough | null
  school_district: number | null
  /** DBN of the high school the student is zoned for, if any. */
  zoned_dbn: string | null
  /** First two lottery characters read as 0-255. */
  lottery: number | null
}

/** MySchools' name for the zoned priority group. */
export const ZONED_GROUP = 'Students who live in the zoned area'

const DBN = /^\d{2}[MKXQR]\d{3}$/

/** Schools with at least one program that gives zoned priority, by name. */
export function zonedSchools(schools: School[]): { dbn: string; name: string }[] {
  return schools
    .filter((s) =>
      (s.programs ?? []).some((p) => {
        const groups = (p.eligibility as { priority_groups?: { name?: string }[] } | undefined)?.priority_groups
        return Array.isArray(groups) && groups.some((g) => g?.name === ZONED_GROUP)
      })
    )
    .map((s) => ({ dbn: s.dbn, name: s.name }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function boroughName(code: Borough): string {
  return BOROUGHS.find((b) => b.code === code)!.name
}

function isBorough(v: unknown): v is Borough {
  return typeof v === 'string' && BOROUGHS.some((b) => b.code === v)
}

function districtOrNull(v: unknown, borough: Borough | null, field: string): number | null | string {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'string' ? Number(v) : v
  if (typeof n !== 'number' || !Number.isInteger(n)) return `${field} must be a district number`
  if (!borough) return `${field} needs a borough`
  if (!DISTRICTS[borough].includes(n)) return `District ${n} is not in ${boroughName(borough)}`
  return n
}

/** Validates an untrusted request body. Unknown fields are dropped, never stored. */
export function parseStudent(body: unknown): { ok: true; student: Student } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>
  const label = typeof b.label === 'string' ? b.label.trim() : ''
  if (!label) return { ok: false, error: 'label is required' }
  if (label.length > LABEL_MAX) return { ok: false, error: `label must be ${LABEL_MAX} characters or fewer` }

  if (!isBorough(b.home_borough)) return { ok: false, error: 'home_borough is required' }
  const home_borough = b.home_borough

  let school_borough: Borough | null = null
  if (b.school_borough !== null && b.school_borough !== undefined && b.school_borough !== '') {
    if (!isBorough(b.school_borough)) return { ok: false, error: 'school_borough is not a borough' }
    school_borough = b.school_borough
  }

  const home_district = districtOrNull(b.home_district, home_borough, 'home_district')
  if (typeof home_district === 'string') return { ok: false, error: home_district }
  const school_district = districtOrNull(b.school_district, school_borough, 'school_district')
  if (typeof school_district === 'string') return { ok: false, error: school_district }

  let lottery: number | null = null
  if (b.lottery !== null && b.lottery !== undefined) {
    if (!isLotteryValue(b.lottery)) return { ok: false, error: 'lottery must be 0-255' }
    lottery = b.lottery
  }

  let zoned_dbn: string | null = null
  if (b.zoned_dbn !== null && b.zoned_dbn !== undefined && b.zoned_dbn !== '') {
    if (typeof b.zoned_dbn !== 'string' || !DBN.test(b.zoned_dbn)) return { ok: false, error: 'zoned_dbn is not a DBN' }
    zoned_dbn = b.zoned_dbn
  }

  return {
    ok: true,
    student: { label, home_borough, home_district, school_borough, school_district, zoned_dbn, lottery },
  }
}

/**
 * The MySchools borough priority groups this student falls in, named exactly
 * as MySchools names them. A borough group counts students who attend school
 * there or live there, so home and school borough can each qualify. A zoned
 * school adds "Students who live in the zoned area" (that school only).
 */
export function geoPriorityGroups(
  s: Pick<Student, 'home_borough' | 'school_borough'> & Partial<Pick<Student, 'zoned_dbn'>>,
  zonedName?: string
): string[] {
  const boroughs = [s.home_borough, s.school_borough].filter((b): b is Borough => !!b)
  const names = [...new Set(boroughs)].map((b) => `${boroughName(b)} students or residents`)
  const zoned = s.zoned_dbn ? [`${ZONED_GROUP} (${zonedName ?? s.zoned_dbn} only)`] : []
  return [...zoned, ...names, 'New York City residents']
}
