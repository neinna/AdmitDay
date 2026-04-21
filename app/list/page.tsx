import fs from 'fs'
import path from 'path'
import Link from 'next/link'
import SchoolList from '@/components/SchoolList'
import ViewRequirementsLink from '@/components/ViewRequirementsLink'
import Footer from '@/components/Footer'
import { School, UserInputs } from '@/types'
import {
  capSchoolsByCategory,
  getResults,
  selectSHSATSchools,
  groupSchools,
} from '@/lib/school-list-utils'

// ── Input parsing ────────────────────────────────────────────────────────────

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

// ── Sports filter (page-local) ───────────────────────────────────────────────

function matchesSports(school: School, sports: string[]): boolean {
  if (sports.length === 0) return true
  const ext = (school.doe_data?.extracurriculars ?? '').toLowerCase()
  return sports.some((sport) => ext.includes(sport.toLowerCase()))
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
  // Cap at FREE_TIER_CAP (15) with per-category limits
  const cappedResults = capSchoolsByCategory(finalResults)
  const groups = groupSchools(cappedResults)

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
              {cappedResults.length} school{cappedResults.length !== 1 ? 's' : ''} for {boroughLabel}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
            {/* Locked save button */}
            <span
              aria-label="Save list — Full Access"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-400 border border-gray-200 bg-gray-50 rounded-md cursor-not-allowed select-none"
            >
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span>Save list</span>
              <span className="text-xs text-gray-400 font-normal">— Full Access</span>
            </span>
            <ViewRequirementsLink href={`/requirements?${reqParams.toString()}`} />
          </div>
        </div>

        {/* Grouped school list */}
        {cappedResults.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-400">No schools found matching your criteria.</p>
            <Link href="/" className="mt-4 inline-block text-sm text-gray-900 underline">
              Try different options
            </Link>
          </div>
        ) : (
          <SchoolList groups={groups} userInputs={inputs} totalCount={cappedResults.length} />
        )}

      </div>
      <Footer />
    </main>
  )
}
