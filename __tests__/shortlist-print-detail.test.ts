import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

/**
 * __tests__/shortlist-print-detail.test.ts
 *
 * Issue #405 — the Shortlist print sheet needs a full-detail block per school
 * (`hidden print:block`), labelled field by field, that omits anything the
 * DOE data doesn't publish rather than showing a blank or a zero. Uses the
 * same renderToStaticMarkup technique as shortlist-print-button.test.ts.
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

describe('/shortlist print detail block (issue #405)', () => {
  it('renders every listed field for a fully populated school', () => {
    const html = renderToStaticMarkup(
      React.createElement(ShortlistClient, {
        index: [
          {
            dbn: '01M292',
            name: 'Orchard Collegiate Academy',
            borough: 'Manhattan',
            admissions_types: ['Educational Option'],
            applicants_per_seat: 0.7,
            neighborhood: 'Lower East Side',
          },
        ],
        initialOrder: ['01M292'],
        details: {
          '01M292': {
            total_students: 258,
            sqr: { performance_pctl: 67, impact_pctl: 64, rating: 'Fair' },
            school_website: 'https://oca.example.org',
            programs: [
              {
                program_name: 'Orchard Collegiate Academy',
                program_code: 'M46X',
                admissions_method: 'Ed. Opt.',
              },
            ],
            doe_data: {
              address: '220 Henry Street',
              graduation_rate: 0.93,
              college_career_rate: 0.71,
              attendance_rate: 0.818,
              subway: 'F to East Broadway',
              bus: 'B39',
              website: 'www.orchardcollegiateacademy.org',
            },
          },
        },
        signedIn: true,
      })
    )

    // Rank, name, dbn.
    expect(html).toContain('01M292')
    expect(html).toContain('Orchard Collegiate Academy')
    // Borough, neighborhood, address.
    expect(html).toContain('Manhattan')
    expect(html).toContain('Lower East Side')
    expect(html).toContain('220 Henry Street')
    // Admissions track, via the existing trackLabel abbreviation.
    expect(html).toContain('Ed Opt')
    // Applicants per seat.
    expect(html).toContain('0.7 applicants per seat')
    // Results + impact.
    expect(html).toContain('67')
    expect(html).toContain('Fair')
    expect(html).toContain('64')
    // Graduation / college-career / attendance rates.
    expect(html).toContain('93%')
    expect(html).toContain('71%')
    expect(html).toContain('82%')
    // Total students.
    expect(html).toContain('258')
    // Transit.
    expect(html).toContain('F to East Broadway')
    expect(html).toContain('B39')
    // Website -- school_website takes priority over doe_data.website.
    expect(html).toContain('https://oca.example.org')
    // Program name + method.
    expect(html).toContain('Orchard Collegiate Academy')
    expect(html).toContain('Ed. Opt.')
    // Print date and school count at the top.
    expect(html).toContain('1 school')
  })

  it('omits fields the school has none of, rather than showing a blank', () => {
    const html = renderToStaticMarkup(
      React.createElement(ShortlistClient, {
        index: [
          {
            dbn: '02Q999',
            name: 'Sparse Data High School',
            borough: 'Queens',
            admissions_types: [],
            applicants_per_seat: null,
            neighborhood: null,
          },
        ],
        initialOrder: ['02Q999'],
        details: {},
        signedIn: true,
      })
    )

    expect(html).toContain('Sparse Data High School')
    expect(html).toContain('Queens')

    expect(html).not.toContain('applicants per seat')
    expect(html).not.toContain('Performance percentile')
    expect(html).not.toContain('Rating')
    expect(html).not.toContain('Impact percentile')
    expect(html).not.toContain('Graduation rate')
    expect(html).not.toContain('College and career rate')
    expect(html).not.toContain('Attendance rate')
    expect(html).not.toContain('Total students')
    expect(html).not.toContain('Subway')
    expect(html).not.toContain('Bus')
    expect(html).not.toContain('Website')
    expect(html).not.toContain('Programs')
    expect(html).not.toContain('Neighborhood')
    expect(html).not.toContain('Address')
    expect(html).not.toContain('Admissions tracks')
  })

  it('starts every school after the first on a new printed page', () => {
    const html = renderToStaticMarkup(
      React.createElement(ShortlistClient, {
        index: [
          {
            dbn: '01M001',
            name: 'First School',
            borough: 'Manhattan',
            admissions_types: [],
            applicants_per_seat: null,
            neighborhood: null,
          },
          {
            dbn: '02Q002',
            name: 'Second School',
            borough: 'Queens',
            admissions_types: [],
            applicants_per_seat: null,
            neighborhood: null,
          },
        ],
        initialOrder: ['01M001', '02Q002'],
        details: {},
        signedIn: true,
      })
    )

    const firstBlockIndex = html.indexOf('First School')
    const secondBlockIndex = html.indexOf('Second School')
    expect(firstBlockIndex).toBeGreaterThan(-1)
    expect(secondBlockIndex).toBeGreaterThan(firstBlockIndex)

    // The block around the second school carries the page-break class; the
    // first does not (it's already at the top of the sheet).
    const betweenBlocks = html.slice(0, secondBlockIndex)
    const secondBlockOpenTag = betweenBlocks.lastIndexOf('<div')
    expect(html.slice(secondBlockOpenTag, secondBlockIndex)).toContain('break-before-page')
  })
})
