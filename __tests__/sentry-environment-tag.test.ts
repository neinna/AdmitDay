import * as fs from 'fs'
import * as path from 'path'

// ── Sentry events must be tagged with the deployment environment ───────────
// Issue #338: none of the three Sentry.init calls set `environment`, so the
// SDK falls back to NODE_ENV — which Vercel sets to "production" for preview
// deploys too. That made a production error and a preview error
// indistinguishable in the dashboard. Source-level, because importing the
// configs would call Sentry.init() in the test process.

// Next.js only inlines NEXT_PUBLIC_* vars (and NODE_ENV) into the browser
// bundle, so the client config must read NEXT_PUBLIC_VERCEL_ENV rather than
// VERCEL_ENV, which is server/edge-only.
const SERVER_CONFIGS = ['sentry.server.config.ts', 'sentry.edge.config.ts']

describe('Sentry environment tagging', () => {
  it.each(SERVER_CONFIGS)('%s passes environment to Sentry.init', (file) => {
    const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
    expect(source).toContain(
      'environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV',
    )
  })

  it('instrumentation-client.ts passes environment to Sentry.init using NEXT_PUBLIC_VERCEL_ENV', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'instrumentation-client.ts'),
      'utf8',
    )
    expect(source).toContain(
      'environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV',
    )
  })
})
