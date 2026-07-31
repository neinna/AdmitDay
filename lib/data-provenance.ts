/**
 * Where each part of a school record actually comes from, and how old it is.
 *
 * Issue #138. The app used to stamp every school `last_verified: "2025-2026"`
 * and display it as the admissions cycle the data was verified for. That was a
 * typed string, not a derived fact — it would have read "2025-2026" no matter
 * how old the underlying data was.
 *
 * The dataset is really two datasets with different vintages:
 *
 *   NYC-SIFT            — actively maintained; school list, sizes, applicants
 *                         per seat, academic/survey scores, admissions tracks.
 *   NYC DOE Open Data   — dataset `uq7m-95z8`, "2019 DOE High School Directory",
 *                         whose own metadata gives 2018-08-16 as the date the
 *                         data was last updated. Everything under `doe_data`
 *                         comes from here: overview, interests, PSAL sports, AP
 *                         courses, languages, extracurriculars, requirements,
 *                         transit, and the graduation/attendance/college rates.
 *
 * Telling a family that 2018 requirements were verified for the current cycle
 * is the one failure mode that can actually harm them — they could prepare for
 * a requirement that no longer exists, or miss one that now does. So we state
 * what each source is and when it was published, and we say nothing we can't
 * support.
 *
 * `publishedLabel` is null when we genuinely don't know. We do not record a
 * fetch date at scrape time yet; when the scraper starts capturing one (see
 * issue #135), fill it in here and the UI follows automatically. The point of
 * this module is that the date is *derived from the source*, never typed into
 * a component.
 */

export type SourceProvenance = {
  /** Stable key for tests and rendering. */
  key: 'sift' | 'doe-directory'
  /** Source name as shown to a family. */
  label: string
  /** Plain-language description of what this source supplies. */
  covers: string
  /**
   * What the source itself says about its vintage. `null` means unknown —
   * render nothing rather than guessing.
   */
  publishedLabel: string | null
  url: string
}

/** The NYC Open Data dataset the DOE half of every record is built from. */
export const DOE_DATASET_ID = 'uq7m-95z8'

/**
 * The DOE directory is a frozen historical snapshot, not a live feed — one of a
 * numbered series (2013…2021). Re-running the scraper returns identical data,
 * so this vintage only changes by changing source (issue #135).
 */
export const DOE_DATASET_PUBLISHED = '2018'

export const DATA_SOURCES: readonly SourceProvenance[] = [
  {
    key: 'sift',
    label: 'NYC-SIFT',
    covers: 'School list, size, applicants per seat, academic and survey scores, admissions tracks',
    // We do not record a scrape date yet, so we claim none.
    publishedLabel: null,
    url: 'https://nycsift.com',
  },
  {
    key: 'doe-directory',
    label: 'NYC DOE School Directory',
    covers: 'Programs, requirements, activities, transit, graduation and attendance rates',
    publishedLabel: DOE_DATASET_PUBLISHED,
    url: `https://data.cityofnewyork.us/resource/${DOE_DATASET_ID}.json`,
  },
] as const

export type ProvenanceRow = {
  key: string
  label: string
  value: string
}

/**
 * Rows for the provenance section of a school page: one per source, naming what
 * it supplies and — only when known — when it was published.
 */
export function buildProvenanceRows(
  sources: readonly SourceProvenance[] = DATA_SOURCES
): ProvenanceRow[] {
  return sources.map((source) => ({
    key: source.key,
    label: source.label,
    value: source.publishedLabel
      ? `${source.covers} · published ${source.publishedLabel}`
      : source.covers,
  }))
}

/**
 * One quiet line for the school page. States the older of the two vintages,
 * because that is the honest summary — a family reading "current" would
 * reasonably assume it applied to the requirements, which are the oldest part.
 *
 * Returns null when no source has a known vintage, so the UI renders nothing
 * rather than an empty or hedging line.
 */
export function summariseDataVintage(
  sources: readonly SourceProvenance[] = DATA_SOURCES
): string | null {
  const dated = sources.filter((s) => s.publishedLabel)
  if (dated.length === 0) return null
  const oldest = dated.reduce((a, b) =>
    (a.publishedLabel as string) <= (b.publishedLabel as string) ? a : b
  )
  return `DOE data published ${oldest.publishedLabel} · confirm at MySchools before you apply`
}
