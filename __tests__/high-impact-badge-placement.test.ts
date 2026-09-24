import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import SchoolRow from '../components/ui/SchoolRow'

// #436: the badge sat inline beside the name in a flex row, so a long name
// pushed it to a different horizontal spot on every row and wrapped it into
// two stacked lines ("HIGH" / "IMPACT"). It must now render on its own line,
// beneath the metadata line, and never wrap inside itself.
describe('SchoolRow "Strong student growth" badge placement (issue #436)', () => {
  const baseProps = {
    rowNumber: 1,
    name: 'All City Leadership Secondary School',
    href: '/school/X000',
    metadata: 'Brooklyn, NY',
    rationale: '',
    statValue: 1,
    statLabel: 'Rank',
    action: null,
  }

  function render(isHighImpact: boolean) {
    return renderToStaticMarkup(React.createElement(SchoolRow, { ...baseProps, isHighImpact }))
  }

  it('never breaks the badge text across lines, regardless of name length', () => {
    const html = render(true)
    const badgeMatch = html.match(/<span[^>]*>Strong student growth<\/span>/)
    expect(badgeMatch).not.toBeNull()
    const badgeTag = badgeMatch![0]
    expect(badgeTag).toMatch(/class="[^"]*\bwhitespace-nowrap\b[^"]*"/)
  })

  it('places the badge after the metadata line rather than beside the name', () => {
    const html = render(true)
    const nameIndex = html.indexOf(baseProps.name)
    const metadataIndex = html.indexOf(baseProps.metadata)
    const badgeIndex = html.indexOf('Strong student growth')

    expect(nameIndex).toBeGreaterThan(-1)
    expect(metadataIndex).toBeGreaterThan(-1)
    expect(badgeIndex).toBeGreaterThan(-1)

    // Badge must come after the metadata line, not between the name and the
    // metadata line (which is where the old inline-beside-name markup put it).
    expect(badgeIndex).toBeGreaterThan(metadataIndex)
    expect(badgeIndex).toBeGreaterThan(nameIndex)
  })

  it('does not nest the badge inside the name row (sibling of the metadata line, not a child of it)', () => {
    const html = render(true)
    // The name sits in its own div; the badge must not appear inside that
    // same div (which is what "inline beside the name" looked like).
    const nameDivMatch = html.match(/<div[^>]*>All City Leadership Secondary School<\/div>/)
    expect(nameDivMatch).not.toBeNull()
    expect(nameDivMatch![0]).not.toContain('Strong student growth')
  })

  it('renders no badge when isHighImpact is false', () => {
    const html = render(false)
    expect(html).not.toContain('Strong student growth')
  })
})
