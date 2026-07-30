import { School, SectionGroup, SectionType, UserInputs } from '@/types'

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
  if (filters.size) return `Size (${filters.size})`
  if (filters.tracks.length > 0) return `Admissions track (${filters.tracks.join(', ')})`
  if (filters.boroughs.length > 0) return `Borough (${filters.boroughs.join(', ')})`
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
