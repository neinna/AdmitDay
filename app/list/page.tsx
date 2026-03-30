import fs from 'fs'
import path from 'path'
import Link from 'next/link'
import SchoolList from '@/components/SchoolList'
import Footer from '@/components/Footer'
import { School, UserInputs, SectionType, SectionGroup } from '@/types'

// ── Input parsing ────────────────────────────────────────────────────────────

function parseInputs(sp: Record<string, string | string[] | undefined>): UserInputs {
  const str = (key: string, def: string) =>
    typeof sp[key] === 'string' ? (sp[key] as string) : def

  return {
    borough: str('borough', 'Manhattan'),
    commute: str('commute', 'short') as 'short' | 'flexible',
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

const ALL_BOROUGHS = 'All Boroughs'

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
  relaxSize: boolean,
  relaxBorough: boolean
): School[] {
  return schools.filter((school) => {
    if (!isEligible(school, inputs)) return false
    if (!relaxSize && school.size !== inputs.size) return false
    if (
      inputs.borough !== ALL_BOROUGHS &&
      !relaxBorough &&
      inputs.commute === 'short' &&
      school.borough !== inputs.borough
    )
      return false
    return true
  })
}

function sortByHomeBorough(schools: School[], homeBorough: string): School[] {
  if (homeBorough === ALL_BOROUGHS) return schools
  return [...schools].sort((a, b) => {
    const aHome = a.borough === homeBorough
    const bHome = b.borough === homeBorough
    if (aHome && !bHome) return -1
    if (!aHome && bHome) return 1
    return 0
  })
}

function getResults(
  schools: School[],
  inputs: UserInputs
): { results: School[]; relaxedNote: string } {
  const MIN = 12

  let results = applyFilters(schools, inputs, false, false)
  if (results.length >= MIN)
    return { results: sortByHomeBorough(results, inputs.borough), relaxedNote: '' }

  results = applyFilters(schools, inputs, true, false)
  if (results.length >= MIN)
    return {
      results: sortByHomeBorough(results, inputs.borough),
      relaxedNote:
        'Fewer than 12 schools matched your size preference, so we expanded to include all school sizes.',
    }

  results = applyFilters(schools, inputs, true, true)
  const note =
    inputs.commute === 'short' && inputs.borough !== ALL_BOROUGHS
      ? 'Fewer than 12 schools matched in your borough, so we expanded to all boroughs and school sizes.'
      : 'Fewer than 12 schools matched your preferences, so we expanded our search.'
  return { results: sortByHomeBorough(results, inputs.borough), relaxedNote: note }
}

function matchesSports(school: School, sports: string[]): boolean {
  if (sports.length === 0) return true
  const ext = (school.doe_data?.extracurriculars ?? '').toLowerCase()
  return sports.some((sport) => ext.includes(sport.toLowerCase()))
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

  const { results: baseResults, relaxedNote } = getResults(allSchools, inputs)

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

  const groups = groupSchools(results)

  const reqParams = new URLSearchParams(
    Object.entries(searchParams)
      .filter(([, v]) => typeof v === 'string')
      .map(([k, v]) => [k, v as string])
  )

  const boroughLabel = inputs.borough === ALL_BOROUGHS ? 'all boroughs' : inputs.borough

  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5">
          <div>
            <Link href="/" className="text-sm text-gray-500 hover:text-gray-700">
              &larr; Start over
            </Link>
            <h1 className="text-xl font-bold text-gray-900 mt-1">Your school matches</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {results.length} school{results.length !== 1 ? 's' : ''} for {boroughLabel}
            </p>
          </div>
          <Link
            href={`/requirements?${reqParams.toString()}`}
            className="text-sm font-medium text-gray-900 underline hover:no-underline whitespace-nowrap"
          >
            View requirements checklist &rarr;
          </Link>
        </div>

        {/* No data warning */}
        {allSchools.length === 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-md p-4 mb-5">
            <p className="text-sm text-amber-800">
              School data not yet loaded. Copy{' '}
              <code className="bg-amber-100 px-1 rounded">/root/app/schools.json</code> to{' '}
              <code className="bg-amber-100 px-1 rounded">data/schools.json</code> and restart.
            </p>
          </div>
        )}

        {/* Notices */}
        {relaxedNote && (
          <div className="bg-blue-50 border border-blue-100 rounded-md p-3 mb-3">
            <p className="text-sm text-blue-800">{relaxedNote}</p>
          </div>
        )}
        {sportsNote && (
          <div className="bg-amber-50 border border-amber-200 rounded-md p-3 mb-3">
            <p className="text-sm text-amber-800">{sportsNote}</p>
          </div>
        )}

        {/* Grouped school list */}
        {results.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-400">No schools found matching your criteria.</p>
            <Link href="/" className="mt-4 inline-block text-sm text-gray-900 underline">
              Try different options
            </Link>
          </div>
        ) : (
          <SchoolList groups={groups} userInputs={inputs} totalCount={results.length} />
        )}

        {/* DOE disclaimer */}
        <div className="mt-8 p-4 bg-gray-50 border border-gray-200 rounded-md">
          <p className="text-xs text-gray-500 leading-relaxed">
            <strong>Note:</strong> Even the DOE&apos;s offer-chances prediction tool uses randomness
            as a tiebreaker. No tool can guarantee an offer.
          </p>
        </div>
      </div>
      <Footer />
    </main>
  )
}
