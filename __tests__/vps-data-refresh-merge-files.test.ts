import fs from 'fs'
import os from 'os'
import path from 'path'
import { spawnSync } from 'child_process'

// assert_refresh_pr_files must accept any non-empty subset of the data files
// and list them from git, never from `gh pr diff` (times out on 70 MB embeddings).

const scriptSource = fs.readFileSync(path.join(__dirname, '../scripts/vps-data-refresh.sh'), 'utf-8')

function extractFunction(name: string): string {
  const start = scriptSource.indexOf(`${name}() {`)
  expect(start).toBeGreaterThan(-1)
  const end = scriptSource.indexOf('\n}\n', start)
  return scriptSource.slice(start, end + 2)
}

function git(cwd: string, ...args: string[]) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf-8' })
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`)
}

function run(changed: string[]) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'refresh-files-'))
  const bin = path.join(dir, 'bin')
  const ghLog = path.join(dir, 'gh.log')
  const origin = path.join(dir, 'origin.git')
  const work = path.join(dir, 'work')
  fs.mkdirSync(bin)
  fs.mkdirSync(work)
  fs.writeFileSync(path.join(bin, 'gh'), `#!/bin/sh\necho "$*" >> "${ghLog}"\nexit 99\n`, { mode: 0o755 })

  git(dir, 'init', '--bare', '-b', 'main', origin)
  git(work, 'init', '-b', 'main')
  git(work, 'config', 'user.email', 't@t')
  git(work, 'config', 'user.name', 't')
  git(work, 'remote', 'add', 'origin', origin)
  const base = ['data/schema-summary.json', 'data/school-embeddings.json', 'schools.json', 'app/page.tsx']
  for (const f of base) {
    fs.mkdirSync(path.dirname(path.join(work, f)), { recursive: true })
    fs.writeFileSync(path.join(work, f), 'base\n')
  }
  git(work, 'add', '-A')
  git(work, 'commit', '-m', 'base')
  git(work, 'push', 'origin', 'main')
  git(work, 'checkout', '-b', 'data/weekly-refresh')
  for (const f of changed) fs.writeFileSync(path.join(work, f), 'changed\n')
  git(work, 'commit', '--allow-empty', '-am', 'refresh')
  git(work, 'push', 'origin', 'data/weekly-refresh')

  const script = `set -euo pipefail
APP_DIR="${work}"
BRANCH=data/weekly-refresh
REPO=neinna/AdmitDay
EXPECTED_DATA_FILES="data/schema-summary.json
data/school-embeddings.json
schools.json"
${extractFunction('require_env')}
${extractFunction('require_gh_token')}
${extractFunction('assert_refresh_pr_files')}
assert_refresh_pr_files 1`
  const result = spawnSync('bash', ['-c', script], {
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, GH_TOKEN: 't' },
    encoding: 'utf-8',
  })
  const ghCalls = fs.existsSync(ghLog) ? fs.readFileSync(ghLog, 'utf-8') : ''
  return { result, ghCalls }
}

describe('vps-data-refresh.sh assert_refresh_pr_files', () => {
  it('passes when all three data files changed', () => {
    const { result, ghCalls } = run(['data/schema-summary.json', 'data/school-embeddings.json', 'schools.json'])
    expect(result.status).toBe(0)
    expect(ghCalls).toBe('')
  })

  it('passes when only schema-summary and embeddings changed', () => {
    const { result, ghCalls } = run(['data/schema-summary.json', 'data/school-embeddings.json'])
    expect(result.status).toBe(0)
    expect(ghCalls).toBe('')
  })

  it('refuses and prints the offending file when a non-data file changed', () => {
    const { result, ghCalls } = run(['schools.json', 'app/page.tsx'])
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Refusing to merge data refresh PR with unexpected files:')
    expect(result.stderr).toContain('app/page.tsx')
    expect(ghCalls).toBe('')
  })

  it('refuses when nothing changed', () => {
    const { result, ghCalls } = run([])
    expect(result.status).toBe(1)
    expect(ghCalls).toBe('')
  })
})
