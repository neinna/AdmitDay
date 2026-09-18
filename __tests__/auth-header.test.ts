import * as fs from 'fs'
import * as path from 'path'

/**
 * Issue #199 — Auth 1/3: Clerk sign up, log in, log out, password reset.
 *
 * This repo's jest config runs in the `node` environment with no jsdom/
 * testing-library, and no existing component test renders a .tsx module
 * directly (see posthog-funnel-instrumentation.test.ts) — every test here
 * follows that same source-text convention.
 */

function readSource(relPath: string): string {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf-8')
}

const HEADER_FILES = [
  'app/page.tsx',
  'app/find/FindClient.tsx',
  'app/school/[dbn]/SiteHeader.tsx',
  'app/my-schools/MySchoolsClient.tsx',
  'app/privacy/page.tsx',
  'app/terms/page.tsx',
]

// ── AuthControls: signed-out and signed-in states ───────────────────────────

describe('components/AuthControls — signed-out and signed-in states (issue #199)', () => {
  const src = readSource('components/AuthControls.tsx')

  it('is a client component', () => {
    expect(src).toMatch(/^['"]use client['"]/m)
  })

  it('renders Log in and Sign up as modal buttons when signed out', () => {
    expect(src).toContain('<SignedOut>')
    expect(src).toContain('<SignInButton mode="modal">')
    expect(src).toContain('Log in')
    expect(src).toContain('<SignUpButton mode="modal">')
    expect(src).toContain('Sign up')
  })

  it('renders the signed-in user with a UserButton menu (name + log out)', () => {
    expect(src).toContain('<SignedIn>')
    expect(src).toContain('<UserButton')
    expect(src).toContain('showName')
  })

  it('overrides Clerk default styling to radius 0 and no shadow', () => {
    expect(src).toMatch(/rounded-none/)
    expect(src).toMatch(/shadow-none/)
  })
})

// ── AuthControls wired into the header on every page ────────────────────────

describe('AuthControls is wired into the header on every page (issue #199)', () => {
  it.each(HEADER_FILES)('%s imports and renders AuthControls', (file) => {
    const src = readSource(file)
    expect(src).toContain("import AuthControls from '@/components/AuthControls'")
    expect(src).toContain('<AuthControls />')
  })
})

// ── No route gating — the anonymous path is unchanged ───────────────────────

describe('No route gating (issue #199)', () => {
  it('middleware.ts wires Clerk but protects no route — route gating is out of scope for this slice (see clerk-middleware.test.ts)', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'middleware.ts'), 'utf8')
    expect(source).toContain('clerkMiddleware()')
    expect(source).not.toMatch(/protect\(|createRouteMatcher/)
  })
})

// ── ClerkProvider wired into the root layout ────────────────────────────────

describe('app/layout.tsx — ClerkProvider wraps the app (issue #199)', () => {
  const src = readSource('app/layout.tsx')

  it('imports ClerkProvider from @clerk/nextjs', () => {
    expect(src).toContain("import { ClerkProvider } from '@clerk/nextjs'")
  })

  it('wraps the html tree in ClerkProvider', () => {
    const providerIndex = src.indexOf('<ClerkProvider')
    const htmlIndex = src.indexOf('<html')
    expect(providerIndex).toBeGreaterThan(-1)
    expect(htmlIndex).toBeGreaterThan(providerIndex)
  })

  it('renders AuthPosthogSync so identify/reset stay wired app-wide', () => {
    expect(src).toContain('<AuthPosthogSync />')
  })

  it('overrides Clerk default appearance to the design system (radius 0, no shadow)', () => {
    expect(src).toMatch(/borderRadius:\s*'0px'/)
    expect(src).toMatch(/rounded-none/)
    expect(src).toMatch(/shadow-none/)
  })
})

// ── PostHog identify on sign-in / reset on sign-out ─────────────────────────

describe('components/AuthPosthogSync — per-person PostHog after sign-in (issue #199)', () => {
  const src = readSource('components/AuthPosthogSync.tsx')

  it('is a client component', () => {
    expect(src).toMatch(/^['"]use client['"]/m)
  })

  it('guards on NEXT_PUBLIC_POSTHOG_KEY being present', () => {
    expect(src).toContain('process.env.NEXT_PUBLIC_POSTHOG_KEY')
  })

  it('calls posthog.identify with only the stable Clerk user id, no email or name', () => {
    const idx = src.indexOf('posthog.identify(')
    expect(idx).toBeGreaterThan(-1)
    const block = src.slice(idx, idx + 40)
    expect(block).toContain('user.id')
    expect(block).not.toMatch(/email/i)
    expect(block).not.toMatch(/name/i)
  })

  it('calls posthog.reset() on sign-out', () => {
    expect(src).toContain('posthog.reset()')
  })

  it('never sends PII (email, name, or child data) in any posthog call', () => {
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(code).not.toMatch(/email/i)
    expect(code).not.toMatch(/firstName|lastName/)
    expect(code).not.toMatch(/child/i)
  })
})

// ── Sign up collects only first name, last name, and email ─────────────────

describe('No phone collection anywhere in the auth wiring (issue #199)', () => {
  it('AuthControls and layout never reference a phone field', () => {
    const files = ['components/AuthControls.tsx', 'app/layout.tsx', 'components/AuthPosthogSync.tsx']
    for (const file of files) {
      expect(readSource(file)).not.toMatch(/phone/i)
    }
  })
})
