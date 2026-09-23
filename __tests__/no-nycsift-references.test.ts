import fs from 'fs'
import path from 'path'

/**
 * Issue #337. NYC-SIFT was removed as a data source: the scraper (issue
 * #336), the validation fallback, and the provenance entry are all gone.
 * This guards against it quietly coming back -- in a new field, a hardcoded
 * label, a copy-pasted fixture -- anywhere the app actually runs. Mentions in
 * a comment describing the removal itself are fine; a live reference is not.
 */

const ROOT = path.resolve(__dirname, '..')
const SCAN_DIRS = ['scripts', 'lib', 'app', 'components']
const EXTENSIONS = new Set(['.ts', '.tsx'])
const NYC_SIFT_PATTERN = /nyc-sift|nycsift/i

function collectFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  return entries.flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return collectFiles(full)
    return EXTENSIONS.has(path.extname(entry.name)) ? [full] : []
  })
}

/** Strips // line comments and /* block comments (including JSDoc) so a
 * historical mention of NYC-SIFT in prose doesn't trip the live-code check. */
function stripComments(source: string): string {
  const withoutBlocks = source.replace(/\/\*[\s\S]*?\*\//g, '')
  return withoutBlocks
    .split('\n')
    .map((line) => {
      const idx = line.indexOf('//')
      return idx === -1 ? line : line.slice(0, idx)
    })
    .join('\n')
}

const files = SCAN_DIRS.flatMap((dir) => {
  const full = path.join(ROOT, dir)
  return fs.existsSync(full) ? collectFiles(full) : []
})

describe('no live NYC-SIFT references remain (issue #337)', () => {
  it('scans a non-trivial number of files', () => {
    expect(files.length).toBeGreaterThan(20)
  })

  it.each(files.map((f) => path.relative(ROOT, f)))('%s', (relativePath) => {
    const source = fs.readFileSync(path.join(ROOT, relativePath), 'utf-8')
    const code = stripComments(source)
    expect(code).not.toMatch(NYC_SIFT_PATTERN)
  })
})
