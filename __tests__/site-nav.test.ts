/**
 * The site menu: Schools · My list · Students, in that order, with the
 * account name to the right (AuthControls, outside this component).
 */
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import SiteNav from '@/components/SiteNav'

const render = (props: Parameters<typeof SiteNav>[0]) => renderToStaticMarkup(React.createElement(SiteNav, props))

describe('SiteNav', () => {
  it('renders Schools, My list, Students in order with their routes', () => {
    const html = render({})
    const links = [...html.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([^<]+)/g)].map((m) => [m[1], m[2]])
    expect(links).toEqual([
      ['/find', 'Schools'],
      ['/shortlist', 'My list'],
      ['/students', 'Students'],
    ])
  })

  it('marks only the active section with aria-current', () => {
    const html = render({ active: 'students' })
    expect(html.match(/aria-current="page"/g)).toHaveLength(1)
    expect(html).toMatch(/<a[^>]*href="\/students"[^>]*aria-current="page"|<a[^>]*aria-current="page"[^>]*href="\/students"/)
  })

  it('puts the list badge after My list', () => {
    const html = render({ listBadge: React.createElement('span', null, '3') })
    expect(html).toMatch(/My list<span>3<\/span><\/a>/)
  })
})

describe('SiteNav count on pages that do not pass a badge', () => {
  const { fetchSavedCount } = jest.requireActual('@/components/SiteNav')
  const reply = (ok: boolean, body: unknown) =>
    jest.fn().mockResolvedValue({ ok, json: async () => body }) as unknown as typeof fetch

  it('counts the saved programs', async () => {
    const f = reply(true, { programs: [{ program_code: 'K12A' }, { program_code: 'M34B' }] })
    await expect(fetchSavedCount(f)).resolves.toBe(2)
    expect(f).toHaveBeenCalledWith('/api/saved-programs')
  })

  it('shows nothing when signed out (401)', async () => {
    await expect(fetchSavedCount(reply(false, { error: 'Sign in required' }))).resolves.toBeNull()
  })

  it('shows nothing when the request fails or the body is malformed', async () => {
    const throws = jest.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch
    await expect(fetchSavedCount(throws)).resolves.toBeNull()
    await expect(fetchSavedCount(reply(true, { nope: 1 }))).resolves.toBeNull()
  })

  it('renders no badge before the count arrives (server render)', () => {
    const html = render({ active: 'list' })
    expect(html).toMatch(/My list<\/a>/)
  })
})
