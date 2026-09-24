import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

/**
 * __tests__/shortlist-results-and-dot.test.ts
 *
 * Issue #407 — the Shortlist compact row gains two fields: a "Results N%"
 * figure from `sqr.performance_pctl` (omitted entirely when absent), and a
 * competition dot beside applicants-per-seat, colored on the same citywide
 * percentile bands and reusing `applicantsPerSeatDotColor` from #403
 * (green under the 34th percentile, amber 34-66, red over 66).
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

// A fixed citywide pool used to derive predictable percentiles via the same
// `citywidePercentile` formula covered in admissions-evidence.test.ts:
// floor(100 * schools strictly below / schools with a value).
//   A=1, B=2, C=5, D=8, E=10
// citywidePercentile(2, pool)  -> floor(100*1/5) = 20  (green,  < 34)
// citywidePercentile(5, pool)  -> floor(100*2/5) = 40  (amber, 34-66)
// citywidePercentile(10, pool) -> floor(100*4/5) = 80  (red,   > 66)
function makePool(): ListSchool[] {
  return [
    { dbn: 'A', name: 'School A', borough: 'Manhattan', admissions_types: [], applicants_per_seat: 1, neighborhood: null },
    { dbn: 'B', name: 'School B', borough: 'Manhattan', admissions_types: [], applicants_per_seat: 2, neighborhood: null },
    { dbn: 'C', name: 'School C', borough: 'Manhattan', admissions_types: [], applicants_per_seat: 5, neighborhood: null },
    { dbn: 'D', name: 'School D', borough: 'Manhattan', admissions_types: [], applicants_per_seat: 8, neighborhood: null },
    { dbn: 'E', name: 'School E', borough: 'Manhattan', admissions_types: [], applicants_per_seat: 10, neighborhood: null },
  ]
}

function renderWithSaved(dbn: string, details: Record<string, ListSchoolDetail> = {}) {
  return renderToStaticMarkup(
    React.createElement(ShortlistClient, {
      index: makePool(),
      initialOrder: [dbn],
      details,
      signedIn: true,
    })
  )
}

function makeDetail(overrides: Partial<ListSchoolDetail> = {}): ListSchoolDetail {
  return {
    total_students: null,
    programs: [],
    doe_data: { address: '', website: '' },
    ...overrides,
  }
}

describe('/shortlist Results field (issue #407)', () => {
  it('renders "Results N%" when sqr.performance_pctl is present', () => {
    const html = renderWithSaved('B', { B: makeDetail({ sqr: { performance_pctl: 82 } }) })
    expect(html).toContain('Results 82%')
  })

  it('omits the field entirely when sqr is absent', () => {
    const html = renderWithSaved('B', {})
    expect(html).not.toMatch(/Results \d+%/)
  })

  it('omits the field entirely when sqr is present but performance_pctl is not', () => {
    const html = renderWithSaved('B', { B: makeDetail({ sqr: { rating: 'Good' } }) })
    expect(html).not.toMatch(/Results \d+%/)
  })
})

describe('/shortlist competition dot (issue #407)', () => {
  it('colors the dot green under the 34th percentile', () => {
    const html = renderWithSaved('B')
    expect(html).toContain('bg-green-600')
    expect(html).toContain('More applicants per seat than 20% of NYC high schools')
  })

  it('colors the dot amber from the 34th through the 66th percentile', () => {
    const html = renderWithSaved('C')
    expect(html).toContain('bg-amber-500')
    expect(html).toContain('More applicants per seat than 40% of NYC high schools')
  })

  it('colors the dot red above the 66th percentile', () => {
    const html = renderWithSaved('E')
    expect(html).toContain('bg-red-600')
    expect(html).toContain('More applicants per seat than 80% of NYC high schools')
  })

  it('renders no dot when applicants_per_seat is absent', () => {
    const pool = makePool()
    pool.push({
      dbn: 'F',
      name: 'School F',
      borough: 'Queens',
      admissions_types: [],
      applicants_per_seat: null,
      neighborhood: null,
    })
    const html = renderToStaticMarkup(
      React.createElement(ShortlistClient, {
        index: pool,
        initialOrder: ['F'],
        details: {},
        signedIn: true,
      })
    )
    expect(html).not.toContain('More applicants per seat than')
    expect(html).not.toContain('rounded-full')
  })
})
