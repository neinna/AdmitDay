import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import SchoolRow from '../components/ui/SchoolRow'

// #432: the badge text lagged the decided wording, "Strong student growth".
describe('SchoolRow "Strong student growth" badge (issue #414)', () => {
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

  it('renders "Strong student growth" when flags.high_impact is true', () => {
    const html = renderToStaticMarkup(React.createElement(SchoolRow, { ...baseProps, isHighImpact: true }))
    expect(html).toContain('Strong student growth')
  })

  it('renders no badge when flags.high_impact is false', () => {
    const html = renderToStaticMarkup(React.createElement(SchoolRow, { ...baseProps, isHighImpact: false }))
    expect(html).not.toContain('Strong student growth')
  })
})
