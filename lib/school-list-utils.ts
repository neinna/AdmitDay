import { School, SectionGroup, SectionType, UserInputs } from '@/types'
import { getShsatCutoffs } from './shsat-cutoffs'

// localStorage key for the optimistic "added to My Schools" set. Shared by
// /find (FindClient) and /school/[dbn] so both pages agree on the same saved
// list and the header count stays in sync between them.
export const ADDED_SCHOOLS_KEY = 'admitday_find_added_schools'

// Initial /find page load shows 30 rows so the list reads as a full picture,
// not a teaser; PAGE_SIZE is the increment each "N more matches" click adds.
export const INITIAL_COUNT = 30
export const PAGE_SIZE = 15
export const FREE_TIER_CAP = 15
export const PAID_TIER_CAP = 30

// Free-tier caps — intended to expand for paid Full Access.
const CATEGORY_CAPS = { shsat: 3, audition: 3, screened: 5 }

function sortByAcademicScore(schools: School[]): School[] {
  return [...schools].sort((a, b) => {
    if (a.academic_score_pct === null && b.academic_score_pct === null) return 0
    if (a.academic_score_pct === null) return 1
    if (b.academic_score_pct === null) return -1
    return b.academic_score_pct - a.academic_score_pct
  })
}

/**
 * Caps the school list at FREE_TIER_CAP (15) with per-category limits:
 * SHSAT ≤ 3, Audition ≤ 5, Screened ≤ 3, EdOpt/Lottery fills the remainder.
 * Within each category, schools are sorted by academic_score_pct descending
 * (null scores go to the bottom).
 */
export function capSchoolsByCategory(schools: School[]): School[] {
  const shsat = sortByAcademicScore(schools.filter((s) => s.flags.has_shsat))
  const audition = sortByAcademicScore(
    schools.filter((s) => !s.flags.has_shsat && s.flags.has_audition),
  )
  const screened = sortByAcademicScore(
    schools.filter((s) => !s.flags.has_shsat && !s.flags.has_audition && s.flags.has_screened),
  )
  const edoptLottery = sortByAcademicScore(
    schools.filter(
      (s) => !s.flags.has_shsat && !s.flags.has_audition && !s.flags.has_screened,
    ),
  )

  const cappedShsat = shsat.slice(0, CATEGORY_CAPS.shsat)
  const cappedAudition = audition.slice(0, CATEGORY_CAPS.audition)
  const cappedScreened = screened.slice(0, CATEGORY_CAPS.screened)
  const usedSlots = cappedShsat.length + cappedAudition.length + cappedScreened.length
  const remainder = Math.max(0, FREE_TIER_CAP - usedSlots)
  const cappedEdoptLottery = edoptLottery.slice(0, remainder)

  return [...cappedShsat, ...cappedAudition, ...cappedScreened, ...cappedEdoptLottery]
}

/**
 * Returns a copy of groups with schools sliced to show only the first
 * visibleCount schools total (distributed across groups in order).
 */
export function getVisibleGroups(groups: SectionGroup[], visibleCount: number): SectionGroup[] {
  let remaining = visibleCount
  const result: SectionGroup[] = []
  for (const group of groups) {
    if (remaining <= 0) break
    const schools = group.schools.slice(0, remaining)
    remaining -= schools.length
    if (schools.length > 0) result.push({ ...group, schools })
  }
  return result
}

// ── Filtering functions ──────────────────────────────────────────────────────

/** True when no boroughs are selected or all 5 are selected — skip borough filter. */
export function noBorough(boroughs: string[]): boolean {
  return boroughs.length === 0 || boroughs.length >= 5
}

export function matchesAcademicRating(school: School, ratings: string[]): boolean {
  const score = school.academic_score_pct
  if (score === null) {
    return ratings.includes('above_average')
  }
  if (ratings.includes('exceptional') && score >= 90) return true
  if (ratings.includes('strong') && score >= 70 && score < 90) return true
  if (ratings.includes('above_average') && score >= 50 && score < 70) return true
  return false
}

export function isEligible(school: School, inputs: UserInputs): boolean {
  const showScreened = inputs.academicRatings.includes('exceptional') || inputs.academicRatings.includes('strong')

  // Audition-only schools have no viable non-audition pathway; exclude them when auditions=NO.
  // Schools with screened or SHSAT programs can still appear via those pathways.
  if (school.flags.has_audition && !inputs.auditions && !school.flags.has_screened && !school.flags.has_shsat) {
    return false
  }

  if (school.flags.has_open) return true
  if (school.flags.has_screened && showScreened) return true
  if (school.flags.has_shsat && inputs.shsat) return true
  if (school.flags.has_audition && inputs.auditions) return true
  return matchesAcademicRating(school, inputs.academicRatings)
}

