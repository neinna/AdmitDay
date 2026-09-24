import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import SchoolRow from '../components/ui/SchoolRow'

// #414: the badge text lagged the #302 rename to flags.high_impact.
describe('SchoolRow "High impact" badge (issue #414)', () => {
  const baseProps = {
    rowNumber: 1,
    name: 'Test School',
    href: '/school/X000',
    metadata: 'Brooklyn',
    rationale: '',
    statValue: 1,
    statLabel: 'Rank',
    action: null,
  }

  it('renders "High impact" when flags.high_impact is true', () => {
    const html = renderToStaticMarkup(React.createElement(SchoolRow, { ...baseProps, isHighImpact: true }))
    expect(html).toContain('High impact')
  })

  it('renders no badge when flags.high_impact is false', () => {
    const html = renderToStaticMarkup(React.createElement(SchoolRow, { ...baseProps, isHighImpact: false }))
    expect(html).not.toContain('High impact')
  })
})
