import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

/**
 * __tests__/shortlist-row-expand.test.ts
 *
 * Issue #408 — each Shortlist row gains a disclosure control that expands a
 * detail panel beneath it, reusing the same field set the print block (#405)
 * renders rather than a second field list. Collapsed by default, several
 * rows may be open at once, expanding never touches saved order, and it must
 * never fire `school_detail_viewed` (that event means a visit to the school
 * page) or any other PostHog event.
 *
 * This repo's jest config runs in the `node` environment with no
 * jsdom/testing-library (see posthog-funnel-instrumentation.test.ts), so the
 * click-driven parts of this behavior (the flip, multi-row state) are
 * covered by unit-testing the exported pure `toggleExpandedDbn` reducer —
 * the same pattern `moveWithinSection` uses for #406 — while the default
 * (collapsed) render is covered with `renderToStaticMarkup`, and the "no
 * analytics" requirement is covered by asserting the toggle wiring never
 * references posthog.
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
import ShortlistClient, { toggleExpandedDbn } from '@/app/shortlist/ShortlistClient'
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
      applicants_per_seat: 9.2,
      neighborhood: 'Lower East Side',
    },
    {
      dbn: '01M292',
      name: 'Orchard Collegiate Academy',
      borough: 'Manhattan',
      admissions_types: ['Educational Option'],
      applicants_per_seat: 0.7,
      neighborhood: 'Lower East Side',
    },
  ]
}

function makeDetail(overrides: Partial<ListSchoolDetail> = {}): ListSchoolDetail {
  return {
    total_students: null,
    programs: [],
    doe_data: { address: '123 Test St', website: '' },
    ...overrides,
  }
}

describe('toggleExpandedDbn (issue #408)', () => {
  it('adds a dbn not already present, flipping it "open"', () => {
    const result = toggleExpandedDbn(new Set(), 'A')
    expect(result.has('A')).toBe(true)
  })

  it('removes a dbn already present, flipping it back "closed"', () => {
    const result = toggleExpandedDbn(new Set(['A']), 'A')
    expect(result.has('A')).toBe(false)
  })

  it('leaves other open dbns untouched, so several rows can be open at once', () => {
    const result = toggleExpandedDbn(new Set(['A']), 'B')
    expect(result.has('A')).toBe(true)
    expect(result.has('B')).toBe(true)
  })

  it('does not mutate the set passed in', () => {
    const original = new Set(['A'])
    toggleExpandedDbn(original, 'B')
    expect(original.has('B')).toBe(false)
  })
})

describe('/shortlist row expand panel — default render (issue #408)', () => {
  it('renders the disclosure control collapsed (aria-expanded="false") with no panel in the DOM', () => {
    const html = renderToStaticMarkup(
      React.createElement(ShortlistClient, {
        index: makeIndex(),
        initialOrder: ['02M475'],
        details: { '02M475': makeDetail({ doe_data: { address: '123 Test St', website: '' } }) },
        signedIn: true,
      })
    )

    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('aria-controls="shortlist-detail-02M475"')
    expect(html).not.toContain('id="shortlist-detail-02M475"')
    // The address only appears in the (always-rendered, CSS-hidden) print
    // block, never in the collapsed in-page panel.
    expect(html.match(/123 Test St/g)?.length).toBe(1)
  })

  it('renders no aria-expanded="true" and no panel id when nothing is expanded', () => {
    const html = renderToStaticMarkup(
      React.createElement(ShortlistClient, {
        index: makeIndex(),
        initialOrder: ['02M475', '01M292'],
        details: {},
        signedIn: true,
      })
    )

    expect(html).not.toContain('aria-expanded="true"')
    expect(html).not.toMatch(/id="shortlist-detail-/)
  })
})

describe('/shortlist row expand — wiring (issue #408)', () => {
  const src = readSource()

  it('ties aria-expanded and aria-controls to component state, not the print block', () => {
    expect(src).toMatch(/aria-expanded=\{isExpanded\}/)
    expect(src).toMatch(/aria-controls=\{detailPanelId\}/)
    expect(src).toContain('const detailPanelId = `shortlist-detail-${school.dbn}`')
  })

  it('reuses the same SchoolDetailFields component for both the print block and the expand panel (no second field list)', () => {
    const occurrences = src.split('<SchoolDetailFields').length - 1
    expect(occurrences).toBe(2)
  })

  it('the toggle handler only flips expandedDbns and never fires a PostHog event', () => {
    const start = src.indexOf('const toggleExpanded = ')
    const end = src.indexOf('\n  }', start)
    const body = src.slice(start, end)
    expect(body).toContain('setExpandedDbns')
    expect(body).not.toContain('posthog')
    expect(body).not.toContain('capture(')
  })

  it('the expand/collapse button never appears inside a school_detail_viewed capture call', () => {
    const idx = src.indexOf('toggleExpanded(school.dbn)')
    expect(idx).toBeGreaterThan(-1)
    const nearby = src.slice(Math.max(0, idx - 200), idx + 200)
    expect(nearby).not.toContain('school_detail_viewed')
  })

  it('the disclosure control is a real <button>, not a link or div', () => {
    const idx = src.indexOf('toggleExpanded(school.dbn)')
    const buttonStart = src.lastIndexOf('<button', idx)
    expect(buttonStart).toBeGreaterThan(-1)
    expect(src.slice(buttonStart, idx)).not.toContain('</button>')
  })
})
