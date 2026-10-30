import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

/**
 * Issue #627 — Shortlist rows label School and Program, the expand/print detail
 * shows one Location field, and the website is a link that opens in a new tab.
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

const school = {
  dbn: '30Q445',
  name: 'Orchard Collegiate Academy',
  borough: 'Queens',
  admissions_types: ['Educational Option'],
  applicants_per_seat: 1.2,
  neighborhood: 'Hunters Point-Sunnyside',
}

function render(website: string) {
  return renderToStaticMarkup(
    React.createElement(ShortlistClient, {
      index: [school],
      initialOrder: ['A1', 'A2'],
      programs: {
        A1: { program_code: 'A1', dbn: '30Q445', name: 'Engineering', term: null },
        A2: { program_code: 'A2', dbn: '30Q445', name: 'Nursing', term: null },
      },
      details: {
        '30Q445': {
          total_students: null,
          programs: [],
          doe_data: { address: '45-30 36 Street', website },
        },
      },
      signedIn: true,
    })
  )
}

describe('/shortlist School / Program labels (issue #627)', () => {
  const html = render('www.orchardcollegiateacademy.org')

  it('labels the school and the program on the row', () => {
    expect(html).toContain('<span class="text-faint">School:</span>')
    expect(html).toContain('<span class="text-faint">Program:</span> Engineering')
    expect(html).toContain('Orchard Collegiate Academy</a>')
  })

  it('gives two programs from one school different control labels', () => {
    expect(html).toContain('aria-label="Remove Engineering"')
    expect(html).toContain('aria-label="Remove Nursing"')
    expect(html).not.toContain('aria-label="Remove Orchard Collegiate Academy"')
  })

  it('prints School and Program lines', () => {
    expect(html).toContain('School: Orchard Collegiate Academy')
    expect(html).toContain('Program: Engineering · 30Q445 · A1')
  })

  it('shows one Location row with the joined value', () => {
    expect(html).toContain('Location')
    expect(html).toContain('45-30 36 Street, Hunters Point-Sunnyside, Queens')
    expect(html).not.toContain('>Borough<')
    expect(html).not.toContain('>Neighborhood<')
    expect(html).not.toContain('>Address<')
  })

  it('renders a bare www. website as an https link opening in a new tab', () => {
    expect(html).toContain('href="https://www.orchardcollegiateacademy.org"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
  })

  it('keeps an existing https:// website unchanged', () => {
    expect(render('http://oca.example.org')).toContain('href="http://oca.example.org"')
  })
})
