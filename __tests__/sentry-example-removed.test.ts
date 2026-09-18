import * as fs from 'fs'
import * as path from 'path'

// ── Sentry wizard example must stay deleted ─────────────────────────────────
// The setup wizard's example page/route exist only to throw sample errors.
// Left in production, anyone can load them and flood Sentry with junk (#219),
// polluting the error feed the SLOs in #202 depend on and burning quota.
// These paths are a `sentry-wizard` re-run away from quietly coming back.

const REMOVED_PATHS = [
  'app/sentry-example-page/page.tsx',
  'app/sentry-example-page',
  'app/api/sentry-example-api/route.ts',
  'app/api/sentry-example-api',
]

describe('Sentry wizard example page and API route', () => {
  it.each(REMOVED_PATHS)('%s does not exist', (relativePath) => {
    const fullPath = path.join(__dirname, '..', relativePath)
    expect(fs.existsSync(fullPath)).toBe(false)
  })
})
