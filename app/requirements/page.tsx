import fs from 'fs'
import path from 'path'
import { School, UserInputs } from '@/types'
import RequirementsContent from './RequirementsContent'
import { capSchoolsByCategory, FREE_TIER_CAP, PAID_TIER_CAP } from '@/lib/school-list-utils'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SchoolInSection {
  name: string
  sectionNotes: string[]
}

export interface ShsatCutoffInfo {
  schoolCutoffs: Array<{ name: string; score: number }>
  lowestScore: number
  year: string
}

export interface ReqSection {
  key: string
  title: string
  schools: SchoolInSection[]
  shsatCutoffInfo?: ShsatCutoffInfo
}

// Minimum SHSAT score that received a specialized HS offer, by DBN.
// Source: NYC DOE "Specialized High School Offers" press release, 2024 admissions cycle.
const SHSAT_CUTOFFS: Record<string, number> = {
  '02M475': 560, // Stuyvesant High School
  '05M692': 514, // High School for Math, Science and Engineering at City College
  '10X445': 521, // Bronx High School of Science
  '10X696': 512, // High School of American Studies at Lehman College
  '13K430': 478, // Brooklyn Technical High School
  '14K449': 439, // Brooklyn Latin School
  '28Q687': 489, // Queens High School for the Sciences at York College
  '31R605': 528, // Staten Island Technical High School
}
const SHSAT_CUTOFFS_YEAR = '2024'

// ── Name formatting (same as SchoolRow.tsx) ───────────────────────────────────

function formatSchoolName(name: string): string {
  if (name.endsWith(', The')) {
    return 'The ' + name.slice(0, -5)
  }
  return name
}

// ── Input parsing (mirrors list/page.tsx) ─────────────────────────────────────

function parseInputs(sp: Record<string, string | string[] | undefined>): UserInputs {
  const str = (key: string, def: string) =>
    typeof sp[key] === 'string' ? (sp[key] as string) : def

  const boroughParam = str('borough', '')
  const boroughs = boroughParam ? boroughParam.split(',').filter(Boolean) : []

  const ratingsParam = str('academicRatings', '')
  const academicRatings = ratingsParam ? ratingsParam.split(',').filter(Boolean) : []

  return {
    boroughs,
    interests: str('interests', '').split(',').filter(Boolean),
    sports: str('sports', '').split(',').filter(Boolean),
    shsat: str('shsat', 'false') === 'true',
    auditions: str('auditions', 'false') === 'true',
    academicRatings: academicRatings as ('exceptional' | 'strong' | 'above_average')[],
    iep: str('iep', 'false') === 'true',
    size: str('size', 'medium') as 'small' | 'medium' | 'large',
  }
}

// ── Eligibility (mirrors list/page.tsx) ──────────────────────────────────────

function noBorough(boroughs: string[]): boolean {
  return boroughs.length === 0 || boroughs.length >= 5
}

function matchesAcademicRating(school: School, ratings: string[]): boolean {
  const score = school.academic_score_pct
  if (score === null) return ratings.includes('above_average')
  if (ratings.includes('exceptional') && score >= 90) return true
  if (ratings.includes('strong') && score >= 70 && score < 90) return true
  if (ratings.includes('above_average') && score >= 50 && score < 70) return true
  return false
}

function isEligible(school: School, inputs: UserInputs): boolean {
  const showScreened =
    inputs.academicRatings.includes('exceptional') || inputs.academicRatings.includes('strong')
  if (school.flags.has_open) return true
  if (school.flags.has_screened && showScreened) return true
  if (school.flags.has_shsat && inputs.shsat) return true
  if (school.flags.has_audition && inputs.auditions) return true
  return matchesAcademicRating(school, inputs.academicRatings)
}

function applyFilters(schools: School[], inputs: UserInputs): School[] {
  return schools.filter((school) => {
    if (!isEligible(school, inputs)) return false
    if (!noBorough(inputs.boroughs) && !inputs.boroughs.includes(school.borough)) return false
    return true
  })
}

// ── Sorting (mirrors list/page.tsx) ───────────────────────────────────────────

