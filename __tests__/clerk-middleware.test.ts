import * as fs from 'fs'
import * as path from 'path'

// Issue #199: Clerk middleware is wired in but protects nothing.
describe('middleware.ts (Clerk)', () => {
  const source = fs.readFileSync(path.join(__dirname, '../middleware.ts'), 'utf8')

  it('uses clerkMiddleware with no route protection', () => {
    expect(source).toContain('export default clerkMiddleware()')
    expect(source).not.toMatch(/protect\(|createRouteMatcher/)
  })

  it('keeps the Sentry /monitoring tunnel out of middleware', () => {
    expect(source).toContain('(?!_next|monitoring|')
  })

  it('runs on API routes', () => {
    expect(source).toContain("'/(api|trpc)(.*)'")
  })
})

// Hydration: the header controls render only after Clerk loads, so the
// server HTML and the browser's first render match on prerendered pages.
describe('AuthControls hydration guard', () => {
  const src = fs.readFileSync(path.join(__dirname, '../components/AuthControls.tsx'), 'utf8')

  it('wraps the signed-in and signed-out controls in <ClerkLoaded>', () => {
    const open = src.indexOf('<ClerkLoaded>')
    const close = src.indexOf('</ClerkLoaded>')
    expect(open).toBeGreaterThan(-1)
    expect(src.indexOf('<SignedOut>')).toBeGreaterThan(open)
    expect(src.indexOf('</SignedIn>')).toBeLessThan(close)
  })
})
