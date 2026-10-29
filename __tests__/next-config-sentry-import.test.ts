// @sentry/nextjs v11 only exports withSentryConfig from "@sentry/nextjs/config" (#572).
describe('next.config.js Sentry import', () => {
  it('resolves withSentryConfig from @sentry/nextjs/config', () => {
    const { withSentryConfig } = require('@sentry/nextjs/config')
    expect(typeof withSentryConfig).toBe('function')
  })

  it('loads next.config.js without error', () => {
    expect(() => require('../next.config.js')).not.toThrow()
  })
})
