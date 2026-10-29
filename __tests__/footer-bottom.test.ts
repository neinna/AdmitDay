import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'fs'
import { join } from 'path'
import Footer from '../components/Footer'

describe('footer sticks to the bottom of short pages', () => {
  it('footer has mt-auto and its child carries the border', () => {
    const html = renderToStaticMarkup(React.createElement(Footer))
    expect(html).toMatch(/^<footer class="mt-auto"><div class="[^"]*border-t[^"]*">/)
  })

  it.each([
    'app/disclaimers/page.tsx',
    'app/terms/page.tsx',
    'app/privacy/page.tsx',
    'app/admission-methods/page.tsx',
    'app/shortlist/page.tsx',
  ])('%s main is a flex column', (file) => {
    const src = readFileSync(join(__dirname, '..', file), 'utf8')
    expect(src).toContain('min-h-screen bg-white flex flex-col')
  })
})
