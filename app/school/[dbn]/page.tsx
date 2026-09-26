import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Footer from '@/components/Footer'
import { getAllSchools } from '@/lib/load-schools'
import { parseFindFilters, findFiltersToQueryString, trackLabel } from '@/lib/school-list-utils'
import {
  findSchoolByDbn,
  formatSchoolName,
  buildStatCellsWithMissing,
  buildSqrTrends,
  buildShsatCutoffRows,
  buildActivityGroups,
  buildMissingActivityGroups,
  sortChipsMatchedFirst,
  chipIsMatched,
  parseSubwayLines,
  parseBusRoutes,
  buildNotReportedTransitLabel,
  dedupePrograms,
  buildRequirementBlocks,
  describeBackFilters,
  parseMatchedSignals,
} from '@/lib/school-detail-utils'
import { buildProvenanceRows, summariseDataVintage } from '@/lib/data-provenance'
import SchoolDetailClient from './SchoolDetailClient'

export async function generateMetadata({
  params,
}: {
  params: { dbn: string }
}): Promise<Metadata> {
  const schools = await getAllSchools()
  const school = findSchoolByDbn(schools, params.dbn)
  if (!school) return { title: 'AdmitDay' }
  return { title: `${formatSchoolName(school.name)} · AdmitDay` }
}

// Issue #116: the school detail view. Server component — loads via
// getAllSchools() and does all data shaping here, so SchoolDetailClient only
// ever renders what it's handed. Never calls the LLM: matchedSignals arrives
// as a query param from /find, already computed there.
export default async function SchoolDetailPage({
  params,
  searchParams,
}: {
  params: { dbn: string }
  searchParams: { [key: string]: string | string[] | undefined }
}) {
  const schools = await getAllSchools()
  const school = findSchoolByDbn(schools, params.dbn)
  if (!school) notFound()

  const filters = parseFindFilters(searchParams)
  const backQs = findFiltersToQueryString(filters)
  const backHref = backQs ? `/find?${backQs}` : '/find'

  const total = typeof searchParams.total === 'string' ? parseInt(searchParams.total, 10) : null
  const pos = typeof searchParams.pos === 'string' ? parseInt(searchParams.pos, 10) : null
  const filterDescription = describeBackFilters(filters)
  const backLabel =
    total != null && Number.isFinite(total)
      ? `Back to ${total} match${total === 1 ? '' : 'es'}${filterDescription ? ` · ${filterDescription}` : ''}`
      : 'Back to results'
  const positionLabel = pos != null && total != null ? `${pos} of ${total}` : null

  const matchedSignals = parseMatchedSignals(searchParams.matched)

  const statCells = buildStatCellsWithMissing(school)
  const sqrTrends = buildSqrTrends(school)
  const shsatCutoffRows = buildShsatCutoffRows(school)

  const activityGroupsRaw = buildActivityGroups(school)
  const activityGroups = activityGroupsRaw.map((g) => ({
    ...g,
    items: sortChipsMatchedFirst(g.items, matchedSignals),
  }))
  const missingActivityGroups = buildMissingActivityGroups(school)
  const matchedDisplayLabels = matchedSignals.filter((sig) =>
    activityGroupsRaw.some((g) => g.items.some((item) => chipIsMatched(item, [sig])))
  )

  const subwayLines = parseSubwayLines(school.doe_data?.subway)
  const busRoutes = parseBusRoutes(school.doe_data?.bus)
  const missingTransitModes = [
    ...(subwayLines.length === 0 ? ['subway routes'] : []),
    ...(busRoutes.length === 0 ? ['bus routes'] : []),
  ]
  const notReportedTransitLabel = buildNotReportedTransitLabel(missingTransitModes)

  const programs = dedupePrograms(school.programs)
  const requirementBlocks = buildRequirementBlocks(school)
  // Issue #138: provenance is derived from the sources themselves, never from
  // the typed `last_verified` string, which claimed the current cycle for data
  // published in 2018. See lib/data-provenance.ts.
  const provenanceRows = buildProvenanceRows()
  const dataVintageNote = summariseDataVintage()

  const alsoOnYourListIndex = schools
    .filter((s) => s.dbn !== school.dbn)
    .map((s) => ({ dbn: s.dbn, name: formatSchoolName(s.name) }))

  const tracks = (school.admissions_types ?? []).map(trackLabel)
  const neighborhood = school.doe_data?.neighborhood || school.borough

  return (
    <main className="min-h-screen bg-white">
      <SchoolDetailClient
        school={school}
        name={formatSchoolName(school.name)}
        neighborhood={neighborhood}
        tracks={tracks}
        statCells={statCells}
        sqrTrends={sqrTrends}
        shsatCutoffRows={shsatCutoffRows}
        programs={programs}
        requirementBlocks={requirementBlocks}
        activityGroups={activityGroups}
        missingActivityGroups={missingActivityGroups}
        matchedSignals={matchedSignals}
        matchedDisplayLabels={matchedDisplayLabels}
        subwayLines={subwayLines}
        busRoutes={busRoutes}
        notReportedTransitLabel={notReportedTransitLabel}
        provenanceRows={provenanceRows}
        dataVintageNote={dataVintageNote}
        sourceUrl={school.sqr?.source_url}
        backHref={backHref}
        backLabel={backLabel}
        positionLabel={positionLabel}
        alsoOnYourListIndex={alsoOnYourListIndex}
      />
      <Footer />
    </main>
  )
}