function sortByHomeBorough(schools: School[], boroughs: string[]): School[] {
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

function sortBySize(schools: School[], preferredSize: string): School[] {
  return [...schools].sort((a, b) => {
    const aMatch = a.size === preferredSize
    const bMatch = b.size === preferredSize
    if (aMatch && !bMatch) return -1
    if (!aMatch && bMatch) return 1
    return 0
  })
}

function matchesSports(school: School, sports: string[]): boolean {
  if (sports.length === 0) return true
  const ext = (school.doe_data?.extracurriculars ?? '').toLowerCase()
  return sports.some((sport) => ext.includes(sport.toLowerCase()))
}

// ── SHSAT selection (mirrors list/page.tsx) ───────────────────────────────────

const BOROUGH_ORDER: Record<string, string[]> = {
  Manhattan:       ['Brooklyn', 'Queens', 'Bronx', 'Staten Island'],
  Brooklyn:        ['Manhattan', 'Queens', 'Bronx', 'Staten Island'],
  Queens:          ['Brooklyn', 'Manhattan', 'Bronx', 'Staten Island'],
  Bronx:           ['Manhattan', 'Brooklyn', 'Queens', 'Staten Island'],
  'Staten Island': ['Brooklyn', 'Manhattan', 'Queens', 'Bronx'],
}

function scoreSHSATSchool(school: School, inputs: UserInputs): number {
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

function selectSHSATSchools(allSchools: School[], inputs: UserInputs): School[] {
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

// ── Section grouping ──────────────────────────────────────────────────────────

type SectionKey =
  | 'shsat'
  | 'audition'
  | 'screened'
  | 'screened_assessment'
  | 'edopt'
  | 'lottery'

const SECTION_TITLES: Record<SectionKey, string> = {
  shsat: 'SHSAT Schools',
  audition: 'Audition Schools',
  screened: 'Screened Schools',
  screened_assessment: 'Screened with Assessment Schools',
  edopt: 'Educational Option Schools',
  lottery: 'Open Enrollment / Lottery Schools',
}

const SECTION_ORDER: SectionKey[] = [
  'shsat',
  'audition',
  'screened',
  'screened_assessment',
  'edopt',
  'lottery',
]

function getSchoolSectionKeys(school: School): SectionKey[] {
  const keys: SectionKey[] = []
  if (school.admissions_types.includes('SHSAT') || school.flags.has_shsat) keys.push('shsat')
  if (school.admissions_types.includes('Audition') || school.flags.has_audition)
    keys.push('audition')
  if (school.admissions_types.includes('Screened')) keys.push('screened')
  if (school.admissions_types.includes('Screened with Assessment')) keys.push('screened_assessment')
  if (school.admissions_types.includes('Educational Option')) keys.push('edopt')
  if (school.admissions_types.includes('Open') || school.admissions_types.includes('Zoned'))
    keys.push('lottery')
  if (keys.length === 0) keys.push('lottery')
  return keys
}

function buildReqSections(matchedSchools: School[]): ReqSection[] {
  const buckets: Record<SectionKey, SchoolInSection[]> = {
    shsat: [],
    audition: [],
    screened: [],
    screened_assessment: [],
    edopt: [],
    lottery: [],
  }

  for (const school of matchedSchools) {
    const schoolKeys = getSchoolSectionKeys(school)
    for (const key of schoolKeys) {
      const otherKeys = schoolKeys.filter((k) => k !== key)
      const notes = otherKeys.map(
        (k) =>
          `This school also has a ${SECTION_TITLES[k]} program — see the ${SECTION_TITLES[k]} section.`,
      )
      buckets[key].push({ name: formatSchoolName(school.name), sectionNotes: notes })
    }
  }

  return SECTION_ORDER.filter((key) => buckets[key].length > 0).map((key) => ({
    key,
    title: SECTION_TITLES[key],
    schools: buckets[key],
  }))
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function RequirementsPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined }
}) {
  const inputs = parseInputs(searchParams)

  let allSchools: School[] = []
  try {
    const filePath = path.join(process.cwd(), 'data', 'schools.json')
    const raw = fs.readFileSync(filePath, 'utf-8')
    allSchools = JSON.parse(raw)
  } catch {
    // schools.json not yet present
  }

  // SHSAT: use same selectSHSATSchools logic as list page
  let shsatSelected: School[] = []
  if (inputs.shsat) {
    shsatSelected = selectSHSATSchools(allSchools, inputs)
  }
  const shsatDbns = new Set(shsatSelected.map((s) => s.dbn))

  // Non-SHSAT: apply filters + sort same as list page
  const baseResults = applyFilters(allSchools, inputs).filter(
    (s) => !s.flags.has_shsat && !shsatDbns.has(s.dbn),
  )
  const sortedResults = sortBySize(sortByHomeBorough(baseResults, inputs.boroughs), inputs.size)

  // Sports: soft post-filter (same as list page)
  let nonShsatResults = sortedResults
  if (inputs.sports.length > 0) {
    const sportFiltered = sortedResults.filter((s) => matchesSports(s, inputs.sports))
    if (sportFiltered.length > 0) nonShsatResults = sportFiltered
  }

  const matchedSchools = [...shsatSelected, ...nonShsatResults]

  // Cap at FREE_TIER_CAP with per-category limits (same as list page)
  const cappedSchools = capSchoolsByCategory(matchedSchools)
  const sections = buildReqSections(cappedSchools)
  const lockedCount = PAID_TIER_CAP - FREE_TIER_CAP

  // Compute SHSAT cutoff info for the matched schools in the SHSAT section
  if (inputs.shsat) {
    const shsatSection = sections.find((s) => s.key === 'shsat')
    if (shsatSection) {
      const cappedShsatSchools = cappedSchools.filter((s) => s.flags.has_shsat)
      const schoolCutoffs = cappedShsatSchools
        .filter((s) => SHSAT_CUTOFFS[s.dbn] !== undefined)
        .map((s) => ({ name: formatSchoolName(s.name), score: SHSAT_CUTOFFS[s.dbn] }))
        .sort((a, b) => b.score - a.score)
      if (schoolCutoffs.length > 0) {
        shsatSection.shsatCutoffInfo = {
          schoolCutoffs,
          lowestScore: Math.min(...schoolCutoffs.map((c) => c.score)),
          year: SHSAT_CUTOFFS_YEAR,
        }
      }
    }
  }

  const reqParams = new URLSearchParams(
    Object.entries(searchParams)
      .filter(([, v]) => typeof v === 'string')
      .map(([k, v]) => [k, v as string]),
  )
  const listHref = `/list?${reqParams.toString()}`

  return <RequirementsContent sections={sections} listHref={listHref} lockedCount={lockedCount} />
}
