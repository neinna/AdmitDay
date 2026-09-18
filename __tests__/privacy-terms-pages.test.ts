import fs from 'fs'
import path from 'path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// Issue #199 put AuthControls (which uses Clerk's SignedIn/SignedOut) in the
// header on every page, including /privacy and /terms. Clerk's components
// throw when rendered outside a <ClerkProvider>, and this file renders the
// pages standalone with renderToStaticMarkup, so @clerk/nextjs is mocked
// with plain stand-ins rather than excluding these two pages from the header.
jest.mock('@clerk/nextjs', () => {
  const UserButton = () => null
  // Issue #241 added a <UserButton.MenuItems>/<UserButton.Link> child to
  // AuthControls's <SignedIn> branch. That branch isn't reachable here
  // (SignedIn renders null in this mock), but React still evaluates the JSX
  // tree passed as children, so these sub-components must exist even though
  // they're never called.
  UserButton.MenuItems = ({ children }: { children: React.ReactNode }) => children
  UserButton.Link = () => null
  return {
    ClerkLoaded: ({ children }: { children: React.ReactNode }) => children,
    SignedIn: () => null,
    SignedOut: ({ children }: { children: React.ReactNode }) => children,
    SignInButton: ({ children }: { children: React.ReactNode }) => children,
    SignUpButton: ({ children }: { children: React.ReactNode }) => children,
    UserButton,
  }
})

import PrivacyPage from '@/app/privacy/page'
import TermsPage from '@/app/terms/page'

// ── Issue #198: Publish /privacy and /terms before accounts collect anything ──
//
// Both pages are plain server components with no data fetching, so rendering
// them with react-dom/server is the direct equivalent of "the route returns
// 200": if either page threw during render, Next.js would serve a 500 in
// production. This also proves both pages are reachable with JS disabled —
// there is no 'use client' directive and no client-only hook gating content.

const footerSource = fs.readFileSync(path.join(__dirname, '../components/Footer.tsx'), 'utf-8')
const privacySource = fs.readFileSync(path.join(__dirname, '../app/privacy/page.tsx'), 'utf-8')
const termsSource = fs.readFileSync(path.join(__dirname, '../app/terms/page.tsx'), 'utf-8')
/** JSX wraps copy across lines, so sentence-spanning assertions read this. */
const termsCopy = termsSource.replace(/\s+/g, ' ')

