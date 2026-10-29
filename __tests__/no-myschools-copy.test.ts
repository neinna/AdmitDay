/**
 * Issue #564: parent-facing text must not name "MySchools". Links keep
 * pointing at myschools.nyc; only the words change. Legal pages are exempt.
 */
import fs from 'fs'
import path from 'path'

const FILES = [
  'app/shortlist/ShortlistClient.tsx',
  'app/school/[dbn]/SchoolDetailClient.tsx',
  'app/find/FindClient.tsx',
  'app/page.tsx',
  'lib/school-detail-utils.ts',
]

function visibleLines(file: string): string[] {
  const src = fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
  const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ''))
  return noBlock
    .split('\n')
    .filter((l) => !/^\s*(\/\/|import\s|\{\/\*)/.test(l))
    .filter((l) => !/^\s*(export\s+)?\{?[^'"`<>]*$/.test(l) || /['"`]/.test(l))
    .map((l) => l.replace(/\/\/.*$/, ''))
}

// Strip identifiers (buildMySchoolsUrl, myschoolsUrl, MYSCHOOLS_URL) and PROVENANCE_SOURCE.
function rendered(l: string): string {
  return l
    .replace(/\b\w*MySchools\w*\b(?=\s*[(,)=:;.]|\s*$)/g, '')
    .replace(/PROVENANCE_SOURCE\s*=.*/, '')
}

describe('no "MySchools" in parent-facing copy (issue #564)', () => {
  it.each(FILES)('%s has no MySchools in rendered strings', (file) => {
    const offenders = visibleLines(file).filter((l) => /MySchools/.test(rendered(l)))
    expect(offenders).toEqual([])
  })

  it('uses the new wording', () => {
    const read = (f: string) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')
    expect(read('app/find/FindClient.tsx')).toContain('Confirm with the DOE before you apply.')
    expect(read('app/shortlist/ShortlistClient.tsx')).toContain('to put these in the order you&rsquo;d rank them')
    expect(read('app/page.tsx')).toContain("The NYC Department of Education's public school directory.")
    expect(read('app/school/[dbn]/SchoolDetailClient.tsx')).toContain('(DOE data')
  })
})
