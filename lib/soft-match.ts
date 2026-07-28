/**
 * soft-match.ts
 *
 * Issue #108 (first step of #99): the chat-derived "ask" criteria are SOFT —
 * they never remove a school from the results, they only annotate it with
 * what it's missing. This module computes that annotation deterministically
 * (no LLM call) from the same borough/sports/interests signals extracted by
 * lib/query-filters.ts.
 *
 * Place at: lib/soft-match.ts
 */

import { School } from '@/types'
import { QueryFilters } from './query-filters'

function includesWord(haystack: string, needle: string): boolean {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`\\b${escaped}\\b`, 'i').test(haystack)
}

function matchesSport(school: School, sport: string): boolean {
  const text = [
    school.doe_data?.psal_sports_boys ?? '',
    school.doe_data?.psal_sports_girls ?? '',
    school.doe_data?.psal_sports_coed ?? '',
    school.doe_data?.extracurriculars ?? '',
  ].join(' ')
  return includesWord(text, sport)
}

function matchesInterest(school: School, interest: string): boolean {
  const interestsList = school.doe_data?.interests ?? []
  if (interestsList.some((i) => includesWord(i, interest))) return true
  const text = [school.doe_data?.overview ?? '', school.doe_data?.extracurriculars ?? ''].join(' ')
  return includesWord(text, interest)
}

/**
 * Returns human-readable labels for each extracted criterion this school does
 * NOT satisfy — e.g. ["Brooklyn", "Soccer (PSAL)"]. Empty array means the
 * school satisfies everything asked for. Callers must treat this purely as
 * annotation: a non-empty result is not a reason to exclude the school.
 */
export function getUnmetCriteria(school: School, filters: QueryFilters): string[] {
  const unmet: string[] = []

  if (filters.borough && school.borough !== filters.borough) {
    unmet.push(filters.borough)
  }

  for (const sport of filters.sports) {
    if (!matchesSport(school, sport)) unmet.push(`${sport} (PSAL)`)
  }

  for (const interest of filters.interests) {
    if (!matchesInterest(school, interest)) unmet.push(interest)
  }

  return unmet
}