export function applyFilters(
  schools: School[],
  inputs: UserInputs,
  relaxBorough: boolean
): School[] {
  return schools.filter((school) => {
    if (!isEligible(school, inputs)) return false
    if (!noBorough(inputs.boroughs) && !relaxBorough && !inputs.boroughs.includes(school.borough))
      return false
    return true
  })
}

export function sortByHomeBorough(schools: School[], boroughs: string[]): School[] {
  if (boroughs.length !== 1) return schools
  const homeBorough = boroughs[0]
  return [...schools].sort((a, b) => {
    const aHome = a.borough === homeBorough
    const bHome = b.borough === homeBorough
    if (aHome && !bHome) return -1
    if (!aHome && bHome) return 1
    return 0
  })
}

export function sortBySize(schools: School[], preferredSize: string): School[] {
  return [...schools].sort((a, b) => {
    const aMatch = a.size === preferredSize
    const bMatch = b.size === preferredSize
    if (aMatch && !bMatch) return -1
    if (!aMatch && bMatch) return 1
    return 0
  })
}

export function getResults(
  schools: School[],
  inputs: UserInputs
): { results: School[] } {
  const results = applyFilters(schools, inputs, false)
  return {
    results: sortBySize(sortByHomeBorough(results, inputs.boroughs), inputs.size),
  }
}

export const BOROUGH_ORDER: Record<string, string[]> = {
  Manhattan:       ['Brooklyn', 'Queens', 'Bronx', 'Staten Island'],
  Brooklyn:        ['Manhattan', 'Queens', 'Bronx', 'Staten Island'],
  Queens:          ['Brooklyn', 'Manhattan', 'Bronx', 'Staten Island'],
  Bronx:           ['Manhattan', 'Brooklyn', 'Queens', 'Staten Island'],
  'Staten Island': ['Brooklyn', 'Manhattan', 'Queens', 'Bronx'],
}

export function scoreSHSATSchool(school: School, inputs: UserInputs): number {
  let score = 0
  const text = [school.doe_data?.overview ?? '', school.doe_data?.extracurriculars ?? '']
    .join(' ').toLowerCase()
  for (const interest of inputs.interests) {
    if (text.includes(interest.toLowerCase())) score += 2
  }
  for (const sport of inputs.sports) {
    if ((school.doe_data?.extracurriculars ?? '').toLowerCase().includes(sport.toLowerCase())) score += 2
  }
  score += (school.academic_score_pct ?? 0) / 100
  return score
}

export function selectSHSATSchools(allSchools: School[], inputs: UserInputs): School[] {
  const shsatSchools = allSchools.filter((s) => s.flags.has_shsat)
  const TARGET = 5

  if (noBorough(inputs.boroughs)) {
    return [...shsatSchools]
      .sort((a, b) => scoreSHSATSchool(b, inputs) - scoreSHSATSchool(a, inputs))
  }

  if (inputs.boroughs.length > 1) {
    return shsatSchools
      .filter((s) => inputs.boroughs.includes(s.borough))
      .sort((a, b) => scoreSHSATSchool(b, inputs) - scoreSHSATSchool(a, inputs))
  }

  const homeBorough = inputs.boroughs[0]
  const fromHome = shsatSchools
    .filter((s) => s.borough === homeBorough)
    .sort((a, b) => scoreSHSATSchool(b, inputs) - scoreSHSATSchool(a, inputs))

  if (fromHome.length >= TARGET) return fromHome.slice(0, TARGET)

  const selected = [...fromHome]
  const selectedDbns = new Set(selected.map((s) => s.dbn))

  for (const borough of (BOROUGH_ORDER[homeBorough] ?? [])) {
    if (selected.length >= TARGET) break
    const fromBorough = shsatSchools
      .filter((s) => s.borough === borough && !selectedDbns.has(s.dbn))
      .sort((a, b) => scoreSHSATSchool(b, inputs) - scoreSHSATSchool(a, inputs))
    for (const school of fromBorough) {
      if (selected.length >= TARGET) break
      selected.push(school)
      selectedDbns.add(school.dbn)
    }
  }

  return selected
}

const SECTION_LABELS: Record<SectionType, string> = {
  shsat: 'SHSAT Schools',
  audition: 'Audition Schools',
  screened: 'Screened Schools',
  edopt: 'Ed. Opt. Schools',
  lottery: 'Lottery Schools',
}

