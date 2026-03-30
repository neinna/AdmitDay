import fs from 'fs'
import path from 'path'
import Link from 'next/link'
import SchoolCard from '@/components/SchoolCard'
import Footer from '@/components/Footer'
import { School, UserInputs } from '@/types'

// ── Helpers ─────────────────────────────────────────────────────────────────

function parseInputs(sp: Record<string, string | string[] | undefined>): UserInputs {
  const str = (key: string, def: string) =>
    typeof sp[key] === 'string' ? (sp[key] as string) : def

  return {
    borough: str('borough', 'Manhattan'),
    commute: str('commute', 'short') as 'short' | 'flexible',
    interests: str('interests', '')
      .split(',')
      .filter(Boolean),
    shsat: str('shsat', 'false') === 'true',
    auditions: str('auditions', 'false') === 'true',
    academicLevel: str('level', 'medium') as 'low' | 'medium' | 'high',
    iep: str('iep', 'false') === 'true',
    size: str('size', 'medium') as 'small' | 'medium' | 'large',
  }
}

function isEligible(school: School, inputs: UserInputs): boolean {
  // Open enrollment — accessible at any academic level
  if (school.flags.has_open) return true
  // Screened — requires medium or high academic level
  if (school.flags.has_screened && inputs.academicLevel !== 'low') return true
  // SHSAT — only if student is willing
  if (school.flags.has_shsat && inputs.shsat) return true
  // Audition — only if student is willing
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
      !relaxBorough &&
      inputs.commute === 'short' &&
      school.borough !== inputs.borough
    )
      return false
    return true
  })
}

function sortByHomeBorough(schools: School[], homeBorough: string): School[] {
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

  // Full constraints
  let results = applyFilters(schools, inputs, false, false)
  if (results.length >= MIN)
    return {
      results: sortByHomeBorough(results, inputs.borough),
      relaxedNote: '',
    }

  // Relax size only
  results = applyFilters(schools, inputs, true, false)
  if (results.length >= MIN)
    return {
      results: sortByHomeBorough(results, inputs.borough),
      relaxedNote:
        'Fewer than 12 schools matched your size preference, so we expanded to include all school sizes.',
    }

  // Relax size + borough
  results = applyFilters(schools, inputs, true, true)
  const note =
    inputs.commute === 'short'
      ? 'Fewer than 12 schools matched in your borough, so we expanded to all boroughs and school sizes.'
      : 'Fewer than 12 schools matched your preferences, so we expanded our search.'
  return {
    results: sortByHomeBorough(results, inputs.borough),
    relaxedNote: note,
  }
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
    // schools.json not yet present (dev mode or pre-deployment)
  }

  const { results, relaxedNote } = getResults(allSchools, inputs)

  // Build the requirements page link with the same params
  const reqParams = new URLSearchParams(
    Object.entries(searchParams)
      .filter(([, v]) => typeof v === 'string')
      .map(([k, v]) => [k, v as string])
  )

  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
          <div>
            <Link href="/" className="text-sm text-gray-500 hover:text-gray-700">
              &larr; Start over
            </Link>
            <h1 className="text-2xl font-bold text-gray-900 mt-1">Your school matches</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {results.length} school{results.length !== 1 ? 's' : ''} for {inputs.borough}
            </p>
          </div>
          <Link
            href={`/requirements?${reqParams.toString()}`}
            className="text-sm font-medium text-gray-900 underline hover:no-underline whitespace-nowrap"
          >
            View your requirements checklist &rarr;
          </Link>
        </div>

        {/* No data warning */}
        {allSchools.length === 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-md p-4 mb-6">
            <p className="text-sm text-amber-800">
              School data not yet loaded. On the server, copy{' '}
              <code className="bg-amber-100 px-1 rounded">/root/app/schools.json</code> to{' '}
              <code className="bg-amber-100 px-1 rounded">data/schools.json</code> and restart the
              app.
            </p>
          </div>
        )}

        {/* Relaxation notice */}
        {relaxedNote && (
          <div className="bg-blue-50 border border-blue-100 rounded-md p-3 mb-6">
            <p className="text-sm text-blue-800">{relaxedNote}</p>
          </div>
        )}

        {/* Results */}
        {results.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-400">No schools found matching your criteria.</p>
            <Link
              href="/"
              className="mt-4 inline-block text-sm text-gray-900 underline hover:no-underline"
            >
              Try different options
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {results.map((school) => (
              <SchoolCard key={school.dbn} school={school} userInputs={inputs} />
            ))}
          </div>
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