describe('/privacy and /terms render', () => {
  it('/privacy renders without throwing (route returns 200)', () => {
    const html = renderToStaticMarkup(React.createElement(PrivacyPage))
    expect(html).toContain('Privacy')
    expect(html.length).toBeGreaterThan(0)
  })

  it('/terms renders without throwing (route returns 200)', () => {
    const html = renderToStaticMarkup(React.createElement(TermsPage))
    expect(html).toContain('Terms')
    expect(html.length).toBeGreaterThan(0)
  })

  it('both pages are server components, reachable with JS disabled', () => {
    expect(privacySource).not.toMatch(/^['"]use client['"]/m)
    expect(termsSource).not.toMatch(/^['"]use client['"]/m)
  })
})

describe('Footer links to /privacy and /terms sitewide', () => {
  it('links to /privacy', () => {
    expect(footerSource).toContain('href="/privacy"')
  })

  it('links to /terms', () => {
    expect(footerSource).toContain('href="/terms"')
  })

  it('renders both links in the footer markup', () => {
    const html = renderToStaticMarkup(React.createElement(require('@/components/Footer').default))
    expect(html).toContain('href="/privacy"')
    expect(html).toContain('href="/terms"')
  })
})

describe('/privacy content matches the product as it actually exists', () => {
  it('states that no information about a child is ever collected', () => {
    expect(privacySource).toMatch(/no name, no grade, no date of birth, no contact details, no documents/i)
  })

  it('names only sub-processors this repo actually calls', () => {
    // Every service named here must appear as a real dependency/integration
    // elsewhere in the codebase — a listed processor that isn't wired up is
    // worse than an unlisted one that is.
    expect(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf-8')).toMatch(/@vercel\/postgres/)
    expect(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf-8')).toMatch(/@anthropic-ai\/sdk/)
    expect(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf-8')).toMatch(/"openai"/)
    expect(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf-8')).toMatch(/@sentry\/nextjs/)
    expect(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf-8')).toMatch(/posthog-js/)
  })

  it('names Langfuse, because the deployed app traces AI requests to it (lib/trace.ts, #194)', () => {
    const trace = fs.readFileSync(path.join(__dirname, '../lib/trace.ts'), 'utf-8')
    expect(trace).toMatch(/LANGFUSE_APP_/)
    expect(privacySource).toMatch(/label: 'Langfuse'/)
  })

  it('says saved lists are stored with the account and require one (#240)', () => {
    expect(privacySource).toMatch(/Saved to your account in AdmitDay's database/)
    expect(privacySource).toMatch(/Saving a school requires an account/)
  })

  it('describes accounts and names Clerk, because @clerk/nextjs ships in the app (#199)', () => {
    const pkg = fs.readFileSync(path.join(__dirname, '../package.json'), 'utf-8')
    expect(pkg).toContain('"@clerk/nextjs"')
    expect(privacySource).toMatch(/label: 'Clerk'/)
    expect(privacySource).not.toMatch(/not collected today/i)
  })

  it('discloses the IP address stored by the Postgres rate limiter (lib/rate-limit.ts)', () => {
    const rl = fs.readFileSync(path.join(__dirname, '../lib/rate-limit.ts'), 'utf-8')
    expect(rl).toMatch(/ip:\$\{ip\}/)
    expect(privacySource).toMatch(/label: 'IP address'/)
  })

  it('promises automatic deletion of IP rate-limit rows within 24 hours (issue #233)', () => {
    expect(privacySource).toMatch(/deleted automatically within 24 hours/i)
    expect(privacySource).not.toMatch(/is on the way/i)
  })

  it('the Sentry claim matches sendDefaultPii in every runtime config, not just the server one', () => {
    // A prior draft claimed IP addresses were stripped everywhere, but only
    // sentry.server.config.ts sets sendDefaultPii: false — the browser and
    // edge configs still default to sendDefaultPii: true (see issue #21 and
    // the sentry-pii.test.ts suite tracking the standalone fix for that gap).
    // This guards against re-publishing the blanket claim before the gap
    // actually closes, and against the copy going stale once it does.
    const serverConfig = fs.readFileSync(path.join(__dirname, '../sentry.server.config.ts'), 'utf-8')
    const clientConfig = fs.readFileSync(path.join(__dirname, '../instrumentation-client.ts'), 'utf-8')
    const edgeConfig = fs.readFileSync(path.join(__dirname, '../sentry.edge.config.ts'), 'utf-8')

    const serverStripsPii = serverConfig.includes('sendDefaultPii: false')
    const clientStripsPii = clientConfig.includes('sendDefaultPii: false')
    const edgeStripsPii = edgeConfig.includes('sendDefaultPii: false')

    if (serverStripsPii && clientStripsPii && edgeStripsPii) {
      // The gap has closed — the page must not still describe an asymmetry
      // that no longer exists.
      expect(privacySource).not.toMatch(/currently include/i)
    } else {
      // The gap is still open somewhere — the page must say so rather than
      // claiming a blanket strip that isn't true everywhere.
      expect(privacySource).not.toMatch(/strip(s|ped)? ip addresses? (and|or) session-replay content before anything is sent/i)
      expect(privacySource).toMatch(/currently include/i)
    }
  })
})

describe('/privacy and /terms headers carry AuthControls (issue #199 — every page)', () => {
  const privacySource = fs.readFileSync(path.join(__dirname, '../app/privacy/page.tsx'), 'utf-8')
  const termsSource = fs.readFileSync(path.join(__dirname, '../app/terms/page.tsx'), 'utf-8')

  it('/privacy imports and renders AuthControls', () => {
    expect(privacySource).toContain("import AuthControls from '@/components/AuthControls'")
    expect(privacySource).toContain('<AuthControls />')
  })

  it('/terms imports and renders AuthControls', () => {
    expect(termsSource).toContain("import AuthControls from '@/components/AuthControls'")
    expect(termsSource).toContain('<AuthControls />')
  })

  it('/privacy still renders without throwing with AuthControls in the header', () => {
    const html = renderToStaticMarkup(React.createElement(PrivacyPage))
    expect(html).toContain('Privacy')
  })

  it('/terms still renders without throwing with AuthControls in the header', () => {
    const html = renderToStaticMarkup(React.createElement(TermsPage))
    expect(html).toContain('Terms')
  })
})

describe('/terms content matches product policy', () => {
  it('states AdmitDay does not predict admissions outcomes', () => {
    expect(termsCopy).toMatch(/does not estimate, score, or predict whether your child will be admitted/i)
  })

  it('uses no admissions-odds language of its own', () => {
    const { findBannedPhrases } = require('@/lib/banned-phrases')
    expect(findBannedPhrases(termsSource)).toEqual([])
  })

  it('states AdmitDay is not affiliated with or endorsed by the DOE', () => {
    expect(termsCopy).toMatch(/not affiliated with, sponsored by, or endorsed by the New York City Department of Education/i)
  })

  it('tells families to confirm requirements and deadlines in MySchools', () => {
    expect(termsSource).toMatch(/confirm every requirement and deadline/i)
    expect(termsSource).toContain('https://www.myschools.nyc')
  })

  it('says AdmitDay copy is not authoritative', () => {
    expect(termsSource).toMatch(/not authoritative/i)
  })

  it('admits DOE data can be out of date between refreshes', () => {
    expect(termsSource).toMatch(/out of date/i)
  })
})
