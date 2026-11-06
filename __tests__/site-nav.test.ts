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
