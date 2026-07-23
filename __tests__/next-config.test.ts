import * as fs from 'fs'
import * as path from 'path'

// ── next.config.js: in-memory webpack cache for production builds ────────────
// The VPS agent verification host has limited free disk; Next.js's default
// ~400MB filesystem cache in .next/cache caused ENOSPC during production
// builds. Production builds use an in-memory cache instead. These tests pin
// that fix (source-level, to avoid invoking the Sentry-wrapped webpack fn).

describe('next.config.js production build cache', () => {
  const source = fs.readFileSync(path.join(__dirname, '../next.config.js'), 'utf8')

  it('loads as a config module', () => {
    expect(require('../next.config.js')).toBeDefined()
  })

  it('uses an in-memory webpack cache for production builds (avoids ENOSPC)', () => {
    expect(source).toContain("config.cache = { type: 'memory' }")
    expect(source).toMatch(/if \(!dev\)/)
  })
})
