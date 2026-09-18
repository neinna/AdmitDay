import * as fs from 'fs'
import * as path from 'path'

// ── Sentry must never ship PII ───────────────────────────────────────────────
// AdmitDay is used by parents applying on behalf of minors, and accounts (#179)
// put real names and emails into the browser session. `sendDefaultPii: true`
// attaches IP addresses and user context to every event; session replay records
// the screen. Neither is worth a third-party store of family data, and both are
// a one-word edit away from being switched back on — which is what these tests
// exist to catch. Source-level, because importing the configs would call
// Sentry.init() in the test process.

const CONFIGS = [
  'instrumentation-client.ts',
  'sentry.server.config.ts',
  'sentry.edge.config.ts',
]

describe('Sentry privacy configuration', () => {
  it.each(CONFIGS)('%s does not send default PII', (file) => {
    const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
    expect(source).toContain('sendDefaultPii: false')
    expect(source).not.toContain('sendDefaultPii: true')
  })

  it('session replay masks all text, inputs, and media', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../instrumentation-client.ts'),
      'utf8',
    )
    expect(source).toContain('maskAllText: true')
    expect(source).toContain('maskAllInputs: true')
    expect(source).toContain('blockAllMedia: true')
  })
})
