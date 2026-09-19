import * as fs from 'fs'
import * as path from 'path'

// #266 (Inna, 2026-09-18): the "Hidden gem" badge is renamed to the two facts
// behind it. The rule is unchanged: fewer than 5 applicants per seat and an
// NYC-SIFT academic score above 60%.
const files = ['app/school/[dbn]/SchoolDetailClient.tsx', 'components/ui/SchoolRow.tsx']

describe('school badge states facts, not a verdict', () => {
  it.each(files)('%s shows the factual label and no "Hidden gem"', (f) => {
    const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8')
    expect(src).toContain('Fewer applicants per seat, strong results')
    expect(src).not.toMatch(/>\s*Hidden gem\s*</)
    expect(src).toContain('Under 5 applicants per seat and an academic score above 60% (NYC-SIFT)')
  })
})
