import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

/**
 * __tests__/shortlist-no-composition-rail.test.tsx
 *
 * Issue #483 — the unlabelled composition rail below the ranking list was
 * removed. This asserts the markup no longer contains an <aside>.
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

function makeIndex() {
  const boroughs = ['Manhattan', 'Brooklyn', 'Queens', 'Bronx']
  return Array.from({ length: 8 }, (_, i) => ({
    dbn: `0${i}X00${i}`,
    name: `School ${i}`,
    borough: boroughs[i % boroughs.length],
    admissions_types: i % 2 === 0 ? ['SHSAT'] : ['Screened'],
    applicants_per_seat: 2 + i,
    neighborhood: 'Somewhere',
  }))
}

describe('/shortlist no composition rail (issue #483)', () => {
  it('renders no <aside> for a list of 8 saved schools', () => {
    const index = makeIndex()
    const html = renderToStaticMarkup(
      React.createElement(ShortlistClient, {
        index,
        initialOrder: index.map((s) => s.dbn),
        signedIn: true,
      })
    )

    expect(html).not.toContain('<aside')
  })
})
