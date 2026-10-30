import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import NotFound from '@/app/not-found'

jest.mock('@/components/AuthControls', () => ({ __esModule: true, default: () => null }))

describe('root not-found page', () => {
  const html = renderToStaticMarkup(React.createElement(NotFound))

  it('renders the heading', () => {
    expect(html).toMatch(/<h1[^>]*>We can(’|&#x27;|&rsquo;)t find that page<\/h1>/)
  })

  it('links to /find and /', () => {
    expect(html).toMatch(/<a href="\/find"[^>]*>(?:(?!<\/a>).)*Search schools/)
    expect(html).toMatch(/<a [^>]*class="[^"]*text-accent[^"]*"[^>]*href="\/"[^>]*>Home<\/a>/)
  })
})
