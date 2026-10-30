import * as fs from 'fs'
import * as path from 'path'

function readSource(relPath: string): string {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf-8')
}

describe('share metadata (issue #655)', () => {
  it('root metadata has metadataBase, openGraph.siteName and twitter card', () => {
    const src = readSource('app/layout.tsx')
    expect(src).toContain("metadataBase: new URL('https://www.admitday.com')")
    expect(src).toMatch(/siteName:\s*'AdmitDay'/)
    expect(src).toMatch(/card:\s*'summary_large_image'/)
  })

  it('app/opengraph-image.tsx exports a 1200x630 png size', () => {
    const src = readSource('app/opengraph-image.tsx')
    expect(src).toMatch(/export const size = \{ width: 1200, height: 630 \}/)
    expect(src).toContain("export const contentType = 'image/png'")
    expect(src).toContain("export const alt = 'AdmitDay'")
  })

  it('school page metadata includes a description and openGraph', () => {
    const src = readSource('app/school/[dbn]/page.tsx')
    expect(src).toContain('programs, admissions methods and DOE data on AdmitDay.')
    expect(src).toMatch(/openGraph:\s*\{ title: `AdmitDay: \$\{name\}`, description \}/)
    expect(src).toContain("if (!school) return { title: 'AdmitDay' }")
  })
})
