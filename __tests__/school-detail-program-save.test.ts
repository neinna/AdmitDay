/**
 * Issue #614: the school page saves programs. The repo's jest setup is
 * node-only (no DOM), so the component is covered with source-text checks,
 * like the other SchoolDetailClient tests.
 */
import fs from 'fs'
import path from 'path'

const src = fs.readFileSync(
  path.join(__dirname, '..', 'app/school/[dbn]/SchoolDetailClient.tsx'),
  'utf8'
)
const start = src.indexOf('async function toggleAdded')
const body = src.slice(start, src.indexOf('const doeSchoolUrl'))

describe('SchoolDetailClient — per-program save', () => {
  it('sends program_code in the POST body and in the DELETE body', () => {
    expect(body).toContain("method: adding ? 'POST' : 'DELETE'")
    expect(body).toContain('{ dbn: school.dbn, program_code: code } : { program_code: code }')
    expect(body).toContain("fetch('/api/saved-programs'")
  })

  it('checks res.ok and rolls back to the previous array with an error code on failure', () => {
    expect(body).toContain('ok = res.ok')
    const failure = body.slice(body.indexOf('if (!ok)'))
    expect(failure.indexOf('setSavedPrograms(previous)')).toBeGreaterThan(-1)
    expect(failure.indexOf('setSaveErrorCodes')).toBeGreaterThan(-1)
    // the failure branch returns before analytics is captured
    expect(failure.indexOf('return')).toBeLessThan(failure.indexOf('posthog?.capture'))
  })

  it('shows the error text on the row and gives each coded row its own Add button', () => {
    expect(src).toContain('saveErrorCodes.has(p.code)')
    expect(src).toContain('Couldn&rsquo;t save — try again.')
    expect(src).toContain('aria-label={`${added ? \'Remove\' : \'Add\'} ${p.name}`}')
    expect(src).not.toContain('Add to list')
  })
})
