import fs from 'fs'
import path from 'path'

// ── Issue #237: VPS data refresh ends at a data PR (option B, #175) ───────
// The VPS never writes to Postgres. Its job ends once the data PR is open;
// Vercel loads the merged data via the daily /api/cron/seed-schools cron.

const scriptPath = path.join(__dirname, '../scripts/vps-data-refresh.sh')
const scriptSource = fs.readFileSync(scriptPath, 'utf-8')

describe('scripts/vps-data-refresh.sh', () => {
  it('never invokes the Postgres seed script', () => {
    expect(scriptSource).not.toContain('seed-schools.ts')
  })

  it('never requires or connects to a Postgres connection secret', () => {
    expect(scriptSource).not.toContain('POSTGRES_URL')
  })

  it('prints a message and exits 0 when invoked with apply', () => {
    const applyIdx = scriptSource.indexOf('apply_merged_data() {')
    const nextBraceIdx = scriptSource.indexOf('\n}', applyIdx)
    const body = scriptSource.slice(applyIdx, nextBraceIdx)
    expect(applyIdx).toBeGreaterThan(-1)
    expect(body).toContain('Loading happens in Vercel after the data PR merges (/api/cron/seed-schools)')
    expect(body).toContain('exit 0')
  })

  it("ends the job at opening the data PR: 'pr' mode never seeds Postgres", () => {
    const prFnIdx = scriptSource.indexOf('open_refresh_pr() {')
    const nextFnIdx = scriptSource.indexOf('\n}', prFnIdx)
    const body = scriptSource.slice(prFnIdx, nextFnIdx)
    expect(body).not.toContain('seed-schools.ts')
    expect(body).toContain('gh pr create')
  })
})
