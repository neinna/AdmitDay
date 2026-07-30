/**
 * Issue #127, rule 1: the ask never removes schools.
 *
 * Ask-derived signals (lib/query-filters.ts -> lib/soft-match.ts) rank; they
 * never filter. For any set of schools and any ask, the result must contain
 * exactly the same schools as before the ask — reordered and annotated,
 * never shortened. A family cannot enumerate every criterion up front, and a
 * search that returns nothing is worse than an imperfect ranking. This is
 * the single most load-bearing product rule, so it's tested both against
 * synthetic fixtures and against the real, full-size dataset.
 */

import * as fs from 'fs'
import * as path from 'path'
import { rankBySoftMatch } from '../lib/soft-match'
import { extractFilters } from '../lib/query-filters'
import { School } from '../types'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeSchool(overrides: Partial<School> & { dbn?: string } = {}): School {
  return {
    dbn: overrides.dbn ?? 'X000',
    name: overrides.name ?? 'Test School',
    borough: overrides.borough ?? 'Brooklyn',
    size: overrides.size ?? 'medium',
    total_students: null,
    applicants_per_seat: null,
    academic_score_pct: null,
    survey_score_pct: null,
    admissions_types: overrides.admissions_types ?? [],
    programs: [],
    flags: {
      has_shsat: false,
      has_audition: false,
      has_screened: false,
      has_open: false,
      has_borough_priority: false,
      is_hidden_gem: false,
      has_consortium: false,
      has_ib: false,
      ...overrides.flags,
    },
    doe_data: {
      overview: '',
      language: '',
      extracurriculars: '',
      website: '',
      phone: '',
      address: '',
      zip: '',
      ...overrides.doe_data,
    },
    sift_url: '',
    last_verified: '',
    ...overrides,
  }
}

function dbnSet(schools: School[]): Set<string> {
  return new Set(schools.map((s) => s.dbn))
}

/** Fails with a message naming the rule, not just a bare assertion diff. */
function assertSameSchools(before: School[], after: School[], askDescription: string) {
  if (after.length !== before.length) {
    throw new Error(
      `Rule (issue #127, rule 1): the ask never removes schools. Asking "${askDescription}" changed the ` +
        `result count from ${before.length} to ${after.length}. Ask-derived signals must only RANK — a ` +
        `family cannot enumerate every criterion up front, and a search that returns nothing is worse ` +
        `than an imperfect ranking. If this ask should exclude schools, that belongs in a hard filter ` +
        `(lib/school-list-utils.ts applyFindFilters), not in soft-match ranking.`
    )
  }
  const beforeSet = dbnSet(before)
  const afterSet = dbnSet(after)
  const dropped = [...beforeSet].filter((d) => !afterSet.has(d))
  if (dropped.length > 0) {
    throw new Error(
      `Rule (issue #127, rule 1): the ask never removes schools. Asking "${askDescription}" kept the same ` +
        `count but swapped out dbn(s) [${dropped.join(', ')}] for others — the result must be the SAME set ` +
        `of schools, reordered and annotated, never a different set of the same size.`
    )
  }
}

// ── Synthetic fixtures ───────────────────────────────────────────────────────

describe('Rule #127.1: the ask never removes schools (synthetic)', () => {
  const schools = [
    makeSchool({ dbn: 'A', borough: 'Brooklyn' }),
    makeSchool({ dbn: 'B', borough: 'Queens' }),
    makeSchool({ dbn: 'C', borough: 'Bronx' }),
    makeSchool({ dbn: 'D', borough: 'Manhattan' }),
    makeSchool({ dbn: 'E', borough: 'Staten Island' }),
  ]

  it('a null ask (no chat yet) returns every school unchanged', () => {
    assertSameSchools(schools, rankBySoftMatch(schools, null), '(no ask)')
  })

  it('an ask every school satisfies still returns every school', () => {
    const filters = extractFilters('schools in Brooklyn, Queens, Bronx, Manhattan, or Staten Island')
    assertSameSchools(schools, rankBySoftMatch(schools, filters), 'any borough')
  })

  it('an ask NO school satisfies still returns every school, not zero', () => {
    const filters = extractFilters('a school with a robotics team and a soccer program')
    const ranked = rankBySoftMatch(schools, filters)
    assertSameSchools(schools, ranked, 'robotics + soccer (none match)')
    expect(ranked.length).toBe(5) // explicit: a fully-unmatched ask is not an empty result
  })

  it('an ask matching exactly one school still returns all of them, with the match first', () => {
    const filters = extractFilters('a school in Brooklyn')
    const ranked = rankBySoftMatch(schools, filters)
    assertSameSchools(schools, ranked, 'in Brooklyn')
    expect(ranked[0].dbn).toBe('A')
  })

  it('a single school is never removed by any ask', () => {
    const one = [makeSchool({ dbn: 'ONLY', borough: 'Queens' })]
    const filters = extractFilters('a school in Manhattan with a chess club')
    assertSameSchools(one, rankBySoftMatch(one, filters), 'in Manhattan (only school is in Queens)')
  })

  it('an empty input list stays empty (nothing to remove, nothing to add)', () => {
    const filters = extractFilters('anything at all')
    expect(rankBySoftMatch([], filters)).toEqual([])
  })
})

// ── Real, full-size dataset ─────────────────────────────────────────────────
// See LESSONS.md: the tracked root-level schools.json is present in every
// checkout (including CI) and is the same shape as the School type, so it
// can be read directly without a live Postgres connection.

const SCHOOLS_PATH = path.resolve(__dirname, '../schools.json')
const dataAvailable = fs.existsSync(SCHOOLS_PATH)

if (!dataAvailable) {
  // eslint-disable-next-line no-console
  console.warn(
    `[rule-ask-never-removes-schools] ${SCHOOLS_PATH} not found -- skipping real-dataset checks ` +
      '(no data source available in this environment).'
  )
}

const realSchools: School[] = dataAvailable
  ? JSON.parse(fs.readFileSync(SCHOOLS_PATH, 'utf-8'))
  : []

// A representative spread of asks: no signal, one signal, multiple signals,
// signals nothing in the data can satisfy, and free text that extracts to
// nothing at all.
const REPRESENTATIVE_ASKS = [
  '',
  'schools in Brooklyn',
  'soccer and computer science in Queens',
  'schools for a kid who loves theater and swimming in the Bronx',
  'a school with a curling team on the moon',
  'robotics engineering in Manhattan',
]

;(dataAvailable ? describe : describe.skip)(
  'Rule #127.1: the ask never removes schools (real dataset)',
  () => {
    it('loads a non-trivial number of real schools to test against', () => {
      expect(realSchools.length).toBeGreaterThan(100)
    })

    it.each(REPRESENTATIVE_ASKS)('ask "%s" ranks the full real dataset without shrinking it', (question) => {
      const filters = extractFilters(question)
      const ranked = rankBySoftMatch(realSchools, filters)
      assertSameSchools(realSchools, ranked, question || '(empty ask)')
    })
  }
)
