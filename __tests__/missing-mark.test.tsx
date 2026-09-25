import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import MissingMark from '@/components/ui/MissingMark'

describe('MissingMark', () => {
  it('renders "n/a" with the DOE-gap tooltip for kind="not_reported"', () => {
    const html = renderToStaticMarkup(React.createElement(MissingMark, { kind: 'not_reported' }))
    expect(html).toContain('>n/a<')
    expect(html).toContain('title="The DOE didn&#x27;t publish this."')
    expect(html).toContain('aria-label="The DOE didn&#x27;t publish this."')
    expect(html).not.toContain('text-red-700')
  })

  it('renders "none" with the not-offered tooltip for kind="not_offered"', () => {
    const html = renderToStaticMarkup(React.createElement(MissingMark, { kind: 'not_offered' }))
    expect(html).toContain('>none<')
    expect(html).toContain('title="This school doesn&#x27;t offer it."')
    expect(html).toContain('aria-label="This school doesn&#x27;t offer it."')
  })
})
