import fs from 'fs'
import path from 'path'

// ── Issue #176: scheduled data-freshness cadence (option B, #175) ─────────
// The VPS cron entries are committed to the repo, not just described in
// prose, so the schedule is visible and reviewable. Static checks only --
// no cron daemon is exercised.

const cronPath = path.join(__dirname, '../scripts/vps-data-cron.txt')
const cronSource = fs.readFileSync(cronPath, 'utf-8')

describe('scripts/vps-data-cron.txt', () => {
  it('exists and is non-empty', () => {
    expect(cronSource.trim().length).toBeGreaterThan(0)
  })

  it('runs pr at 09:00 and merge at 09:30, 30 minutes later', () => {
    expect(cronSource).toMatch(/^0 9 .*vps-data-refresh\.sh pr$/m)
    expect(cronSource).toMatch(/^30 9 .*vps-data-refresh\.sh merge$/m)
  })

  it('covers the admissions season (September - March) on Mondays', () => {
    expect(cronSource).toContain('9-12,1-3 1')
  })

  it('covers the off-season (April - August), limited to the first Monday', () => {
    expect(cronSource).toContain('4-8 1')
    expect(cronSource).toMatch(/date \+\\%d.*-le 7/)
  })

  it('declares the schedule in America/New_York time', () => {
    expect(cronSource).toContain('CRON_TZ=America/New_York')
  })
})

describe('README documents the refresh cadence', () => {
  const readme = fs.readFileSync(path.join(__dirname, '../README.md'), 'utf-8')

  it('documents the weekly-in-season / monthly-off-season cadence', () => {
    expect(readme).toContain('weekly')
    expect(readme).toContain('monthly')
  })

  it('documents the install command for the committed crontab', () => {
    expect(readme).toContain('scripts/vps-data-cron.txt')
  })

  it('documents that a merged data PR reaches Postgres at the next Vercel cron run', () => {
    expect(readme).toContain('/api/cron/seed-schools')
    expect(readme.toLowerCase()).toContain('reaches postgres')
  })
})
