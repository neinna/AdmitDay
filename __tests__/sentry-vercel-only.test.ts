/**
 * __tests__/sentry-vercel-only.test.ts
 *
 * Issue #371: sentry.server.config.ts, sentry.edge.config.ts and
 * instrumentation-client.ts each called Sentry.init() unconditionally, so the
 * coding agent's own VPS checkout — which deliberately has no secrets (#232)
 * and throws `Missing secretKey` in middleware on every run — reported those
 * throws into the production Sentry project (ADMITDAY-C).
 *
 * Each config now skips Sentry.init() unless it's running on Vercel
 * (VERCEL for server/edge, NEXT_PUBLIC_VERCEL_ENV for the client bundle,
 * since plain VERCEL isn't inlined into browser code). Requires each config
 * fresh per test via resetModules so the env var is read anew, with
 * @sentry/nextjs mocked so init is never really invoked.
 */

const mockInit = jest.fn()
const mockReplayIntegration = jest.fn()

jest.mock('@sentry/nextjs', () => ({
  init: (...args: unknown[]) => mockInit(...args),
  replayIntegration: (...args: unknown[]) => mockReplayIntegration(...args),
  captureRouterTransitionStart: jest.fn(),
}))

const ORIGINAL_ENV = process.env

beforeEach(() => {
  jest.resetModules()
  mockInit.mockClear()
  mockReplayIntegration.mockClear()
  process.env = { ...ORIGINAL_ENV }
  delete process.env.VERCEL
  delete process.env.VERCEL_ENV
  delete process.env.NEXT_PUBLIC_VERCEL_ENV
})

afterAll(() => {
  process.env = ORIGINAL_ENV
})

describe('Sentry only initializes on Vercel', () => {
  it.each([
    ['sentry.server.config.ts', '../sentry.server.config'],
    ['sentry.edge.config.ts', '../sentry.edge.config'],
  ])('%s does not call Sentry.init when VERCEL is unset', (_label, modulePath) => {
    require(modulePath)
    expect(mockInit).not.toHaveBeenCalled()
  })

  it.each([
    ['sentry.server.config.ts', '../sentry.server.config'],
    ['sentry.edge.config.ts', '../sentry.edge.config'],
  ])(
    '%s calls Sentry.init with environment "production" when VERCEL=1 and VERCEL_ENV=production',
    (_label, modulePath) => {
      process.env.VERCEL = '1'
      process.env.VERCEL_ENV = 'production'
      require(modulePath)
      expect(mockInit).toHaveBeenCalledWith(
        expect.objectContaining({ environment: 'production' }),
      )
    },
  )

  it('instrumentation-client.ts does not call Sentry.init when NEXT_PUBLIC_VERCEL_ENV is unset', () => {
    require('../instrumentation-client')
    expect(mockInit).not.toHaveBeenCalled()
  })

  it('instrumentation-client.ts calls Sentry.init with environment "production" when NEXT_PUBLIC_VERCEL_ENV=production', () => {
    process.env.NEXT_PUBLIC_VERCEL_ENV = 'production'
    require('../instrumentation-client')
    expect(mockInit).toHaveBeenCalledWith(
      expect.objectContaining({ environment: 'production' }),
    )
  })
})
