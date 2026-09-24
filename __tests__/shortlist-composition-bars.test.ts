import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

/**
 * __tests__/shortlist-composition-bars.test.ts
 *
 * Issue #424 — the composition aside shrinks from an eyebrow, a "N saved"
 * count, a bar, a four-row legend, a shape-sentence paragraph and a borough
 * grid down to two stacked bars: track mix and borough mix. Each segment
 * carries its label and count in `title`/`aria-label` instead of a legend
 * row, and a zero-count bucket still renders an accessible (if zero-width)
 * segment rather than disappearing like a pie chart's zero slice would.
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
import type { ListSchool } from '@/lib/saved-list-utils'

function makeIndex(): ListSchool[] {
  return [
    {
      dbn: '02M475',
      name: 'Stuyvesant High School',
      borough: 'Manhattan',
      admissions_types: ['SHSAT'],
      applicants_per_seat: 3.5,
    },
    {
      dbn: '13K430',
      name: 'Brooklyn Tech Annex',
      borough: 'Brooklyn',
      admissions_types: ['Screened'],
      applicants_per_seat: 2,
    },
  ]
}

function render(index: ListSchool[]) {
  return renderToStaticMarkup(
    React.createElement(ShortlistClient, {
      index,
      initialOrder: index.map((s) => s.dbn),
      signedIn: true,
    })
  )
}

describe('shortlist composition aside — two bars (issue #424)', () => {
  it('gives every track bucket segment a "{label}: {count}" tooltip, including a zero-count bucket', () => {
    const html = render(makeIndex())

    // SHSAT and Screened are on the list; Audition / portfolio and Open /
    // Ed Opt / zoned are not — those zero buckets must still produce an
    // accessible segment rather than vanish.
    expect(html).toContain('SHSAT: 1')
    expect(html).toContain('Screened: 1')
    expect(html).toContain('Audition / portfolio: 0')
    expect(html).toContain('Open / Ed Opt / zoned: 0')
  })

  it('gives every borough segment a "{label}: {count}" tooltip', () => {
    const html = render(makeIndex())

    expect(html).toContain('Manhattan: 1')
    expect(html).toContain('Brooklyn: 1')
  })

  it('renders no legend rows, no shape sentence, and no borough grid cells', () => {
    const html = render(makeIndex())

    expect(html).not.toContain('Reading the shape')
    expect(html).not.toContain('grid-cols-3')
    expect(html).not.toContain('Nothing is saved yet')
    expect(html).not.toContain('screens, tests or auditions')
  })

  it('drops the eyebrow and the "N saved" count', () => {
    const html = render(makeIndex())

    expect(html).not.toContain('Composition')
    expect(html).not.toContain('2 saved')
  })
})
