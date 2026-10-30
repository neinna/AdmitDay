import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

/**
 * Issue #623 — the Shortlist empty state links to /find with the label
 * "Search" (the page name since #585), not "Find schools".
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

describe('/shortlist empty state (issue #623)', () => {
  it('links to /find with the text "Search", not "Find schools"', () => {
    const html = renderToStaticMarkup(
      React.createElement(ShortlistClient, {
        index: [],
        initialOrder: [],
        programs: {},
        signedIn: true,
      })
    )

    const empty = html.match(/Nothing saved yet\.[\s\S]*?<\/p>/)?.[0] ?? ''
    expect(empty).toMatch(/<a [^>]*href="\/find"[^>]*>Search<\/a> and add the ones you want to compare\./)
    expect(html).not.toContain('Find schools')
  })
})
