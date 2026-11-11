/**
 * Issue #760 — with staleTimes.dynamic = 30 the browser may reuse a cached
 * /shortlist page. On open, ShortlistClient compares the live saved list with
 * initialOrder and calls router.refresh() once if they differ.
 */
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const refresh = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

jest.mock('@clerk/nextjs', () => ({
  ClerkLoaded: ({ children }: { children: React.ReactNode }) => children,
  SignedIn: () => null,
  SignedOut: ({ children }: { children: React.ReactNode }) => children,
  SignInButton: ({ children }: { children: React.ReactNode }) => children,
  SignUpButton: ({ children }: { children: React.ReactNode }) => children,
  UserButton: () => null,
}))

import { withPrograms } from './helpers/shortlist-programs'
import ShortlistClient from '@/app/shortlist/ShortlistClient'

const index = ['01M001', '01M002'].map((dbn) => ({
  dbn,
  name: `School ${dbn}`,
  borough: 'Manhattan',
  admissions_types: ['zoned'],
  applicants_per_seat: 1,
  neighborhood: null,
}))

// No DOM environment or testing-library is installed, so render on the server
// and run the effects ourselves: spy on useEffect, collect the callbacks, and
// invoke them as the browser would after mount.
async function renderClient(signedIn = true) {
  const effects: Array<() => void | (() => void)> = []
  const spy = jest.spyOn(React, 'useEffect').mockImplementation((fn) => {
    effects.push(fn as () => void)
  })
  let html = ''
  try {
    html = renderToStaticMarkup(
      <ShortlistClient index={index as never} {...withPrograms(index as never, ['01M001', '01M002'])} signedIn={signedIn} />,
    )
  } finally {
    spy.mockRestore()
  }
  effects.forEach((fn) => fn())
  await new Promise((r) => setTimeout(r, 0))
  return { html }
}

function mockLive(codes: string[]) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ programs: codes.map((program_code) => ({ program_code })) }),
  }) as never
}

beforeEach(() => refresh.mockClear())

describe('ShortlistClient stale page refresh (issue #760)', () => {
  it('refreshes once when the live list has a code not in initialOrder', async () => {
    mockLive(['P-01M001', 'P-01M002', 'P-01M003'])
    await renderClient()
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('refreshes once when the live list lacks a code in initialOrder', async () => {
    mockLive(['P-01M001'])
    await renderClient()
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('does not refresh when the live list equals initialOrder in any order', async () => {
    mockLive(['P-01M002', 'P-01M001'])
    await renderClient()
    expect(global.fetch).toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('keeps the rendered rows and does not refresh when fetch rejects', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as never
    const { html } = await renderClient()
    expect(global.fetch).toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
    expect(html).toContain('Program of School 01M001')
  })

  it('keeps the rendered rows and does not refresh when the response is not ok', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, json: async () => ({}) }) as never
    const { html } = await renderClient()
    expect(global.fetch).toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
    expect(html).toContain('Program of School 01M001')
  })

  it('does not fetch when signed out', async () => {
    global.fetch = jest.fn() as never
    await renderClient(false)
    expect(global.fetch).not.toHaveBeenCalled()
  })
})

describe('shortlist page re-sync after router.refresh() (issue #760)', () => {
  it('keys ShortlistClient by the saved list so useState(initialOrder) re-initialises', () => {
    const fs = require('fs') as typeof import('fs')
    const src = fs.readFileSync('app/shortlist/page.tsx', 'utf8')
    expect(src).toMatch(/<ShortlistClient key=\{initialOrder\.join\(','\)\}/)
  })
})
