/**
 * Issue #585 — the /find page is called "Search" in visible words; the URL
 * stays /find. Source-text assertions (jest runs under plain node, no jsdom).
 */
import * as fs from 'fs'
import * as path from 'path'

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf-8')

describe('nav label "Search" (issue #585)', () => {
  it.each([
    'app/page.tsx',
    'app/privacy/page.tsx',
    'app/terms/page.tsx',
    'app/disclaimers/page.tsx',
    'app/shortlist/ShortlistClient.tsx',
  ])('%s links to /find with the label Search', (file) => {
    const src = read(file)
    expect(src).toMatch(/<Link href="\/find"[^>]*>Search<\/Link>/)
    expect(src).not.toContain('>Find</Link>')
  })

  it('FindClient shows Search as the active nav item', () => {
    const src = read('app/find/FindClient.tsx')
    expect(src).toContain('>Search</span>')
    expect(src).not.toContain('>Find</span>')
  })
})
