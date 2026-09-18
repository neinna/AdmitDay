import * as fs from 'fs'
import * as path from 'path'

/**
 * __tests__/account-delete-ui.test.ts
 *
 * Issue #241 (part of #179) — the account menu entry point, the /account/delete
 * gate, and its confirmation copy. Follows __tests__/saved-lists-gate.test.ts's
 * convention of source-text assertions for these .tsx files, since executable
 * behavior of the delete call itself is covered by
 * __tests__/account-api.test.ts and __tests__/account-delete-cascade.test.ts.
 */

function readSource(relPath: string): string {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf-8')
}

describe('AuthControls has a Delete account menu item (issue #241)', () => {
  const src = readSource('components/AuthControls.tsx')

  it('links to /account/delete from inside UserButton.MenuItems', () => {
    const menuItemsIdx = src.indexOf('<UserButton.MenuItems>')
    const linkIdx = src.indexOf('href="/account/delete"')
    expect(menuItemsIdx).toBeGreaterThan(-1)
    expect(linkIdx).toBeGreaterThan(menuItemsIdx)
  })

  it('labels the item "Delete account"', () => {
    expect(src).toContain('Delete account')
  })
})

describe('/account/delete gates on the session before rendering (issue #241)', () => {
  const src = readSource('app/account/delete/page.tsx')

  it('stays a server component', () => {
    expect(src).not.toMatch(/^['"]use client['"]/m)
  })

  it("imports auth from Clerk's server entrypoint", () => {
    expect(src).toContain("import { auth } from '@clerk/nextjs/server'")
  })

  it('redirects signed-out visitors to / before rendering the confirmation UI', () => {
    const authIdx = src.indexOf('await auth()')
    const redirectIdx = src.indexOf("redirect('/')")
    const renderIdx = src.indexOf('<AccountDeleteClient')
    expect(authIdx).toBeGreaterThan(-1)
    expect(redirectIdx).toBeGreaterThan(authIdx)
    expect(renderIdx).toBeGreaterThan(redirectIdx)
  })
})

describe('AccountDeleteClient shows the required confirmation copy and calls the API (issue #241)', () => {
  const src = readSource('app/account/delete/AccountDeleteClient.tsx')

  it('is a client component', () => {
    expect(src).toMatch(/^['"]use client['"]/m)
  })

  it('shows the exact confirmation heading and body from the issue', () => {
    expect(src).toContain('Delete your account?')
    expect(src.replace(/\s+/g, ' ')).toContain(
      "This permanently deletes your AdmitDay account: your name, email, sign-in, and every saved school. It can"
    )
  })

  it('offers a delete action and a cancel action', () => {
    expect(src).toContain('Delete my account')
    expect(src).toContain('Cancel')
  })

  it('calls DELETE /api/account, then signs out and redirects home only after it succeeds', () => {
    const fetchIdx = src.indexOf("fetch('/api/account'")
    const methodIdx = src.indexOf("method: 'DELETE'")
    const signOutIdx = src.indexOf('await signOut()')
    const pushIdx = src.indexOf("router.push('/')")
    expect(fetchIdx).toBeGreaterThan(-1)
    expect(methodIdx).toBeGreaterThan(fetchIdx)
    expect(signOutIdx).toBeGreaterThan(methodIdx)
    expect(pushIdx).toBeGreaterThan(signOutIdx)
  })

  it("uses Clerk's useClerk hook to sign out, not a raw fetch to a sign-out endpoint", () => {
    expect(src).toContain("import { useClerk } from '@clerk/nextjs'")
  })
})

describe('/privacy documents self-serve deletion instead of the email-us process (issue #241)', () => {
  const src = readSource('app/privacy/page.tsx')

  it('no longer promises manual deletion within 30 days', () => {
    expect(src).not.toMatch(/coming soon/i)
    expect(src).not.toMatch(/within 30 days/i)
  })

  it('says deletion happens from the account menu, right away', () => {
    expect(src).toMatch(/account menu/i)
    expect(src).toMatch(/right away/i)
  })
})
