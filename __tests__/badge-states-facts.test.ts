import * as fs from 'fs'
import * as path from 'path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import SchoolRow from '../components/ui/SchoolRow'

// #266 (Inna, 2026-09-18): the "Hidden gem" badge is renamed to the two facts
// behind it.
// #334: the underlying rule and source changed to flags.high_impact (impact
// percentile >= 80, DOE School Quality Reports 2024-25); NYC-SIFT is retired.
const files = ['app/school/[dbn]/SchoolDetailClient.tsx', 'components/ui/SchoolRow.tsx']

describe('school badge states facts, not a verdict', () => {
  it.each(files)('%s shows the factual label and no "Hidden gem"', (f) => {
    const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8')
    expect(src).toContain('High impact')
    expect(src).not.toMatch(/>\s*Hidden gem\s*</)
  })

  it.each(files)('%s badge tooltip cites DOE, not NYC-SIFT', (f) => {
    const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8')
    expect(src).toContain('Students grow more here than at 80%+ of NYC high schools (DOE, 2024-25)')
  })
})

describe('badge title text (issue #334)', () => {
  it.each(files)('%s: title contains DOE and no NYC-SIFT or applicants-per-seat language', (f) => {
    const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8')
    const match = src.match(/title="([^"]*)"[^>]*text-gem/)
    expect(match).not.toBeNull()
    const title = match![1]
    expect(title).toContain('DOE')
    expect(title).not.toContain('NYC-SIFT')
    expect(title).not.toContain('applicants per seat')
  })
})

describe('SchoolRow badge rendering (issue #334)', () => {
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

  it('a school without flags.high_impact (isHighImpact false) renders no badge', () => {
    const html = renderToStaticMarkup(React.createElement(SchoolRow, { ...baseProps, isHighImpact: false }))
    expect(html).not.toContain('High impact')
    expect(html).not.toContain('DOE, 2024-25')
  })

  it('a school with flags.high_impact (isHighImpact true) renders the badge with the DOE tooltip', () => {
    const html = renderToStaticMarkup(React.createElement(SchoolRow, { ...baseProps, isHighImpact: true }))
    expect(html).toContain('High impact')
    expect(html).toContain('Students grow more here than at 80%+ of NYC high schools (DOE, 2024-25)')
  })
})
