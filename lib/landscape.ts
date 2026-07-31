import type { School } from '@/types'

/**
 * The three landscape numbers on the landing page, derived from the real school
 * table rather than typed into the markup.
 *
 * The design handoff is explicit about why: "a landing page that claims 700+
 * programs while the database holds 300 is the exact failure this product cannot
 * afford." The whole pitch is that our numbers are checkable, so the first
 * numbers a visitor ever sees must be as honest as the ones on a school page.
 *
 * Rounded down to a "+" figure so the copy stays stable between data refreshes —
 * a landing page that changes from 781 to 779 on a re-scrape is noise, but one
 * that says 700+ when the table holds 300 is a lie. `roundDownTo` gives the
 * first and prevents the second.
 */

export type Landscape = {
  programs: number
  schools: number
  methods: number
  programsLabel: string
  schoolsLabel: string
}

/** 780 -> 700, 457 -> 400. Never rounds up: the claim stays true as data shifts. */
export function roundDownTo(value: number, step: number): number {
  if (value <= 0) return 0
  return Math.floor(value / step) * step
}

export function buildLandscape(schools: School[]): Landscape {
  const schoolCount = schools.length
  const programCount = schools.reduce((n, s) => n + (s.programs?.length ?? 0), 0)

  const methods = new Set<string>()
  for (const s of schools) {
    for (const t of s.admissions_types ?? []) {
      const trimmed = t.trim()
      if (trimmed) methods.add(trimmed)
    }
  }

  return {
    programs: programCount,
    schools: schoolCount,
    methods: methods.size,
    programsLabel: `${roundDownTo(programCount, 100)}+`,
    schoolsLabel: `${roundDownTo(schoolCount, 100)}+`,
  }
}

/**
 * The landing page must never advertise a landscape it can't back. If the data
 * layer degrades (the loader returns [] on a DB error by design), we render the
 * page without the numbers rather than printing zeros at a family.
 */
export function landscapeIsPublishable(l: Landscape): boolean {
  return l.schools > 0 && l.programs > 0 && l.methods > 0
}
