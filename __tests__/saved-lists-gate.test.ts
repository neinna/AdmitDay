import * as fs from 'fs'
import * as path from 'path'

/**
 * __tests__/saved-lists-gate.test.ts
 *
 * Issue #200 — saved lists move from localStorage to Postgres behind the
 * session from #199. This repo's .tsx tests are source-text assertions (see
 * __tests__/auth-header.test.ts) rather than rendered-component tests, so
 * these follow the same convention; the executable behavior of the new
 * lib/saved-lists-db.ts and app/api/saved-schools/** routes is covered by
 * __tests__/saved-lists-db.test.ts and __tests__/saved-schools-api.test.ts.
 */

function readSource(relPath: string): string {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf-8')
}

describe('/my-schools is gated server-side (issue #200)', () => {
  const src = readSource('app/my-schools/page.tsx')

  it('stays a server component', () => {
    expect(src).not.toMatch(/^['"]use client['"]/m)
  })

  it('checks the session with auth() and redirects before fetching any school or list data', () => {
    const authIdx = src.indexOf('await auth()')
    const redirectIdx = src.indexOf("redirect('/')")
    const getAllSchoolsIdx = src.indexOf('await getAllSchools()')
    const getSavedDbnsIdx = src.indexOf('getSavedDbns(')

    expect(authIdx).toBeGreaterThan(-1)
    expect(redirectIdx).toBeGreaterThan(authIdx)
    // The redirect is guarded by `if (!userId)` and both data fetches happen
    // strictly after it in source order, matching the early-return control
    // flow — a signed-out request never reaches either fetch.
    expect(getAllSchoolsIdx).toBeGreaterThan(redirectIdx)
    expect(getSavedDbnsIdx).toBeGreaterThan(redirectIdx)
  })

  it("imports auth from Clerk's server entrypoint, not the client one", () => {
    expect(src).toContain("import { auth } from '@clerk/nextjs/server'")
  })

  it('resolves saved dbns by the session-derived parentId, not a client-supplied id', () => {
    expect(src).toContain('findParentId(userId)')
    expect(src).toContain('getSavedDbns(parentId)')
  })
})

describe('MySchoolsClient reads its list from server-provided props, not localStorage (issue #200)', () => {
  const src = readSource('app/my-schools/MySchoolsClient.tsx')

  it('takes initialOrder as a prop instead of reading a localStorage order key', () => {
    expect(src).toContain('initialOrder')
    expect(src).not.toMatch(/admitday_my_schools_order/)
  })

  it('persists reorder and remove through the saved-schools API rather than localStorage', () => {
    expect(src).toContain("fetch('/api/saved-schools'")
    expect(src).toContain("method: 'PUT'")
    expect(src).toContain("method: 'DELETE'")
    expect(src).not.toMatch(/localStorage\.setItem/)
  })
})

describe('FindClient and SchoolDetailClient branch on sign-in state for saves (issue #200)', () => {
  const findSrc = readSource('app/find/FindClient.tsx')
  const detailSrc = readSource('app/school/[dbn]/SchoolDetailClient.tsx')

  it.each([
    ['FindClient', findSrc],
    ['SchoolDetailClient', detailSrc],
  ])('%s uses useAuth from @clerk/nextjs to branch signed-in saves to Postgres', (_name, src) => {
    expect(src).toContain("import { useAuth } from '@clerk/nextjs'")
    expect(src).toContain('isSignedIn')
    expect(src).toContain("fetch('/api/saved-schools'")
  })

  it.each([
    ['FindClient', findSrc],
    ['SchoolDetailClient', detailSrc],
  ])('%s still falls back to ADDED_SCHOOLS_KEY localStorage when signed out — unchanged', (_name, src) => {
    expect(src).toContain('ADDED_SCHOOLS_KEY')
    expect(src).toContain('localStorage.setItem(ADDED_SCHOOLS_KEY')
    expect(src).toContain('localStorage.getItem(ADDED_SCHOOLS_KEY')
  })
})
