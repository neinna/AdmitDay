import * as fs from 'fs'
import * as path from 'path'

/**
 * __tests__/next-config-clerk-key-fallback.test.ts
 *
 * Issue #200 uncovered a latent #199 build defect: <ClerkProvider> (wired
 * app-wide in #199) throws synchronously during `next build`'s static
 * prerender step whenever NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is unset — which
 * failed the build for every page, not just the ones #200 touched. Fixed in
 * next.config.js with a fallback that only ever applies when the real env
 * var (always present on Vercel) is absent.
 */
const src = fs.readFileSync(path.join(__dirname, '../next.config.js'), 'utf-8')

describe('next.config.js — Clerk publishable key build fallback', () => {
  it('only fills in the key when it is unset, never overriding a real one', () => {
    expect(src).toContain('process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||=')
  })

  it('uses a syntactically valid pk_test_ key so Clerk\'s format check passes', () => {
    const match = src.match(/NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY\s*\|\|=\s*'([^']+)'/)
    expect(match).not.toBeNull()
    const key = match![1]
    expect(key).toMatch(/^pk_test_/)
    const decoded = Buffer.from(key.slice('pk_test_'.length), 'base64').toString('utf-8')
    // Mirrors @clerk/shared's isValidDecodedPublishableKey: a single
    // trailing '$' and at least one '.' before it.
    expect(decoded.endsWith('$')).toBe(true)
    expect(decoded.slice(0, -1).includes('$')).toBe(false)
    expect(decoded.slice(0, -1).includes('.')).toBe(true)
  })

  it('runs before nextConfig is defined, so the fallback is set before Next reads env', () => {
    const fallbackIdx = src.indexOf('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||=')
    const nextConfigIdx = src.indexOf('const nextConfig')
    expect(fallbackIdx).toBeGreaterThan(-1)
    expect(nextConfigIdx).toBeGreaterThan(fallbackIdx)
  })
})

describe('placeholder Clerk key is never used on Vercel', () => {
  it('only applies when VERCEL is unset, so a missing real key fails the Vercel build', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, '../next.config.js'), 'utf8')
    expect(src).toMatch(/if \(!process\.env\.VERCEL\) \{\s*process\.env\.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY \|\|=/)
  })
})
