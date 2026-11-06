/**
 * Issue #745: program priority groups and DIA set-aside on the school page.
 */
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { dedupePrograms, programPriorities } from '@/lib/school-detail-utils'
import { School } from '@/types'
import SchoolDetailClient from '@/app/school/[dbn]/SchoolDetailClient'

jest.mock('posthog-js/react', () => ({ usePostHog: () => null }))
jest.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isSignedIn: false }),
  useClerk: () => ({ openSignIn: jest.fn() }),
}))
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href }: { children: unknown; href: string }) =>
    React.createElement('a', { href }, children as React.ReactNode),
}))
jest.mock('@/app/school/[dbn]/SiteHeader', () => ({ __esModule: true, default: () => null }))

const DIA_TEXT =
  'Applicants eligible for free or reduced price lunch will be considered in the same priority group order (see PRIORITY GROUPS above) for 66% of seats. For the remaining 34% of seats, all students will be considered in priority group order.'

const L63A = {
  priority_groups: [
    { order: 1, name: 'Brooklyn students or residents', ge_priority_group_description: 'About 160 received offers.' },
    { order: 2, name: 'New York City residents', ge_priority_group_description: 'x' },
  ],
  diversity_in_admission: [
    'Applicants eligible for free or reduced price lunch will be considered in the same priority group order (see PRIORITY GROUPS above) for 66% of seats.',
    'For the remaining 34% of seats, all students will be considered in priority group order.',
  ],
}

describe('programPriorities', () => {
  it('returns ordered groups and a DIA percentage label', () => {
    const r = programPriorities(L63A)
    expect(r.groups.map((g) => g.name)).toEqual(['Brooklyn students or residents', 'New York City residents'])
    expect(r.groups[0].lastYear).toBe('About 160 received offers.')
    expect(r.dia?.label).toBe('DIA 66%')
    expect(r.dia?.text).toBe(DIA_TEXT)
  })

  it('sorts groups given out of order', () => {
    const r = programPriorities({
      priority_groups: [
        { order: 2, name: 'B' },
        { order: 1, name: 'A', swd_priority_group_description: 'swd' },
      ],
    })
    expect(r.groups).toEqual([{ name: 'A', lastYear: 'swd' }, { name: 'B' }])
  })

  it('labels a DIA without a percentage as plain DIA', () => {
    const s = 'Applicants will be considered in rank order by zip code.'
    const r = programPriorities({ diversity_in_admission: [s] })
    expect(r.dia).toEqual({ label: 'DIA', text: s })
  })

  it.each([undefined, null, {}, { priority_groups: 'x' }])('returns no groups for %p', (input) => {
    const r = programPriorities(input)
    expect(r).toEqual({ groups: [] })
    expect(r.dia).toBeUndefined()
  })
})

describe('dedupePrograms', () => {
  it('omits priorities and dia when there is no eligibility', () => {
    const [row] = dedupePrograms([
      { program_name: 'P', program_code: 'P1', admissions_type: 'Open' },
    ] as unknown as School['programs'])
    expect('priorities' in row).toBe(false)
    expect('dia' in row).toBe(false)
  })
})

describe('SchoolDetailClient priorities line', () => {
  it('renders the priority order and the DIA aria-label', () => {
    const programs = dedupePrograms([
      { program_name: 'L63A', program_code: 'L63A', admissions_type: 'Screened', eligibility: L63A },
    ] as unknown as School['programs'])
    const html = renderToStaticMarkup(
      React.createElement(SchoolDetailClient, {
        school: { dbn: '15K684', programs: [], flags: {} } as unknown as School,
        name: 'Millennium Brooklyn',
        neighborhood: 'x',
        tracks: [],
        statCells: [],
        sqrTrends: [],
        shsatCutoffRows: [],
        programs,
        requirementBlocks: [],
        activityGroups: [],
        missingActivityGroups: [],
        matchedSignals: [],
        matchedDisplayLabels: [],
        subwayLines: [],
        busRoutes: [],
        provenanceRows: [],
        dataVintageNote: null,
        backHref: '/',
        backLabel: 'Back',
        positionLabel: null,
        alsoOnYourListIndex: [],
      })
    )
    const text = html.replace(/<[^>]+>/g, '')
    expect(text).toContain('Priority: Brooklyn students or residents → New York City residents')
    expect(html).toContain(`aria-label="${DIA_TEXT}"`)
    expect(html).not.toContain('FRL')
  })
})
