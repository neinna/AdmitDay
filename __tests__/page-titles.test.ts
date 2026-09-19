import * as fs from 'fs'
import * as path from 'path'

/**
 * Issue #287: every route below / should carry its own page title
 * ("<Thing> · AdmitDay"), not the bare "AdmitDay" the root layout sets by
 * default. / is exempt — it stays "AdmitDay".
 */

function readSource(relPath: string): string {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf-8')
}

describe('app/layout.tsx sets the bare "AdmitDay" title for / (issue #287)', () => {
  it('root layout metadata title is exactly "AdmitDay"', () => {
    const src = readSource('app/layout.tsx')
    expect(src).toMatch(/title:\s*'AdmitDay'/)
  })
})

describe('/ keeps the bare "AdmitDay" title', () => {
  it('the home page does not override metadata', () => {
    const src = readSource('app/page.tsx')
    expect(src).not.toMatch(/export (const metadata|function generateMetadata|async function generateMetadata)/)
  })
})

const STATIC_TITLE_ROUTES: [string, string][] = [
  ['app/find/page.tsx', 'Find schools · AdmitDay'],
  ['app/shortlist/page.tsx', 'Shortlist · AdmitDay'],
  ['app/privacy/page.tsx', 'Privacy · AdmitDay'],
  ['app/terms/page.tsx', 'Terms · AdmitDay'],
]

describe('every other route exports a title other than the bare "AdmitDay" (issue #287)', () => {
  it.each(STATIC_TITLE_ROUTES)('%s exports metadata.title %s', (file, expectedTitle) => {
    const src = readSource(file)
    expect(src).toContain("import type { Metadata } from 'next'")
    expect(src).toContain('export const metadata: Metadata')
    expect(src).toContain(`title: '${expectedTitle}'`)
  })

  it('app/school/[dbn]/page.tsx exports generateMetadata building "<School name> · AdmitDay"', () => {
    const src = readSource('app/school/[dbn]/page.tsx')
    expect(src).toContain('export async function generateMetadata(')
    expect(src).toMatch(/title:\s*`\$\{formatSchoolName\(school\.name\)\} · AdmitDay`/)
  })
})
