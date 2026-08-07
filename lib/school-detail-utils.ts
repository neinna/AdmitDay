/**
 * school-detail-utils.ts
 *
 * Pure data-shaping helpers for /school/[dbn] (issue #116). Every number
 * shown on that screen must be a DOE-published value — nothing computed,
 * scored, or estimated — so this module's job is strictly presentation:
 * pick which fields exist, format them, and produce the exact "not
 * reported" / "not offered" copy the design requires. No ranking, no
 * derived scores.
 *
 * Kept framework-free (no JSX/React) so it can be unit-tested directly,
 * following this repo's convention (see lib/school-list-utils.ts).
 */

import { School } from '@/types'
import { FindFilters } from '@/lib/school-list-utils'

// ── Lookup ───────────────────────────────────────────────────────────────────

export function findSchoolByDbn(schools: School[], dbn: string): School | undefined {
  return schools.find((s) => s.dbn === dbn)
}

// Same fix applied by components/SchoolRow.tsx and app/find/FindClient.tsx.
export function formatSchoolName(name: string): string {
  if (name.endsWith(', The')) return 'The ' + name.slice(0, -5)
  return name
}

// ── The numbers (stat grid) ──────────────────────────────────────────────────

export interface StatCell {
  key: string
  value: string
  label: string
}

interface StatField {
  key: string
  gridLabel: string
  sentenceLabel: string
  get: (school: School) => number | null | undefined
  format: (value: number) => string
}

const pct = (v: number) => `${Math.round(v)}%`
const ratePct = (v: number) => `${Math.round(v * 100)}%`

// Render order is fixed by the design — only present fields render, but
// always in this sequence.
const STAT_FIELDS: StatField[] = [
  {
    key: 'applicantsPerSeat',
    gridLabel: 'Applicants per seat',
    sentenceLabel: 'applicants per seat',
    get: (s) => s.applicants_per_seat,
    format: (v) => v.toFixed(1),
  },
  {
    key: 'totalStudents',
    gridLabel: 'Total students',
    sentenceLabel: 'total student count',
    get: (s) => s.total_students,
    format: (v) => v.toLocaleString(),
  },
  {
    key: 'academicScore',
    gridLabel: 'Academic score',
    sentenceLabel: 'academic score',
    get: (s) => s.academic_score_pct,
    format: pct,
  },
  {
    key: 'surveyScore',
    gridLabel: 'Survey score',
    sentenceLabel: 'survey score',
    get: (s) => s.survey_score_pct,
    format: pct,
  },
  {
    key: 'graduationRate',
    gridLabel: 'Graduation rate',
    sentenceLabel: 'graduation rate',
    get: (s) => s.doe_data?.graduation_rate,
    format: ratePct,
  },
  {
    key: 'attendanceRate',
    gridLabel: 'Attendance rate',
    sentenceLabel: 'attendance rate',
    get: (s) => s.doe_data?.attendance_rate,
    format: ratePct,
  },
  {
    key: 'collegeCareerRate',
    gridLabel: 'College & career',
    sentenceLabel: 'college & career rate',
    get: (s) => s.doe_data?.college_career_rate,
    format: ratePct,
  },
]

function isPresent(value: number | null | undefined): value is number {
  return typeof value === 'number' && !Number.isNaN(value)
}

/** Only the stats DOE actually published for this school, in the fixed design order. Absent stats are omitted, never zeroed. */
export function buildStatCells(school: School): StatCell[] {
  return STAT_FIELDS.filter((f) => isPresent(f.get(school))).map((f) => ({
    key: f.key,
    value: f.format(f.get(school) as number),
    label: f.gridLabel,
  }))
}

/** Sentence-form labels (lowercase, natural reading order) for stats DOE did not publish. */
export function getMissingStatLabels(school: School): string[] {
  return STAT_FIELDS.filter((f) => !isPresent(f.get(school))).map((f) => f.sentenceLabel)
}

function capitalize(s: string): string {
  return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s
}

