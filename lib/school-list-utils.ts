import { SectionGroup } from '@/types'

export const PAGE_SIZE = 15

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
