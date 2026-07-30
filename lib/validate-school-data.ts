/**
 * validate-school-data.ts
 *
 * Validation gate for the data refresh pipeline (scripts/refresh-data.ts).
 * Fails loudly instead of writing a bad scrape over good data: checks the
 * school count against an expected range and against the previous file (no
 * more than a ~10% drop), and checks that every record has the required
 * fields (dbn, name, borough) present, non-empty, and that dbn is unique.
 */

export interface RawSchoolRecord {
  dbn?: unknown
  name?: unknown
  borough?: unknown
  [key: string]: unknown
}

export interface InvalidRecord {
  index: number
  dbn?: string
  reasons: string[]
}

export interface ValidationResult {
  valid: boolean
  schoolCount: number
  previousCount: number | null
  added: string[]
  removed: string[]
  invalidRecords: InvalidRecord[]
  errors: string[]
}

export interface ValidateOptions {
  /** Baseline school count the scrape is expected to be near. Defaults to EXPECTED_SCHOOL_COUNT. */
  expectedCount?: number
  /** Fraction (0-1) the count may deviate from expectedCount. Defaults to EXPECTED_COUNT_TOLERANCE. */
  countTolerance?: number
  /** Max fraction (0-1) the count may drop versus the previous file. Defaults to MAX_DROP_VS_PREVIOUS. */
  maxDropRatio?: number
}

export const EXPECTED_SCHOOL_COUNT = 457
export const EXPECTED_COUNT_TOLERANCE = 0.1
export const MAX_DROP_VS_PREVIOUS = 0.1

function asTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Validates a freshly-scraped school list, optionally comparing it against
 * the previously-known-good list to compute added/removed dbns and detect a
 * drop in count. Never mutates its inputs.
 */
export function validateSchoolData(
  schools: unknown,
  previousSchools?: unknown[] | null,
  options?: ValidateOptions
): ValidationResult {
  const previousCount = previousSchools ? previousSchools.length : null

  if (!Array.isArray(schools)) {
    return {
      valid: false,
      schoolCount: 0,
      previousCount,
      added: [],
      removed: [],
      invalidRecords: [],
      errors: ['Scraped data is not an array.'],
    }
  }

  const errors: string[] = []
  const invalidRecords: InvalidRecord[] = []
  const schoolCount = schools.length

  const seenDbns = new Set<string>()
  const dbns: string[] = []

  schools.forEach((record, index) => {
    const r = (record ?? {}) as RawSchoolRecord
    const dbn = asTrimmedString(r.dbn)
    const name = asTrimmedString(r.name)
    const borough = asTrimmedString(r.borough)
    const reasons: string[] = []

    if (!dbn) reasons.push('missing dbn')
    if (!name) reasons.push('missing name')
    if (!borough) reasons.push('missing borough')
    if (dbn && seenDbns.has(dbn)) reasons.push(`duplicate dbn: ${dbn}`)

    if (dbn) {
      seenDbns.add(dbn)
      dbns.push(dbn)
    }

    if (reasons.length > 0) {
      invalidRecords.push({ index, dbn: dbn || undefined, reasons })
    }
  })

  if (invalidRecords.length > 0) {
    errors.push(`${invalidRecords.length} record(s) failed field validation.`)
  }

  const expectedCount = options?.expectedCount ?? EXPECTED_SCHOOL_COUNT
  const countTolerance = options?.countTolerance ?? EXPECTED_COUNT_TOLERANCE
  const minExpected = Math.floor(expectedCount * (1 - countTolerance))
  const maxExpected = Math.ceil(expectedCount * (1 + countTolerance))
  if (schoolCount < minExpected || schoolCount > maxExpected) {
    errors.push(
      `School count ${schoolCount} is outside the expected range [${minExpected}, ${maxExpected}] (baseline ${expectedCount}).`
    )
  }

  let added: string[] = []
  let removed: string[] = []
  if (previousSchools && previousSchools.length > 0) {
    const previousDbns = new Set(
      previousSchools
        .map((s) => asTrimmedString((s as RawSchoolRecord)?.dbn))
        .filter(Boolean)
    )
    const newDbns = new Set(dbns)
    added = dbns.filter((d) => !previousDbns.has(d))
    removed = Array.from(previousDbns).filter((d) => !newDbns.has(d))

    const maxDropRatio = options?.maxDropRatio ?? MAX_DROP_VS_PREVIOUS
    const minAllowed = previousSchools.length * (1 - maxDropRatio)
    if (schoolCount < minAllowed) {
      errors.push(
        `School count dropped from ${previousSchools.length} to ${schoolCount}, more than the allowed ${Math.round(maxDropRatio * 100)}%.`
      )
    }
  }

  return {
    valid: errors.length === 0,
    schoolCount,
    previousCount,
    added,
    removed,
    invalidRecords,
    errors,
  }
}
