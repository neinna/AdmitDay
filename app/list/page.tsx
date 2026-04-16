import fs from 'fs'
import path from 'path'
import Link from 'next/link'
import SchoolList from '@/components/SchoolList'
import ViewRequirementsLink from '@/components/ViewRequirementsLink'
import Footer from '@/components/Footer'
import { School, UserInputs, SectionType, SectionGroup } from '@/types'

// ── Input parsing ────────────────────────────────────────────────────────────

function parseInputs(sp: Record<string, string | string[] | undefined>): UserInputs {
  const str = (key: string, def: string) =>
    typeof sp[key] === 'string' ? (sp[key] as string) : def

  const boroughParam = str('borough', '')
  const boroughs = boroughParam ? boroughParam.split(',').filter(Boolean) : []

  return {
    boroughs,
    interests: str('interests', '').split(',').filter(Boolean),
    sports: str('sports', '').split(',').filter(Boolean),
    shsat: str('shsat', 'false') === 'true',
    auditions: str('auditions', 'false') === 'true',
    academicLevel: str('level', 'medium') as 'low' | 'medium' | 'high',
    iep: str('iep', 'false') === 'true',
    size: str('size', 'medium') as 'small' | 'medium' | 'large',
  }
}

// ── Eligibility & filtering ──────────────────────────────────────────────────

/** True when no boroughs are selected — skip borough filter. */
function noBorough(boroughs: string[]): boolean {
  return boroughs.length === 0
}

function isEligible(school: School, inputs: UserInputs): boolean {
  if (school.flags.has_open) return true
  if (school.flags.has_screened && inputs.academicLevel !== 'low') return true
  if (school.flags.has_shsat && inputs.shsat) return true
  if (school.flags.has_audition && inputs.auditions) return true
  return false
}

function applyFilters(
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

function getResults(
  schools: School[],
  inputs: UserInputs
): { results: School[] } {
  const results = applyFilters(schools, inputs, false)
  return {
    results: sortBySize(sortByHomeBorough(results, inputs.boroughs), inputs.size),
  }
}

function matchesSports(school: School, sports: string[]): boolean {
  if (sports.length === 0) return true
  const ext = (school.doe_data?.extracurriculars ?? '').toLowerCase()
  return sports.some((sport) => ext.includes(sport.toLowerCase()))
}

// ── SHSAT selection ──────────────────────────────────────────────────────────

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

  // Multiple boroughs: show all SHSAT schools from selected boroughs
  if (inputs.boroughs.length > 1) {
    return shsatSchools
      .filter((s) => inputs.boroughs.includes(s.borough))
      .sort((a, b) => scoreSHSATSchool(b, inputs) - scoreSHSATSchool(a, inputs))
  }

  // Single borough: prioritize home, fill from nearby
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

// ── Grouping ─────────────────────────────────────────────────────────────────

const SECTION_LABELS: Record<SectionType, string> = {
  shsat: 'SHSAT Schools',
  audition: 'Audition Schools',
  screened: 'Screened Schools',
  edopt: 'Ed. Opt. Schools',
  lottery: 'Lottery Schools',
}

function getPrimarySection(school: School): SectionType {
  if (school.flags.has_shsat) return 'shsat'
  if (school.flags.has_audition) return 'audition'
  if (school.flags.has_screened) return 'screened'
  if (school.admissions_types.includes('Educational Option')) return 'edopt'
  return 'lottery'
}

function groupSchools(schools: School[]): SectionGroup[] {
  const buckets: Record<SectionType, School[]> = {
    shsat: [], audition: [], screened: [], edopt: [], lottery: [],
  }
  for (const school of schools) {
    buckets[getPrimarySection(school)].push(school)
  }

  const order: SectionType[] = ['shsat', 'audition', 'screened', 'edopt', 'lottery']
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

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function ListPage({
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

  const { results: baseResults } = getResults(allSchools, inputs)

  // Sports: soft post-filter
  let results = baseResults
  let sportsNote = ''
  if (inputs.sports.length > 0) {
    const sportFiltered = baseResults.filter((s) => matchesSports(s, inputs.sports))
    if (sportFiltered.length === 0) {
      sportsNote = 'No schools matched your sport filter — showing all results'
    } else {
      results = sportFiltered
    }
  }

  // SHSAT: all schools when no borough filter, up to 5 when borough is selected
  let shsatSelected: School[] = []
  if (inputs.shsat) {
    shsatSelected = selectSHSATSchools(allSchools, inputs)
  }
  const shsatDbns = new Set(shsatSelected.map((s) => s.dbn))

  // General results: exclude SHSAT schools (they're handled separately above)
  const nonShsatResults = results.filter((s) => !s.flags.has_shsat && !shsatDbns.has(s.dbn))

  // Combine: SHSAT first, then everything else
  const finalResults = [...shsatSelected, ...nonShsatResults]
  const groups = groupSchools(finalResults)

  const reqParams = new URLSearchParams(
    Object.entries(searchParams)
      .filter(([, v]) => typeof v === 'string')
      .map(([k, v]) => [k, v as string])
  )

  const boroughLabel = inputs.boroughs.length === 0 ? 'all boroughs' : inputs.boroughs.join(', ')

  // Collect all banners to show at the very top
  const banners: string[] = []
  if (allSchools.length === 0)
    banners.push('School data not yet loaded on the server — contact support if this persists.')
  if (sportsNote) banners.push(sportsNote)

  return (
    <main className="min-h-screen bg-white">
      {/* Top banners */}
      {banners.length > 0 && (
        <div style={{ backgroundColor: '#FEF3C7', color: '#92400E', borderBottom: '1px solid #FCD34D' }}>
          {banners.map((msg, i) => (
            <p key={i} className="max-w-4xl mx-auto px-4 py-2.5 text-sm">
              {msg}
            </p>
          ))}
        </div>
      )}

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Your school matches</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {finalResults.length} school{finalResults.length !== 1 ? 's' : ''} for {boroughLabel}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
            {/* Locked save button */}
            <span
              aria-label="Save list — Season Pass coming soon"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-400 border border-gray-200 bg-gray-50 rounded-md cursor-not-allowed select-none"
            >
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span>Save list</span>
              <span className="text-xs text-gray-400 font-normal">— Season Pass <span className="italic">coming soon</span></span>
            </span>
            <ViewRequirementsLink href={`/requirements?${reqParams.toString()}`} />
          </div>
        </div>

        {/* Grouped school list */}
        {finalResults.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-400">No schools found matching your criteria.</p>
            <Link href="/" className="mt-4 inline-block text-sm text-gray-900 underline">
              Try different options
            </Link>
          </div>
        ) : (
          <SchoolList groups={groups} userInputs={inputs} totalCount={finalResults.length} />
        )}

      </div>
      <Footer />
    </main>
  )
}
