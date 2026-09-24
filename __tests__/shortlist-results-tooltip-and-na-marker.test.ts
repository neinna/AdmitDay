import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

/**
 * __tests__/shortlist-results-tooltip-and-na-marker.test.ts
 *
 * Issue #422 — "Results 71%" reads as a score when it is a percentile, so the
 * Results cell gets the same tooltip wording already approved and live on
 * /find. And a missing applicants-per-seat figure moves from a page-level
 * "Data gap" paragraph to a compact `n/a` marker carrying the explanation in
 * `title`/`aria-label`, keeping it distinct from "Not offered" (#116).
 */
jest.mock('@clerk/nextjs', () => ({
  ClerkLoaded: ({ children }: { children: React.ReactNode }) => children,
  SignedIn: () => null,
  SignedOut: ({ children }: { children: React.ReactNode }) => children,
  SignInButton: ({ children }: { children: React.ReactNode }) => children,
  SignUpButton: ({ children }: { children: React.ReactNode }) => children,
  UserButton: () => null,
}))

import ShortlistClient from '@/app/shortlist/ShortlistClient'
import type { ListSchool, ListSchoolDetail } from '@/lib/saved-list-utils'

const RESULTS_TOOLTIP = 'Results better than 71% of NYC high schools'
const NOT_REPORTED_TOOLTIP = 'Not published by the DOE for this school — not a low number.'

function makeIndex(overrides: Partial<ListSchool> = {}): ListSchool[] {
  return [
    {
      dbn: '02M475',
      name: 'Stuyvesant High School',
      borough: 'Manhattan',
      admissions_types: ['SHSAT'],
      applicants_per_seat: 3.5,
      neighborhood: 'Lower East Side',
      ...overrides,
    },
  ]
}

function makeDetail(overrides: Partial<ListSchoolDetail> = {}): ListSchoolDetail {
  return {
    total_students: null,
    programs: [],
    doe_data: { address: '', website: '' },
    ...overrides,
  }
}

function render(index: ListSchool[], details: Record<string, ListSchoolDetail> = {}) {
  return renderToStaticMarkup(
    React.createElement(ShortlistClient, {
      index,
      initialOrder: [index[0].dbn],
      details,
      signedIn: true,
    })
  )
}

describe('/shortlist Results tooltip (issue #422)', () => {
  it('carries the approved percentile explanation on title and aria-label', () => {
    const html = render(makeIndex(), { '02M475': makeDetail({ sqr: { performance_pctl: 71 } }) })
    expect(html).toContain(`title="${RESULTS_TOOLTIP}"`)
    expect(html).toContain(`aria-label="${RESULTS_TOOLTIP}"`)
  })

  it('does not change the displayed number', () => {
    const html = render(makeIndex(), { '02M475': makeDetail({ sqr: { performance_pctl: 71 } }) })
    expect(html).toContain('>71%<')
  })
})

describe('/shortlist apps/seat n/a marker (issue #422)', () => {
  it('renders a compact "n/a" marker carrying the DOE-gap tooltip when the ratio is missing', () => {
    const html = render(makeIndex({ applicants_per_seat: null }))
    expect(html).toContain('>n/a<')
    expect(html).toContain(`title="${NOT_REPORTED_TOOLTIP}"`)
    expect(html).toContain(`aria-label="${NOT_REPORTED_TOOLTIP}"`)
    expect(html).not.toContain('Not reported')
  })

  it('renders no page-level "Data gap" paragraph when the ratio is missing', () => {
    const html = render(makeIndex({ applicants_per_seat: null }))
    expect(html).not.toContain('Data gap')
    expect(html).not.toContain('gap in the source data')
  })

  it('renders neither the marker nor the tooltip when a ratio is reported', () => {
    const html = render(makeIndex())
    expect(html).not.toContain('>n/a<')
    expect(html).not.toContain(NOT_REPORTED_TOOLTIP)
    expect(html).not.toContain('Data gap')
  })
})
