import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

/**
 * __tests__/shortlist-shsat-sections.test.ts
 *
 * Issue #406 — the real NYC application has a separate SHSAT ranking from
 * the main ranked list, so /shortlist splits its one flat list into an
 * "SHSAT" section and a "Main List" section. A school's section is decided
 * entirely by its admissions type (the SHSAT bucket already used by the
 * composition rail, see saved-list-utils.ts's `bucketForSchool`), never by
 * position, and rank numbering restarts at 01 within each section.
 */
jest.mock('@clerk/nextjs', () => ({
  ClerkLoaded: ({ children }: { children: React.ReactNode }) => children,
  SignedIn: () => null,
  SignedOut: ({ children }: { children: React.ReactNode }) => children,
  SignInButton: ({ children }: { children: React.ReactNode }) => children,
  SignUpButton: ({ children }: { children: React.ReactNode }) => children,
  UserButton: () => null,
}))

import ShortlistClient, { moveWithinSection } from '@/app/shortlist/ShortlistClient'

function makeIndex() {
  return [
    {
      dbn: '02M475',
      name: 'Stuyvesant High School',
      borough: 'Manhattan',
      admissions_types: ['SHSAT'],
      applicants_per_seat: 9.2,
      neighborhood: 'Lower East Side',
    },
    {
      dbn: '13K430',
      name: 'Brooklyn Technical High School',
      borough: 'Brooklyn',
      admissions_types: ['SHSAT'],
      applicants_per_seat: 5.1,
      neighborhood: 'Fort Greene',
    },
    {
      dbn: '01M292',
      name: 'Orchard Collegiate Academy',
      borough: 'Manhattan',
      admissions_types: ['Educational Option'],
      applicants_per_seat: 0.7,
      neighborhood: 'Lower East Side',
    },
    {
      dbn: '02Q999',
      name: 'Sparse Data High School',
      borough: 'Queens',
      admissions_types: ['Screened'],
      applicants_per_seat: null,
      neighborhood: null,
    },
  ]
}

describe('/shortlist SHSAT / Main List split (issue #406)', () => {
  it('renders both headings for a mixed list, each numbered independently starting at 01', () => {
    const html = renderToStaticMarkup(
      React.createElement(ShortlistClient, {
        index: makeIndex(),
        initialOrder: ['02M475', '13K430', '01M292', '02Q999'],
        signedIn: true,
      })
    )

    expect(html).toContain('SHSAT')
    expect(html).toContain('Main List')

    const shsatIdx = html.indexOf('SHSAT')
    const mainIdx = html.indexOf('Main List')
    expect(shsatIdx).toBeGreaterThan(-1)
    expect(mainIdx).toBeGreaterThan(shsatIdx)

    // Two "01"s: one for the first SHSAT school, one for the first Main List
    // school — numbering restarts rather than continuing 01, 02, 03, 04.
    const firstSectionHtml = html.slice(shsatIdx, mainIdx)
    const secondSectionHtml = html.slice(mainIdx)
    expect(firstSectionHtml).toContain('01')
    expect(firstSectionHtml).toContain('02')
    expect(secondSectionHtml).toContain('01')
    expect(secondSectionHtml).toContain('02')
  })

  it('renders no SHSAT heading when no saved school has the SHSAT flag', () => {
    const html = renderToStaticMarkup(
      React.createElement(ShortlistClient, {
        index: makeIndex().filter((s) => s.dbn !== '02M475' && s.dbn !== '13K430'),
        initialOrder: ['01M292', '02Q999'],
        signedIn: true,
      })
    )

    // The ranking list itself, isolated from the composition rail below it —
    // that rail keeps its own "SHSAT" bucket label at 0 (issue #406 point 6,
    // "the composition summary below the list stays as it is"), which is not
    // what this assertion is about. The rail lost its "Composition" eyebrow
    // in issue #424, so the <aside> tag marks the boundary instead.
    const rankingSection = html.slice(html.indexOf('Your ranking'), html.indexOf('<aside'))
    expect(rankingSection).not.toContain('SHSAT')
    expect(rankingSection).toContain('Main List')
  })

  it('renders no Main List heading when every saved school has the SHSAT flag', () => {
    const html = renderToStaticMarkup(
      React.createElement(ShortlistClient, {
        index: makeIndex().filter((s) => s.dbn === '02M475' || s.dbn === '13K430'),
        initialOrder: ['02M475', '13K430'],
        signedIn: true,
      })
    )

    expect(html).toContain('SHSAT')
    expect(html).not.toContain('Main List')
  })
})

describe('moveWithinSection (issue #406)', () => {
  it('stays within a section when moving up or down, never crossing into the other section', () => {
    // Underlying saved order interleaves SHSAT (S) and Main (M) schools.
    const order = ['S1', 'M1', 'S2', 'M2']
    const mainDbns = ['M1', 'M2']

    // M1 is the first Main List school; moving it "up" (localIndex 0, dir -1)
    // is a no-op — there's no Main List school above it, even though S1 sits
    // immediately before it in the raw order.
    expect(moveWithinSection(order, mainDbns, 0, -1)).toBe(order)

    // M2 is the last Main List school; moving it "down" (localIndex 1, dir 1)
    // is a no-op — there's no Main List school below it, even though nothing
    // sits after it in the raw order either.
    expect(moveWithinSection(order, mainDbns, 1, 1)).toBe(order)

    // Moving M1 down swaps it with M2, the next Main List school, wherever
    // M2 actually sits in the raw order — S1 and S2 (and their positions)
    // are untouched.
    expect(moveWithinSection(order, mainDbns, 0, 1)).toEqual(['S1', 'M2', 'S2', 'M1'])
  })

  it("moving the last Main List school down does not move it into the SHSAT section", () => {
    const order = ['M1', 'M2', 'S1']
    const mainDbns = ['M1', 'M2']

    // M2 is the last Main List school (localIndex 1). Moving it down must
    // not swap it with S1, the next item in the raw array but a school in
    // the other section.
    expect(moveWithinSection(order, mainDbns, 1, 1)).toBe(order)
  })
})
