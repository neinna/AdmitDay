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
 *   DOE HS Directory    — the Fall 2025 InfoHub HS directory, with School
 *                         Quality Reports 2024-25 (NYC Open Data `dnpx-dfnc`)
 *                         filling in attendance rate (blank in the directory)
 *                         and the small number of graduation rates the
 *                         directory has none for. Everything under `doe_data`
 *                         comes from here: overview, interests, PSAL sports, AP
 *                         courses, languages, extracurriculars, requirements,
 *                         transit, and the graduation/attendance/college rates.
 *
 *                         Issue #289 replaced the prior source here, NYC Open
 *                         Data `uq7m-95z8` (the 2019 DOE High School
 *                         Directory, dated 2018-08-16), whose graduation and
 *                         attendance numbers were six admissions cycles stale.
 *
 * Telling a family that stale requirements were verified for the current cycle
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

/**
 * Identifying slug for the DOE directory source, drawn from its InfoHub
 * filename since (unlike the dataset it replaced) it isn't published on NYC
 * Open Data. School Quality Reports 2024-25, the fallback for attendance and
 * graduation rate, is NYC Open Data dataset `dnpx-dfnc`.
 */
export const DOE_DATASET_ID = 'fall-2025---hs-directory'
export const SQR_DATASET_ID = 'dnpx-dfnc'

/**
 * The DOE directory is a frozen point-in-time publication, not a live feed —
 * InfoHub posts a new one each admissions cycle. Re-running the scraper
 * returns identical data, so this vintage only changes by changing source.
 */
export const DOE_DATASET_PUBLISHED = 'Fall 2025'

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
    label: 'DOE High School Directory, Fall 2025 admissions',
    covers:
      'Programs, requirements, activities, transit, and graduation and attendance rates ' +
      '(attendance, and the small number of missing graduation rates, filled in from ' +
      'NYC DOE School Quality Reports 2024-25)',
    publishedLabel: DOE_DATASET_PUBLISHED,
    url:
      'https://infohub.nyced.org/docs/default-source/default-document-library/ose/' +
      `${DOE_DATASET_ID}-datab85f64a0-05b9-439a-8e29-052ce60a5d86.xlsx`,
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
  return `DOE data published ${oldest.publishedLabel} · Confirm at MySchools before you apply.`
}
