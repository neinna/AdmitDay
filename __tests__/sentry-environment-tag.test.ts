import * as fs from 'fs'
import * as path from 'path'

// ── Sentry events must be tagged with the deployment environment ───────────
// Issue #338: none of the three Sentry.init calls set `environment`, so the
// SDK falls back to NODE_ENV — which Vercel sets to "production" for preview
// deploys too. That made a production error and a preview error
// indistinguishable in the dashboard. Source-level, because importing the
// configs would call Sentry.init() in the test process.

const CONFIGS = [
  'instrumentation-client.ts',
  'sentry.server.config.ts',
  'sentry.edge.config.ts',
]

describe('Sentry environment tagging', () => {
  it.each(CONFIGS)('%s passes environment to Sentry.init', (file) => {
    const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
    expect(source).toContain(
      'environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV',
    )
  })
})
