import fs from 'fs'
import path from 'path'

// ── Issue #176: outcome of each scheduled VPS run ──────────────────────────
// - data changed and valid -> a data PR whose body reports school count,
//   added/removed DBNs, program-count change, and fetched_at
// - no change -> no PR, log only
// - validation/scrape failure -> open or update the single "Data refresh
//   failed" GitHub issue, never a silent log line
// Static source checks only, matching the existing vps-data-refresh-script
// test style -- no network calls, does not execute the script.

const scriptPath = path.join(__dirname, '../scripts/vps-data-refresh.sh')
const scriptSource = fs.readFileSync(scriptPath, 'utf-8')

function bodyOfFunction(name: string): string {
  const start = scriptSource.indexOf(`${name}() {`)
  const end = scriptSource.indexOf('\n}', start)
  expect(start).toBeGreaterThan(-1)
  return scriptSource.slice(start, end)
}

describe('scripts/vps-data-refresh.sh: PR body on a changed, valid scrape', () => {
  it('builds the PR body from a helper that reports the required fields', () => {
    const body = bodyOfFunction('build_refresh_pr_body')
    expect(body).toContain('School count:')
    expect(body).toContain('Added DBNs:')
    expect(body).toContain('Removed DBNs:')
    expect(body).toContain('Program count:')
    expect(body).toContain('Fetched at:')
  })

  it('uses the helper to build the PR body it creates or edits', () => {
    const body = bodyOfFunction('open_refresh_pr')
    expect(body).toContain('build_refresh_pr_body')
    expect(body).toContain('gh pr create')
  })

  // Issue #255: schools excluded for having no programs in this cycle's
  // MySchools admissions are called out in the PR body, separate from the
  // generic Removed DBNs list.
  it('reports excluded DBNs separately from Removed DBNs', () => {
    const body = bodyOfFunction('build_refresh_pr_body')
    expect(body).toContain('Excluded DBNs')
    expect(body).toContain('schools.excluded.json')
    const removedIdx = body.indexOf('Removed DBNs:')
    const excludedIdx = body.indexOf('Excluded DBNs')
    expect(removedIdx).toBeGreaterThan(-1)
    expect(excludedIdx).toBeGreaterThan(removedIdx)
  })
})

describe('scripts/vps-data-refresh.sh: no change means no PR', () => {
  it('returns before creating a PR when there is no diff to commit', () => {
    const body = bodyOfFunction('open_refresh_pr')
    const noDiffIdx = body.indexOf('No tracked data changes to commit.')
    const returnIdx = body.indexOf('return 0', noDiffIdx)
    const prCreateIdx = body.indexOf('gh pr create')
    expect(noDiffIdx).toBeGreaterThan(-1)
    expect(returnIdx).toBeGreaterThan(noDiffIdx)
    expect(returnIdx).toBeLessThan(prCreateIdx)
  })
})

describe('scripts/vps-data-refresh.sh: scrape/validation failure opens or updates an issue', () => {
  it('never lets a refresh:data failure fall through to a silent log line', () => {
    const body = bodyOfFunction('open_refresh_pr')
    const runIdx = body.indexOf('npm run refresh:data')
    const reportIdx = body.indexOf('report_refresh_failure', runIdx)
    const exitIdx = body.indexOf('exit 1', reportIdx)
    expect(runIdx).toBeGreaterThan(-1)
    expect(reportIdx).toBeGreaterThan(runIdx)
    expect(exitIdx).toBeGreaterThan(reportIdx)
  })

  it('titles the issue "Data refresh failed"', () => {
    const body = bodyOfFunction('report_refresh_failure')
    expect(body).toContain('Data refresh failed')
  })

  it('comments on an existing open issue instead of opening a duplicate', () => {
    const body = bodyOfFunction('report_refresh_failure')
    expect(body).toContain('gh issue list')
    expect(body).toContain('gh issue comment')
    expect(body).toContain('gh issue create')
  })
})
