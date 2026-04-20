import { School, SectionGroup } from '@/types'

export const PAGE_SIZE = 15
export const FREE_TIER_CAP = 15
export const PAID_TIER_CAP = 30

const CATEGORY_CAPS = { shsat: 3, audition: 5, screened: 3 }

function sortByAcademicScore(schools: School[]): School[] {
  return [...schools].sort((a, b) => {
    if (a.academic_score_pct === null && b.academic_score_pct === null) return 0
    if (a.academic_score_pct === null) return 1
    if (b.academic_score_pct === null) return -1
    return b.academic_score_pct - a.academic_score_pct
  })
}

/**
 * Caps the school list at FREE_TIER_CAP (15) with per-category limits:
 * SHSAT ≤ 3, Audition ≤ 5, Screened ≤ 3, EdOpt/Lottery fills the remainder.
 * Within each category, schools are sorted by academic_score_pct descending
 * (null scores go to the bottom).
 */
export function capSchoolsByCategory(schools: School[]): School[] {
  const shsat = sortByAcademicScore(schools.filter((s) => s.flags.has_shsat))
  const audition = sortByAcademicScore(
    schools.filter((s) => !s.flags.has_shsat && s.flags.has_audition),
  )
  const screened = sortByAcademicScore(
    schools.filter((s) => !s.flags.has_shsat && !s.flags.has_audition && s.flags.has_screened),
  )
  const edoptLottery = sortByAcademicScore(
    schools.filter(
      (s) => !s.flags.has_shsat && !s.flags.has_audition && !s.flags.has_screened,
    ),
  )

  const cappedShsat = shsat.slice(0, CATEGORY_CAPS.shsat)
  const cappedAudition = audition.slice(0, CATEGORY_CAPS.audition)
  const cappedScreened = screened.slice(0, CATEGORY_CAPS.screened)
  const usedSlots = cappedShsat.length + cappedAudition.length + cappedScreened.length
  const remainder = Math.max(0, FREE_TIER_CAP - usedSlots)
  const cappedEdoptLottery = edoptLottery.slice(0, remainder)

  return [...cappedShsat, ...cappedAudition, ...cappedScreened, ...cappedEdoptLottery]
}

/**
 * Returns a copy of groups with schools sliced to show only the first
 * visibleCount schools total (distributed across groups in order).
 */
export function getVisibleGroups(groups: SectionGroup[], visibleCount: number): SectionGroup[] {
  let remaining = visibleCount
  const result: SectionGroup[] = []
  for (const group of groups) {
    if (remaining <= 0) break
    const schools = group.schools.slice(0, remaining)
    remaining -= schools.length
    if (schools.length > 0) result.push({ ...group, schools })
  }
  return result
}
