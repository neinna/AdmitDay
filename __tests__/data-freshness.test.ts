import { execFileSync, spawnSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import yaml from 'js-yaml'

const root = path.join(__dirname, '..')
const script = path.join(root, 'scripts', 'data-staleness.sh')

function tempRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'data-fresh-'))
  execFileSync('git', ['init', '-q'], { cwd: dir })
  return dir
}

function commit(dir: string, file: string, date?: string) {
  fs.writeFileSync(path.join(dir, file), '[]')
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 't',
    GIT_AUTHOR_EMAIL: 't@t',
    GIT_COMMITTER_NAME: 't',
    GIT_COMMITTER_EMAIL: 't@t',
    ...(date ? { GIT_COMMITTER_DATE: date } : {}),
  }
  execFileSync('git', ['add', '-A'], { cwd: dir, env })
  execFileSync('git', ['commit', '-q', '-m', 'c'], { cwd: dir, env })
}

describe('data-staleness.sh', () => {
  it('prints the age in whole days of the last schools.json commit', () => {
    const dir = tempRepo()
    const d = new Date(Date.now() - 10 * 86400 * 1000 - 3600 * 1000).toISOString()
    commit(dir, 'schools.json', d)
    const out = execFileSync('sh', [script], { cwd: dir }).toString().trim()
    expect(out).toBe('10')
  })

  it('exits 2 with no stdout when no commit touches schools.json', () => {
    const dir = tempRepo()
    commit(dir, 'other.txt')
    const r = spawnSync('sh', [script], { cwd: dir })
    expect(r.status).toBe(2)
    expect(r.stdout.toString()).toBe('')
  })
})

describe('data-freshness workflow', () => {
  const raw = fs.readFileSync(path.join(root, '.github/workflows/data-freshness.yml'), 'utf-8')
  const wf = yaml.load(raw) as any

  it('runs Tue and Fri at 15:00 UTC', () => {
    expect(wf.on.schedule[0].cron).toBe('0 15 * * 2,5')
  })

  it('files a needs-you issue with the exact title', () => {
    const run: string = wf.jobs['data-freshness'].steps[1].run
    expect(run).toContain("--label needs-you")
    expect(run).not.toContain('agent-ok')
    expect(run).toContain("--title 'Data refresh: schools.json is stale'")
  })
})