/** Returns the primary display section for a school. Screened takes priority over audition. */
export function getPrimarySection(school: School): SectionType {
  if (school.flags.has_shsat) return 'shsat'
  if (school.flags.has_screened) return 'screened'
  if (school.flags.has_audition) return 'audition'
  return 'lottery'
}

// ── /find rail filters (issue #114) ─────────────────────────────────────────
// The rail's borough/track/size controls are a hard floor — unlike the ask
// box (lib/soft-match.ts), matching schools here are excluded, not annotated.
// State round-trips through the URL so a filtered /find view is linkable.

export interface FindFilters {
  boroughs: string[]
  tracks: string[]
  size: string
}

export const EMPTY_FIND_FILTERS: FindFilters = { boroughs: [], tracks: [], size: '' }

function splitParam(value: string | string[] | undefined): string[] {
  const str = typeof value === 'string' ? value : ''
  return str ? str.split(',').filter(Boolean) : []
}

/** Parses /find's rail filters from a Next.js page's searchParams prop. */
export function parseFindFilters(sp: Record<string, string | string[] | undefined>): FindFilters {
  return {
    boroughs: splitParam(sp.borough),
    tracks: splitParam(sp.track),
    size: typeof sp.size === 'string' ? sp.size : '',
  }
}

/** Serializes /find's rail filters back to a query string (no leading '?'). */
export function findFiltersToQueryString(filters: FindFilters): string {
  const params = new URLSearchParams()
  if (filters.boroughs.length > 0) params.set('borough', filters.boroughs.join(','))
  if (filters.tracks.length > 0) params.set('track', filters.tracks.join(','))
  if (filters.size) params.set('size', filters.size)
  return params.toString()
}

/** Count of individual active filter values across all rail dimensions — used for the ask_submitted `filters_active` analytics property (issue #196). */
export function countActiveFindFilters(filters: FindFilters): number {
  return filters.boroughs.length + filters.tracks.length + (filters.size ? 1 : 0)
}

/** Hard-filters schools by the rail's borough/track/size controls. */
export function applyFindFilters(schools: School[], filters: FindFilters): School[] {
  return schools.filter((school) => {
    if (filters.boroughs.length > 0 && !filters.boroughs.includes(school.borough)) return false
    if (
      filters.tracks.length > 0 &&
      !(school.admissions_types ?? []).some((t) => filters.tracks.includes(t))
    )
      return false
    if (filters.size && school.size !== filters.size) return false
    return true
  })
}

/**
 * Live count of schools that would match `track`, under the current
 * borough/size filters only — the track filter itself is excluded so the
 * count reflects "if I also picked this track", not the current selection.
 */
export function countMatchingTrack(schools: School[], filters: FindFilters, track: string): number {
  const withoutTrack: FindFilters = { ...filters, tracks: [] }
  return applyFindFilters(schools, withoutTrack).filter((s) =>
    (s.admissions_types ?? []).includes(track)
  ).length
}

// Display abbreviations only — the underlying admissions_types value (used
// for filtering and the URL) is unabbreviated.
const TRACK_DISPLAY: Record<string, string> = {
  'Screened with Assessment': 'Screened + assessment',
  'Educational Option': 'Ed Opt',
}

export function trackLabel(track: string): string {
  return TRACK_DISPLAY[track] ?? track
}

/** Plain-language description of the active rail filters, e.g. "in Brooklyn + Queens". */
export function describeFindFilters(filters: FindFilters): string {
  const parts: string[] = []
  if (filters.boroughs.length > 0) parts.push(`in ${filters.boroughs.join(' + ')}`)
  if (filters.tracks.length > 0) parts.push(`for ${filters.tracks.join(', ')}`)
  if (filters.size) parts.push(`sized ${filters.size}`)
  return parts.length > 0 ? parts.join(', ') : 'citywide'
}

/**
 * Names one active filter to loosen when the current combination returns
 * zero schools. Prefers the most narrowing dimension first: size, then
 * track, then borough. Returns null when no rail filters are active.
 */
export function findFilterToLoosen(filters: FindFilters): string | null {
  if (filters.size) return 'the size filter'
  if (filters.tracks.length > 0) return 'the admissions track filter'
  if (filters.boroughs.length > 0) return 'the borough filter'
  return null
}

