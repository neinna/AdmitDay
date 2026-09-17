/**
 * Minimum SHSAT score that received a specialized high school offer, by DBN
 * and admissions-offer year.
 *
 * Source: NYC DOE "Specialized High School Offers" press releases
 * (https://www.schools.nyc.gov/enrollment/enrollment-help/specialized-high-schools).
 * Cross-checked 2026-09-16 against kennytan.nyc, SHSATlab, and SHS Prep
 * cutoff tables — confirm a given year's number against the matching DOE
 * press release before treating it as final. Update this file (and the
 * mirrored SHSAT_CUTOFFS dict in build_school_data.py) each year after DOE
 * publishes new offer data, typically in March.
 */

export interface ShsatCutoffEntry {
  year: string
  score: number
  source: string
  verifiedDate: string
}

const DOE_SOURCE = 'https://www.schools.nyc.gov/enrollment/enrollment-help/specialized-high-schools'
const VERIFIED_DATE = '2026-09-16'

function buildEntries(scoresByYear: Record<string, number>): ShsatCutoffEntry[] {
  return Object.entries(scoresByYear)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([year, score]) => ({ year, score, source: DOE_SOURCE, verifiedDate: VERIFIED_DATE }))
}

export const SHSAT_CUTOFFS: Record<string, ShsatCutoffEntry[]> = {
  '02M475': buildEntries({ '2024': 561, '2025': 556, '2026': 561 }), // Stuyvesant High School
  '05M692': buildEntries({ '2024': 542, '2025': 526, '2026': 539 }), // HS for Math, Science and Engineering at City College
  '10X445': buildEntries({ '2024': 526, '2025': 518, '2026': 525 }), // Bronx High School of Science
  '10X696': buildEntries({ '2024': 514, '2025': 504, '2026': 507 }), // High School of American Studies at Lehman College
  '13K430': buildEntries({ '2024': 507, '2025': 505, '2026': 506 }), // Brooklyn Technical High School
  '14K449': buildEntries({ '2024': 492, '2025': 496, '2026': 495 }), // Brooklyn Latin School
  '28Q687': buildEntries({ '2024': 524, '2025': 518, '2026': 531 }), // Queens High School for the Sciences at York College
  '31R605': buildEntries({ '2024': 519, '2025': 527, '2026': 517 }), // Staten Island Technical High School
}

/** Latest offer year with published cutoff data across all specialized schools. */
export const SHSAT_CUTOFFS_YEAR = '2026'

/** Every published year's cutoff for a DBN, oldest first. Undefined when DOE hasn't published one (non-specialized schools). */
export function getShsatCutoffs(dbn: string): ShsatCutoffEntry[] | undefined {
  return SHSAT_CUTOFFS[dbn]
}

/** The most recent year's cutoff score for a DBN. */
export function getShsatCutoff(dbn: string): number | undefined {
  const entries = SHSAT_CUTOFFS[dbn]
  return entries && entries.length > 0 ? entries[entries.length - 1].score : undefined
}
