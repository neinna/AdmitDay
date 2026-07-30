// Single source of truth for SHSAT cutoff scores (TS side).
// Minimum SHSAT score that received a specialized HS offer, by DBN.
// Source: NYC DOE "Specialized High School Offers" press release, 2024 admissions cycle.
export const SHSAT_CUTOFFS_YEAR = '2024'

export const SHSAT_CUTOFFS: Record<string, number> = {
  '02M475': 560, // Stuyvesant High School
  '05M692': 514, // High School for Math, Science and Engineering at City College
  '10X445': 521, // Bronx High School of Science
  '10X696': 512, // High School of American Studies at Lehman College
  '13K430': 478, // Brooklyn Technical High School
  '14K449': 439, // Brooklyn Latin School
  '28Q687': 489, // Queens High School for the Sciences at York College
  '31R605': 528, // Staten Island Technical High School
}

export function getShsatCutoff(dbn: string): number | undefined {
  return SHSAT_CUTOFFS[dbn]
}
