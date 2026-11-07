import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

jest.mock('@clerk/nextjs', () => ({
  ClerkLoaded: ({ children }: { children: React.ReactNode }) => children,
  SignedIn: () => null,
  SignedOut: ({ children }: { children: React.ReactNode }) => children,
  SignInButton: ({ children }: { children: React.ReactNode }) => children,
  SignUpButton: ({ children }: { children: React.ReactNode }) => children,
  UserButton: () => null,
}))

import ShortlistClient from '@/app/shortlist/ShortlistClient'
import type { ShortlistProgram } from '@/lib/saved-list-utils'

const school = {
  dbn: '30Q445',
  name: 'Orchard Collegiate Academy',
  borough: 'Queens',
  admissions_types: ['Educational Option'],
  applicants_per_seat: 1.2,
  neighborhood: 'Hunters Point-Sunnyside',
}

const diaText =
  'Applicants eligible for free or reduced price lunch will be considered in the same priority group order (see PRIORITY GROUPS above) for 66% of seats.'

function render(extra: Partial<ShortlistProgram>) {
  return renderToStaticMarkup(
    React.createElement(ShortlistClient, {
      index: [school],
      initialOrder: ['A1'],
      programs: {
        A1: { program_code: 'A1', dbn: '30Q445', name: 'Engineering', term: null, ...extra },
      },
      details: {},
      signedIn: true,
    })
  )
}

const text = (html: string) => html.replace(/<[^>]+>/g, '')

describe('/shortlist row priorities and DIA (issue #746)', () => {
  it('shows priority groups in order and the DIA set-aside', () => {
    const html = render({
      priorities: [{ name: 'Brooklyn students or residents' }, { name: 'New York City residents' }],
      dia: { label: 'DIA 66%', text: diaText },
    })
    expect(text(html)).toContain('Priority: Brooklyn students or residents → New York City residents')
    expect(html).toContain(`aria-label="${diaText}"`)
    expect(html).toMatch(/aria-label="[^"]*"[^>]*>DIA 66%</)
  })

  it('renders no line when the program has neither', () => {
    expect(text(render({}))).not.toContain('Priority:')
  })
})
