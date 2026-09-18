import * as fs from 'fs'
import * as path from 'path'

/**
 * __tests__/pending-save-sync.test.ts
 *
 * Issue #240 — saving a school requires an account. A signed-out Save stashes
 * the clicked DBN in sessionStorage and opens Clerk's sign-up modal (covered
 * by the FindClient/SchoolDetailClient cases in saved-lists-gate.test.ts).
 * This file covers the other half: the component in the root layout that
 * posts the pending DBN once an account exists.
 *
 * Like the rest of this repo's .tsx coverage (see saved-lists-gate.test.ts),
 * these are source-text assertions rather than rendered-component tests —
 * there's no jsdom/testing-library in this project's jest setup.
 */

function readSource(relPath: string): string {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf-8')
}

const src = readSource('components/PendingSaveSync.tsx')

describe('components/PendingSaveSync.tsx', () => {
  it('is a client component', () => {
    expect(src).toMatch(/^['"]use client['"]/m)
  })

  it('exports the shared pending-save sessionStorage key', () => {
    expect(src).toContain("export const PENDING_SAVE_KEY = 'admitday:pendingSave'")
  })

  it('watches isSignedIn via useAuth from @clerk/nextjs', () => {
    expect(src).toContain("import { useAuth } from '@clerk/nextjs'")
    expect(src).toContain('isSignedIn')
  })

  it('reads the pending dbn from sessionStorage and posts it to /api/saved-schools', () => {
    expect(src).toContain('sessionStorage.getItem(PENDING_SAVE_KEY)')
    expect(src).toContain("fetch('/api/saved-schools'")
    expect(src).toContain("method: 'POST'")
    expect(src).toContain('body: JSON.stringify({ dbn })')
  })

  it('clears the key only after a successful save, so a failed POST is retried on the next load', () => {
    const postIdx = src.indexOf("fetch('/api/saved-schools'")
    const removeIdx = src.indexOf('sessionStorage.removeItem(PENDING_SAVE_KEY)')
    const okCheckIdx = src.indexOf('res.ok')
    const catchIdx = src.indexOf('.catch(')

    expect(postIdx).toBeGreaterThan(-1)
    expect(removeIdx).toBeGreaterThan(postIdx)
    // The removeItem call sits after the res.ok guard, not in the catch
    // handler — a failed request never clears the key.
    expect(okCheckIdx).toBeGreaterThan(postIdx)
    expect(removeIdx).toBeGreaterThan(okCheckIdx)
    expect(catchIdx).toBeGreaterThan(removeIdx)

    const catchBlock = src.slice(catchIdx)
    expect(catchBlock).not.toContain('removeItem')
  })

  it('renders nothing', () => {
    expect(src).toMatch(/return null/)
  })
})

describe('app/layout.tsx wires PendingSaveSync in next to AuthPosthogSync (issue #240)', () => {
  const layoutSrc = readSource('app/layout.tsx')

  it('imports PendingSaveSync', () => {
    expect(layoutSrc).toContain("import PendingSaveSync from '@/components/PendingSaveSync'")
  })

  it('renders it alongside AuthPosthogSync inside PHProvider', () => {
    expect(layoutSrc).toContain('<AuthPosthogSync />')
    expect(layoutSrc).toContain('<PendingSaveSync />')
  })
})
