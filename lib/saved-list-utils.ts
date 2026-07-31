import type { School } from '@/types'

/**
 * The subset of a school this page needs. The saved list lives in localStorage,
 * so the server can't know which schools are saved and must ship an index of
 * all of them — slim keeps that payload small. A full `School` satisfies this
 * structurally, so callers and tests can pass either.
 */
export type ListSchool = Pick<
  School,
  'dbn' | 'name' | 'borough' | 'admissions_types' | 'applicants_per_seat'
> & { neighborhood?: string | null }

/**
 * Derivations for /my-schools (issue #137).
 *
 * The composition section is counts, never a score. Nothing here ranks buckets
 * by desirability, labels a list "risky" or "balanced", or emits a percentage —
 * a percentage invites a target, and this product does not set targets.
 *
 * The band weights and the legend read from ONE array (`buckets`). The design
 * handoff calls this out specifically: an earlier build encoded the band from a
 * different set than the legend and showed three open/zoned schools where there
 * were two — the exact misread this section exists to prevent.
 */

export type BucketKey = 'shsat' | 'audition' | 'screened' | 'open'

export type CompositionBucket = {
  key: BucketKey
  label: string
  count: number
}

export type BreakdownCell = {
  label: string
  count: number
}

export type Composition = {
  total: number
  /** Zero-count buckets are kept — seeing "Open / Ed Opt / Zoned 0" is the point. */
  buckets: CompositionBucket[]
  byBorough: BreakdownCell[]
  byRatio: BreakdownCell[]
  shapeSentence: string
  /** Saved schools with no published applicants-per-seat; drives the incomplete-column note. */
  ratioMissing: number
}

/**
 * Buckets are mutually exclusive and resolved most-selective-first, because DOE
 * programs carry several methods at once (e.g. "Screened, Audition"). A school
 * is counted exactly once, in its most selective bucket.
 */
const BUCKET_ORDER: { key: BucketKey; label: string; matches: (t: string) => boolean }[] = [
  {
    key: 'shsat',
    label: 'SHSAT',
    matches: (t) => t === 'shsat',
  },
  {
    key: 'audition',
    label: 'Audition / Portfolio',
    matches: (t) => t.includes('audition') || t.includes('portfolio'),
  },
  {
    key: 'screened',
    label: 'Screened',
    matches: (t) => t.includes('screened'),
  },
  {
    // Educational Option lives here rather than in its own bucket: the design
    // specifies four buckets, and Ed Opt is not selectively screened. The label
    // names it explicitly so a family isn't told "Open / Zoned" for a set that
    // is mostly Ed Opt — which in this dataset it usually is.
    key: 'open',
    label: 'Open / Ed Opt / Zoned',
    matches: () => true,
  },
]

/** The most selective bucket a school belongs to. Always returns one. */
export function bucketForSchool(school: Pick<ListSchool, 'admissions_types'>): BucketKey {
  const types = (school.admissions_types ?? []).map((t) => t.toLowerCase().trim())
  for (const bucket of BUCKET_ORDER) {
    if (bucket.key === 'open') continue
    if (types.some((t) => bucket.matches(t))) return bucket.key
  }
  return 'open'
}

/** "Under 3" / "3 to 6" / "Over 6" — the same shape as the design's ratio cells. */
export function ratioBand(ratio: number): string {
  if (ratio < 3) return 'Under 3'
  if (ratio <= 6) return '3 to 6'
  return 'Over 6'
}

/**
 * One factual sentence describing only what is on the list. Never advisory,
 * never predictive — it reports, it does not recommend.
 */
export function buildShapeSentence(
  buckets: CompositionBucket[],
  total: number,
  ratioMissing: number
): string {
  if (total === 0) return 'Nothing is saved yet.'

  const open = buckets.find((b) => b.key === 'open')?.count ?? 0
  const selective = total - open
  const parts: string[] = []

  if (open === 0) {
    parts.push('Every school on the list screens, tests or auditions. No open, Ed Opt or zoned program is on it yet.')
  } else if (selective === 0) {
    parts.push('Every school on the list admits without screening, testing or an audition.')
  } else {
    const named = buckets
      .filter((b) => b.count > 0 && b.key !== 'open')
      .map((b) => `${b.count} ${b.label.toLowerCase()}`)
      .join(', ')
    parts.push(`${named}, and ${open} open, Ed Opt or zoned.`)
  }

  if (ratioMissing > 0) {
    parts.push(
      ratioMissing === total
        ? 'No school on the list has a published applicants-per-seat figure, so that column is empty rather than low.'
        : `${ratioMissing} of ${total} have no published applicants-per-seat figure, so that column is incomplete.`
    )
  }

  return parts.join(' ')
}

/**
 * Everything the composition rail renders, from one pass over the saved schools.
 * `buckets` drives both the proportion band and the legend.
 */
export function buildComposition(saved: ListSchool[]): Composition {
  const total = saved.length

  const counts = new Map<BucketKey, number>(BUCKET_ORDER.map((b) => [b.key, 0]))
  for (const school of saved) {
    const key = bucketForSchool(school)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const buckets: CompositionBucket[] = BUCKET_ORDER.map((b) => ({
    key: b.key,
    label: b.label,
    count: counts.get(b.key) ?? 0,
  }))

  const boroughCounts = new Map<string, number>()
  for (const school of saved) {
    const borough = school.borough?.trim()
    if (!borough) continue
    boroughCounts.set(borough, (boroughCounts.get(borough) ?? 0) + 1)
  }
  const byBorough = Array.from(boroughCounts, ([label, count]) => ({ label, count })).sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label)
  )

  const ratioCounts = new Map<string, number>([
    ['Under 3', 0],
    ['3 to 6', 0],
    ['Over 6', 0],
  ])
  let ratioMissing = 0
  for (const school of saved) {
    const ratio = school.applicants_per_seat
    // Absent means absent. Never coerce a missing figure to zero — a family
    // reads "0" as a fact about the school rather than a gap in DOE data.
    if (ratio == null || Number.isNaN(ratio)) {
      ratioMissing += 1
      continue
    }
    const band = ratioBand(ratio)
    ratioCounts.set(band, (ratioCounts.get(band) ?? 0) + 1)
  }
  const byRatio = Array.from(ratioCounts, ([label, count]) => ({ label, count }))

  return {
    total,
    buckets,
    byBorough,
    byRatio,
    shapeSentence: buildShapeSentence(buckets, total, ratioMissing),
    ratioMissing,
  }
}

/**
 * Saved DBNs resolved to schools, in the family's rank order. Unknown DBNs are
 * dropped rather than rendered as blanks — a saved school that no longer exists
 * in the dataset should disappear, not become an empty row.
 */
export function resolveSavedSchools<T extends { dbn: string }>(all: T[], savedDbns: string[]): T[] {
  const byDbn = new Map(all.map((s) => [s.dbn, s]))
  return savedDbns.map((dbn) => byDbn.get(dbn)).filter((s): s is T => Boolean(s))
}

/** Move an item one position up or down. Returns a new array; out-of-range is a no-op. */
export function moveItem<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) return items
  const next = items.slice()
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}
