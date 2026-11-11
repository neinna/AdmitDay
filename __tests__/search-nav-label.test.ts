/**
 * Issue #585 — the /find page is named in the nav; the URL stays /find.
 * Since the menu became Schools · My list · Students, every header renders the
 * shared <SiteNav>, and /find's label is "Schools". Same guarantee as before
 * (each page links /find under the page's current name, never "Find"), moved
 * to the shared component. Source-text assertions (jest runs under plain node).
 */
import * as fs from 'fs'
import * as path from 'path'

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf-8')

describe('nav label for /find (issue #585, renamed Schools)', () => {
  it.each([
    'app/page.tsx',
    'app/privacy/page.tsx',
    'app/terms/page.tsx',
    'app/disclaimers/page.tsx',
    'app/shortlist/ShortlistClient.tsx',
  ])('%s renders the shared SiteNav', (file) => {
    const src = read(file)
    expect(src).toMatch(/<SiteNav\b/)
    expect(src).not.toContain('>Find</Link>')
    expect(src).not.toContain('>Search</Link>')
  })

  it('SiteNav links /find with the label Schools', () => {
    const src = read('components/SiteNav.tsx')
    expect(src).toContain("{ key: 'schools', href: '/find', label: 'Schools' }")
  })

  it('FindClient marks Schools as the active nav item', () => {
    const src = read('app/find/FindClient.tsx')
    expect(src).toMatch(/<SiteNav[\s\S]*?active="schools"/)
    expect(src).not.toContain('>Find</span>')
  })
})
