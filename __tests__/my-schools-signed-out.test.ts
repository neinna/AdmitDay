import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

/**
 * __tests__/my-schools-signed-out.test.ts
 *
 * Issue #240 — saving a school requires an account, so /my-schools no longer
 * redirects a signed-out visit elsewhere (see saved-lists-gate.test.ts for
 * the page.tsx source assertions). This renders MySchoolsClient directly, the
 * same technique privacy-terms-pages.test.ts uses for a page whose header
 * pulls in Clerk's SignedIn/SignedOut via AuthControls.
 */
jest.mock('@clerk/nextjs', () => ({
  ClerkLoaded: ({ children }: { children: React.ReactNode }) => children,
  SignedIn: () => null,
  SignedOut: ({ children }: { children: React.ReactNode }) => children,
  SignInButton: ({ children }: { children: React.ReactNode }) => children,
  SignUpButton: ({ children }: { children: React.ReactNode }) => children,
  UserButton: () => null,
}))

import MySchoolsClient from '@/app/my-schools/MySchoolsClient'

describe('/my-schools signed out (issue #240)', () => {
  it('shows the sign-in prompt and the Log in / Sign up controls, with no saved list', () => {
    const html = renderToStaticMarkup(
      React.createElement(MySchoolsClient, { index: [], initialOrder: [], signedIn: false })
    )

    expect(html).toContain('Sign in to see your saved schools.')
    expect(html).toContain('Log in')
    expect(html).toContain('Sign up')
    // None of the signed-in-only list chrome renders.
    expect(html).not.toContain('Your ranking')
    expect(html).not.toContain('Composition')
    expect(html).not.toContain('Nothing saved yet')
  })

  it('ignores any leftover initialOrder/index when signed out', () => {
    const html = renderToStaticMarkup(
      React.createElement(MySchoolsClient, {
        index: [
          {
            dbn: '01M001',
            name: 'Old Cached School',
            borough: 'Manhattan',
            admissions_types: ['zoned'],
            applicants_per_seat: 1,
            neighborhood: null,
          },
        ],
        initialOrder: ['01M001'],
        signedIn: false,
      })
    )

    expect(html).toContain('Sign in to see your saved schools.')
    expect(html).not.toContain('Old Cached School')
  })
})
