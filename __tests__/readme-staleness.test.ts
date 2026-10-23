import { spawnSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

const script = path.join(__dirname, '..', 'scripts', 'readme-staleness.sh')

function git(cwd: string, ...args: string[]) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' })
  if (r.status !== 0) throw new Error(r.stderr)
}

function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'readme-stale-'))
  git(dir, 'init', '-q')
  git(dir, 'config', 'user.email', 't@example.com')
  git(dir, 'config', 'user.name', 't')
  git(dir, 'config', 'commit.gpgsign', 'false')
  return dir
}

function commit(dir: string, file: string, n: number) {
  fs.writeFileSync(path.join(dir, file), String(n))
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', `change ${file} ${n}`)
}

describe('scripts/readme-staleness.sh', () => {
  it('counts only non-data commits since README.md last changed', () => {
    const dir = makeRepo()
    commit(dir, 'README.md', 0)
    for (let i = 1; i <= 11; i++) commit(dir, 'app.txt', i)
    for (let i = 1; i <= 3; i++) commit(dir, 'schools.json', i)
    const r = spawnSync('sh', [script], { cwd: dir, encoding: 'utf8' })
    expect(r.status).toBe(0)
    const lines = r.stdout.trim().split('\n')
    expect(lines[0]).toBe('11')
    expect(lines).toHaveLength(12)
    expect(lines[1]).toBe('- change app.txt 11')
  })

  it('exits 2 when no commit touches README.md', () => {
    const dir = makeRepo()
    commit(dir, 'app.txt', 1)
    const r = spawnSync('sh', [script], { cwd: dir, encoding: 'utf8' })
    expect(r.status).toBe(2)
    expect(r.stderr).toContain('no commit touches README.md')
  })
})