/** Oxford-comma join: ["a"] -> "a"; ["a","b"] -> "a and b"; ["a","b","c"] -> "a, b, and c". */
function joinOxford(items: string[]): string {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0]
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`
}

/**
 * The required "gap in the DOE data, not a low result" sentence — null when
 * nothing is missing (rule: absence is stated once, in words, below the grid).
 */
export function buildNotReportedStatsSentence(missingLabels: string[]): string | null {
  if (missingLabels.length === 0) return null
  const verb = missingLabels.length === 1 ? 'is' : 'are'
  const list = capitalize(joinOxford(missingLabels))
  return `${list} ${verb} not published for this school. That is a gap in the DOE data, not a low result.`
}

// ── Activities ───────────────────────────────────────────────────────────────

export interface ActivityGroup {
  key: string
  label: string
  items: string[]
}

/** Splits a comma-separated DOE text field into trimmed, non-empty items. */
export function parseCommaList(value: string | undefined | null): string[] {
  if (!value) return []
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
}

function parsePsalGroup(value: string | undefined | null, suffix: string): string[] {
  return parseCommaList(value).map((sport) => (suffix ? `${sport}, ${suffix}` : sport))
}

/** Combines boys/girls/coed PSAL fields into one chip list, e.g. "Soccer, boys" / "Basketball". */
export function parsePsalSports(school: School): string[] {
  return [
    ...parsePsalGroup(school.doe_data?.psal_sports_boys, 'boys'),
    ...parsePsalGroup(school.doe_data?.psal_sports_girls, 'girls'),
    ...parsePsalGroup(school.doe_data?.psal_sports_coed, ''),
  ]
}

// The extracurriculars field is free DOE text (often a comma list followed by
// a prose sentence or two, e.g. "Chess Club, Debate Club; the school also
// runs a Saturday tutoring program for..."). There's no reliable way to fully
// parse prose, so this keeps only fragments that read like short activity
// names and drops anything sentence-shaped.
const MAX_CHIP_WORDS = 6
const MAX_CHIP_LENGTH = 42

export function parseExtracurriculars(value: string | undefined | null): string[] {
  if (!value) return []
  return value
    .split(/[,;]/)
    .map((v) => v.trim().replace(/^[A-Za-z][A-Za-z /]*:\s*/, ''))
    .filter(Boolean)
    .filter((v) => !v.includes('.'))
    .filter((v) => v.length <= MAX_CHIP_LENGTH)
    .filter((v) => v.split(/\s+/).length <= MAX_CHIP_WORDS)
}

const ACTIVITY_GROUP_DEFS: {
  key: string
  label: string
  missingLabel: string
  get: (school: School) => string[]
}[] = [
  { key: 'psalSports', label: 'PSAL sports', missingLabel: 'PSAL teams', get: parsePsalSports },
  {
    key: 'apCourses',
    label: 'AP courses',
    missingLabel: 'AP courses',
    get: (s) => parseCommaList(s.doe_data?.advancedplacement_courses),
  },
  {
    key: 'languages',
    label: 'Languages',
    missingLabel: 'language offerings',
    get: (s) => parseCommaList(s.doe_data?.language),
  },
  {
    key: 'extracurriculars',
    label: 'Extracurriculars',
    missingLabel: 'extracurriculars',
    get: (s) => parseExtracurriculars(s.doe_data?.extracurriculars),
  },
]

/** Only the activity groups with at least one item — a group with none is dropped, not shown empty. */
export function buildActivityGroups(school: School): ActivityGroup[] {
  return ACTIVITY_GROUP_DEFS.filter((g) => g.get(school).length > 0).map((g) => ({
    key: g.key,
    label: g.label,
    items: g.get(school),
  }))
}

/** Labels (plural nouns) for activity groups this school genuinely has none of. */
export function getMissingActivityLabels(school: School): string[] {
  return ACTIVITY_GROUP_DEFS.filter((g) => g.get(school).length === 0).map((g) => g.missingLabel)
}

// ── Find-row facts (/find) ───────────────────────────────────────────────────

// The /find row rationale line used to be doe_data.overview — DOE marketing
// prose truncated at 140 characters — identical regardless of what the parent
// filtered for (issue #164). These are the published facts that most affect a
// fit decision without repeating what the row's metadata line already shows
// (neighborhood, admissions track, enrollment): the two outcome rates DOE
// reports for nearly every school, and how many AP courses it offers. Same
// omit-don't-zero-fill rule as buildStatCells.
const FIND_ROW_RATE_FACTS: {
  key: string
  get: (school: School) => number | null | undefined
  format: (value: number) => string
}[] = [
  {
    key: 'graduationRate',
    get: (s) => s.doe_data?.graduation_rate,
    format: (v) => `${ratePct(v)} graduation rate`,
  },
  {
    key: 'collegeCareerRate',
    get: (s) => s.doe_data?.college_career_rate,
    format: (v) => `${ratePct(v)} college & career rate`,
  },
]

/** Only the facts DOE actually published for this school, in fixed order. A school missing most of them yields a short (or empty) list, never a zero-filled one. */
export function buildFindRowFacts(school: School): string[] {
  const facts = FIND_ROW_RATE_FACTS.filter((f) => isPresent(f.get(school))).map((f) =>
    f.format(f.get(school) as number)
  )

  const apCount = parseCommaList(school.doe_data?.advancedplacement_courses).length
  if (apCount > 0) facts.push(`${apCount} AP course${apCount === 1 ? '' : 's'}`)

  return facts
}

/** The /find row's replacement for the truncated DOE overview: structured facts on one line, or '' when DOE published none of them. */
export function buildFindRowSummary(school: School): string {
  return buildFindRowFacts(school).join(' · ')
}

/**
 * The "NOT OFFERED" sentence — a fact about the school (it doesn't run these),
 * not a DOE reporting gap, so it reads "no X" rather than "not published".
 * Null when every activity group has at least one item.
 */
export function buildNotOfferedActivitiesSentence(missingLabels: string[]): string | null {
  if (missingLabels.length === 0) return null
  const list = joinOxford(missingLabels.map((l) => `no ${l}`))
  return `${capitalize(list)} are listed for this school.`
}

/** Case-insensitive substring match between a matched ask signal and a chip's text. */
export function chipIsMatched(chipText: string, matchedSignals: string[]): boolean {
  return matchedSignals.some((sig) => sig && chipText.toLowerCase().includes(sig.toLowerCase()))
}

/** Sorts a group's chips so matched ones (against the ask) come first, each subset keeping its original order. */
export function sortChipsMatchedFirst(items: string[], matchedSignals: string[]): string[] {
  const matched = items.filter((i) => chipIsMatched(i, matchedSignals))
  const rest = items.filter((i) => !chipIsMatched(i, matchedSignals))
  return [...matched, ...rest]
}

// ── Getting there (transit) ──────────────────────────────────────────────────

/** "F to East Broadway; J, M, Z to Delancey St-Essex St" -> ["F","J","M","Z"] (dedup, order preserved). */
export function parseSubwayLines(value: string | undefined | null): string[] {
  if (!value) return []
  const lines: string[] = []
  for (const segment of value.split(';')) {
    const beforeTo = segment.split(/\bto\b/i)[0]
    for (const line of beforeTo.split(',')) {
      const trimmed = line.trim()
      if (trimmed && !lines.includes(trimmed)) lines.push(trimmed)
    }
  }
  return lines
}

/** "B39, M14A, M14D" -> ["B39","M14A","M14D"]. */
export function parseBusRoutes(value: string | undefined | null): string[] {
  return parseCommaList(value)
}

/** Short "NOT REPORTED" label for missing transit modes, e.g. "Bus routes" or "Subway routes and bus routes". */
export function buildNotReportedTransitLabel(missingModes: string[]): string | null {
  if (missingModes.length === 0) return null
  return capitalize(joinOxford(missingModes))
}

// ── Programs ─────────────────────────────────────────────────────────────────

export interface ProgramRow {
  name: string
  method: string
}

/**
 * The scraped `programs` array has no distinct per-major name (only an
 * admissions_type + a raw_method string like "Screened"), and some schools
 * repeat the identical pair many times. Collapse exact duplicates so the
 * section reads as a list of distinct pathways rather than a repeated row.
 */
export function dedupePrograms(programs: School['programs']): ProgramRow[] {
  const seen = new Set<string>()
  const rows: ProgramRow[] = []
  for (const p of programs ?? []) {
    const rawMethod = (p as { raw_method?: string }).raw_method
    const name = rawMethod || p.admissions_type
    const method = p.admissions_type
    const key = `${name}||${method}`
    if (seen.has(key)) continue
    seen.add(key)
    rows.push({ name, method })
  }
  return rows
}

// ── What's required to apply ────────────────────────────────────────────────

export interface RequirementField {
  label: string
  value: string
}

export interface RequirementBlock {
  track: string
  isPrimary: boolean
  fields: RequirementField[]
}

/**
 * Builds one block per distinct admissions track, from whatever DOE actually
 * published (doe_data.requirements is a free-form label->text bag; SHSAT
 * schools instead carry the official process description in prgdesc). Never
 * invents a field — a track with nothing on file gets no fields, not a
 * fabricated one.
 */
export function buildRequirementBlocks(school: School): RequirementBlock[] {
  const tracks = school.admissions_types ?? []
  const requirements = school.doe_data?.requirements ?? {}
  const requirementFields: RequirementField[] = Object.values(requirements)
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter(Boolean)
    .map((v) => {
      const colon = v.indexOf(':')
      if (colon === -1) return { label: v, value: 'Reviewed' }
      return { label: v.slice(0, colon).trim(), value: v.slice(colon + 1).trim() }
    })

  return tracks.map((track, i) => {
    const fields: RequirementField[] = []
    if (track === 'SHSAT' && school.doe_data?.prgdesc) {
      fields.push({ label: 'Admissions', value: school.doe_data.prgdesc })
    }
    if (track.toLowerCase().includes('audition') && (school.doe_data?.audition_information?.length ?? 0) > 0) {
      fields.push({ label: 'Audition', value: (school.doe_data!.audition_information ?? []).join('; ') })
    }
    // Requirements text isn't keyed by track in the source data, so a school
    // with only one non-SHSAT track gets all of it; multi-track schools show
    // it on the primary (first-listed) track only, to avoid repeating the
    // same bag of fields under every badge.
    if (i === 0 && requirementFields.length > 0) {
      fields.push(...requirementFields)
    }
    return { track, isPrimary: i === 0, fields }
  })
}

// ── Provenance ───────────────────────────────────────────────────────────────

// Matches the source line already used for this data elsewhere in the app
// (see components/SchoolCard.tsx).
export const PROVENANCE_SOURCE = 'NYC-SIFT + NYC DOE Open Data'

// No fallback deep-link format is confirmed for myschools.nyc, and a guessed
// per-school URL that 404s would undermine the "always leave with a working
// official link" rule — so every link points at the directory itself.
export const MYSCHOOLS_URL = 'https://www.myschools.nyc'

/** "2025-2026" -> "2025–26 admissions". Falls back to the raw string if it isn't that shape. */
export function formatAdmissionsCycle(lastVerified: string | undefined | null): string | null {
  if (!lastVerified) return null
  const match = /^(\d{4})-(\d{4})$/.exec(lastVerified.trim())
  if (!match) return `${lastVerified} admissions`
  return `${match[1]}–${match[2].slice(2)} admissions`
}

// ── Back navigation ──────────────────────────────────────────────────────────

/** "Brooklyn + Queens, Screened" style summary of active rail filters for the back-band link. */
export function describeBackFilters(filters: FindFilters): string {
  const parts: string[] = []
  if (filters.boroughs.length > 0) parts.push(filters.boroughs.join(' + '))
  if (filters.tracks.length > 0) parts.push(filters.tracks.join(', '))
  return parts.join(', ')
}

export function parseMatchedSignals(param: string | string[] | undefined): string[] {
  const value = typeof param === 'string' ? param : ''
  return value ? value.split(',').filter(Boolean) : []
}
