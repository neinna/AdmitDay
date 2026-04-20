import fs from 'fs'
import path from 'path'
import { School, UserInputs } from '@/types'
import RequirementsContent from './RequirementsContent'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SchoolInSection {
  name: string
  sectionNotes: string[]
}

export interface ReqSection {
  key: string
  title: string
  schools: SchoolInSection[]
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
      buckets[key].push({ name: school.name, sectionNotes: notes })
    }
  }

  return SECTION_ORDER.filter((key) => buckets[key].length > 0).map((key) => ({
    key,
    title: SECTION_TITLES[key],
    schools: buckets[key].sort((a, b) => a.name.localeCompare(b.name)),
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

  // Get matched schools using same logic as list page
  const shsatSchools = inputs.shsat ? allSchools.filter((s) => s.flags.has_shsat) : []
  const shsatDbns = new Set(shsatSchools.map((s) => s.dbn))
  const nonShsat = applyFilters(allSchools, inputs).filter((s) => !shsatDbns.has(s.dbn))
  const matchedSchools = [...shsatSchools, ...nonShsat]

  const sections = buildReqSections(matchedSchools)

  const reqParams = new URLSearchParams(
    Object.entries(searchParams)
      .filter(([, v]) => typeof v === 'string')
      .map(([k, v]) => [k, v as string]),
  )
  const listHref = `/list?${reqParams.toString()}`

  return <RequirementsContent sections={sections} listHref={listHref} />
}
