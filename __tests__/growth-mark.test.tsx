import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import GrowthMark from '../components/ui/GrowthMark'

describe('GrowthMark', () => {
  const html = renderToStaticMarkup(<GrowthMark label="Strong student growth" title="DOE" className="self-start" />)

  it('renders the dot span and the label', () => {
    expect(html).toContain('<span aria-hidden="true" class="inline-block w-[7px] h-[7px] rounded-full bg-gem"></span>')
    expect(html).toContain('<span>Strong student growth</span>')
    expect(html).toContain('title="DOE"')
    expect(html).toContain('self-start')
  })

  it('has no box background or border class', () => {
    expect(html).not.toContain('bg-gem-bg')
    expect(html).not.toMatch(/class="[^"]*\bborder\b/)
  })
})
