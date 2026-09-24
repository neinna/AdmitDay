import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

/**
 * __tests__/shortlist-row-precision-and-grid.test.ts
 *
 * Issue #421 — the Shortlist row printed the raw applicants-per-seat float
 * instead of rounding like the print/detail block and /find, repeated the
 * word "Results" under a column already headed "Results", and let the `1fr`
 * school column absorb all slack so the numeric columns collided with the
 * row's +/up/down/remove controls.
 */
jest.mock('@clerk/nextjs', () => ({
  ClerkLoaded: ({ children }: { children: React.ReactNode }) => children,
  SignedIn: () => null,
  SignedOut: ({ children }: { children: React.ReactNode }) => children,
  SignInButton: ({ children }: { children: React.ReactNode }) => children,
  SignUpButton: ({ children }: { children: React.ReactNode }) => children,
  UserButton: () => null,
}))

import * as fs from 'fs'
import * as path from 'path'
import ShortlistClient from '@/app/shortlist/ShortlistClient'
import type { ListSchool, ListSchoolDetail } from '@/lib/saved-list-utils'

function readSource(): string {
  return fs.readFileSync(path.join(__dirname, '..', 'app/shortlist/ShortlistClient.tsx'), 'utf-8')
}

function makeIndex(): ListSchool[] {
  return [
    {
      dbn: '02M475',
      name: 'Stuyvesant High School',
      borough: 'Manhattan',
      admissions_types: ['SHSAT'],
      applicants_per_seat: 3.4575260804769304,
      neighborhood: 'Lower East Side',
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

function render(details: Record<string, ListSchoolDetail> = {}) {
  return renderToStaticMarkup(
    React.createElement(ShortlistClient, {
      index: makeIndex(),
      initialOrder: ['02M475'],
      details,
      signedIn: true,
    })
  )
}

describe('/shortlist row applicants-per-seat rounding (issue #421)', () => {
  it('renders a raw float ratio rounded to one decimal, matching the print/detail block', () => {
    const html = render()
    expect(html).toContain('3.5')
    expect(html).not.toContain('3.4575260804769304')
  })

  it('rounds the ratio in the mobile stacked variant too, not just the desktop cell', () => {
    const html = render()
    expect(html).toContain('3.5 / seat')
  })
})

describe('/shortlist row Results column (issue #421)', () => {
  it('the desktop cell (under the "Results" column header) renders only the value', () => {
    const html = render({ '02M475': makeDetail({ sqr: { performance_pctl: 71 } }) })
    expect(html).toContain('>71%<')
  })

  it('"Results N%" appears exactly once — only in the mobile stacked variant, not the desktop cell', () => {
    const html = render({ '02M475': makeDetail({ sqr: { performance_pctl: 71 } }) })
    expect(html.match(/Results \d+%/g)?.length).toBe(1)
  })
})

describe('/shortlist row grid (issue #421)', () => {
  it('the school column no longer uses a bare 1fr that absorbs all slack at 700px+', () => {
    const src = readSource()
    expect(src).not.toContain('min-[700px]:grid-cols-[46px_1fr_132px_90px_76px_84px]')
    const gridClasses = src.match(/min-\[700px\]:grid-cols-\[46px_[^\]]+\]/g) ?? []
    expect(gridClasses.length).toBeGreaterThan(0)
    for (const cls of gridClasses) {
      expect(cls).toMatch(/minmax\(0,\s*24rem\)/)
    }
  })

  it('the header row and each school row share the same grid template', () => {
    const src = readSource()
    const gridClasses = src.match(/min-\[700px\]:grid-cols-\[46px_[^\]]+\]/g) ?? []
    expect(new Set(gridClasses).size).toBe(1)
  })
})
