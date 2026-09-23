import { defineConfig, devices } from '@playwright/test'

/**
 * Issue #286. Runs against the deployed site (BASE_URL, default production),
 * never against a local dev server — see e2e/parent-flow.spec.ts for why.
 * Chromium only, one worker, no retries: this is meant to catch a broken
 * signed-out flow on production, not to be a flaky gate someone has to
 * re-run.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.BASE_URL || 'https://www.admitday.com',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
