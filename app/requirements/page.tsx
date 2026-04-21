import fs from 'fs'
import path from 'path'
import { School, UserInputs } from '@/types'
import RequirementsContent from './RequirementsContent'
import {
  capSchoolsByCategory,
  FREE_TIER_CAP,
  PAID_TIER_CAP,
  applyFilters,
  selectSHSATSchools,
  sortByHomeBorough,
  sortBySize,
} from '@/lib/school-list-utils'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SchoolInSection {
  name: string
  sectionNotes: string[]
  prgdesc?: string
  auditionInformation?: string[]
  requirements?: Record<string, string>
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
    size: str('size', '') as 'small' | 'medium' | 'large' | '',
  }
}

// ── Sports filter (page-local) ────────────────────────────────────────────────

function matchesSports(school: School, sports: string[]): boolean {
  if (sports.length === 0) return true
  const ext = (school.doe_data?.extracurriculars ?? '').toLowerCase()
  return sports.some((sport) => ext.includes(sport.toLowerCase()))
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
  'lottery',
  'edopt',
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
      const doeData = school.doe_data
      const audInfo = doeData?.audition_information
      const reqs = doeData?.requirements
      buckets[key].push({
        name: formatSchoolName(school.name),
        sectionNotes: notes,
        prgdesc: doeData?.prgdesc || undefined,
        auditionInformation: key === 'audition' && audInfo?.length ? audInfo : undefined,
        requirements:
          (key === 'screened' || key === 'screened_assessment') && reqs && Object.keys(reqs).length
            ? reqs
            : undefined,
      })
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
  const baseResults = applyFilters(allSchools, inputs, false).filter(
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