export function groupSchools(schools: School[]): SectionGroup[] {
  const buckets: Record<SectionType, School[]> = {
    shsat: [], audition: [], screened: [], edopt: [], lottery: [],
  }
  for (const school of schools) {
    buckets[getPrimarySection(school)].push(school)
  }

  const order: SectionType[] = ['shsat', 'audition', 'screened', 'lottery', 'edopt']
  let runningIndex = 0
  const result: SectionGroup[] = []

  for (const type of order) {
    if (buckets[type].length > 0) {
      result.push({
        type,
        label: SECTION_LABELS[type],
        schools: buckets[type],
        startIndex: runningIndex,
      })
      runningIndex += buckets[type].length
    }
  }

  return result
}

// ── Admissions evidence (/find rows, issue #216) ─────────────────────────────
// Replaces the derived rating/label the PRD forbids: show where a school's
// applicants-per-seat sits citywide, and which published admissions method(s)
// apply. No score, no verdict — evidence a family reads for itself.

/**
 * Rank of `aps` among every school with a published applicants_per_seat
 * value: the floor of 100 * (schools strictly below aps) / (schools with a
 * value). The comparison is strict so ties never inflate the rank, and the
 * result is always derived from `allSchools` — never a hardcoded table — so
 * it stays correct after each data refresh.
 */
export function citywidePercentile(aps: number, allSchools: School[]): number {
  const withValue = allSchools.filter((s) => s.applicants_per_seat !== null)
  if (withValue.length === 0) return 0
  const below = withValue.filter((s) => (s.applicants_per_seat as number) < aps).length
  return Math.floor((100 * below) / withValue.length)
}

// Table order Inna approved 2026-09-18 (issue #216) — fixed display order
// regardless of the order admissions_type values appear in the source data.
const ADMISSION_METHOD_ORDER = [
  'SHSAT',
  'Audition',
  'Screened',
  'Screened with Assessment',
  'Open',
  'Educational Option',
  'Zoned',
  'District 75',
  'ASD / ACES',
  'Language Program',
] as const

// The three MySchools methods added for issue #271, shown in their own /find
// rail group ("Programs for students with IEPs or learning English") below
// the seven main tracks — same chip style and filter behavior, only the
// grouping differs.
export const IEP_ENGLISH_LEARNER_TRACKS = ['District 75', 'ASD / ACES', 'Language Program']

/** Splits /find's trackOptions into the seven main tracks and the IEP/English-learner group (issue #271). */
export function splitTrackOptionsForRail(trackOptions: string[]): { main: string[]; iep: string[] } {
  return {
    main: trackOptions.filter((t) => !IEP_ENGLISH_LEARNER_TRACKS.includes(t)),
    iep: IEP_ENGLISH_LEARNER_TRACKS.filter((t) => trackOptions.includes(t)),
  }
}

/** The distinct admissions_type values across a school's programs, in the approved table order. */
export function admissionMethods(school: School): string[] {
  const present = new Set(
    school.programs.map((p) => p.admissions_type).filter((t): t is string => Boolean(t))
  )
  return ADMISSION_METHOD_ORDER.filter((method) => present.has(method))
}

// Exact row copy Inna approved 2026-09-18 (issue #216) — never reword without
// re-running it past the no-admissions-odds-language rule.
export const ADMISSION_METHOD_COPY: Record<string, string> = {
  SHSAT: 'Specialized: admission by SHSAT score.',
  Audition: 'Audition: admission by audition or portfolio',
  Screened: 'Screened: the school ranks applicants on criteria such as grades',
  'Screened with Assessment': 'Screened + assessment: ranked on grades plus a school assessment',
  Open: 'Open: offers by lottery within priority groups',
  'Educational Option': 'Educational Option: admits a mix of students across achievement levels',
  Zoned: 'Zoned: priority for students living in the zone',
  'District 75': 'District 75: a special education program for students whose IEP recommends a District 75 setting',
  'ASD / ACES': 'ASD / ACES: a specialized program for students with IEPs, including autism spectrum support',
  'Language Program': "Language program: admission considers English-learner status or the program's target language",
}

/**
 * The approved row copy for one admissions method this school uses. SHSAT
 * appends up to three published offer cutoffs, newest year first, skipping
 * any year DOE hasn't published — never a 0.
 */
export function admissionMethodCopy(method: string, school: School): string {
  const base = ADMISSION_METHOD_COPY[method] ?? method
  if (method !== 'SHSAT') return base
  const scores = (getShsatCutoffs(school.dbn) ?? []).map((c) => c.score).reverse()
  if (scores.length === 0) return base
  return `${base} Lowest score offered: ${scores.join(' · ')}`
}
