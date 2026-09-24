import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

/**
 * __tests__/shortlist-print-button.test.ts
 *
 * Issue #393 — the button that opens the browser print dialog (window.print())
 * was labelled "Export list", which promises a file download that never
 * happens. Renamed to "Print". Uses the same renderToStaticMarkup technique as
 * my-schools-signed-out.test.ts to render ShortlistClient directly.
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

describe('/shortlist print button (issue #393)', () => {
  it('labels the print-dialog button "Print", not "Export list"', () => {
    const html = renderToStaticMarkup(
      React.createElement(ShortlistClient, {
        index: [
          {
            dbn: '01M001',
            name: 'Some School',
            borough: 'Manhattan',
            admissions_types: ['zoned'],
            applicants_per_seat: 1,
            neighborhood: null,
          },
        ],
        initialOrder: ['01M001'],
        signedIn: true,
      })
    )

    expect(html).toContain('Print')
    expect(html).not.toContain('Export list')
  })
})
