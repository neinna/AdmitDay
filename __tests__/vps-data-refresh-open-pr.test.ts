import fs from 'fs'
import os from 'os'
import path from 'path'
import { spawnSync } from 'child_process'

// scripts/vps-data-refresh.sh must find the data PR by its open number. The
// branch name is reused every week, so `gh pr view <branch>` matched a merged
// PR (#270 on 2026-10-02) and no new PR was opened.

const scriptSource = fs.readFileSync(path.join(__dirname, '../scripts/vps-data-refresh.sh'), 'utf-8')

function extractFunction(name: string): string {
  const start = scriptSource.indexOf(`${name}() {`)
  expect(start).toBeGreaterThan(-1)
  const end = scriptSource.indexOf('\n}\n', start)
  return scriptSource.slice(start, end + 2)
}

// openPr: the number `gh pr list --state open` returns ('' = none open).
function run(call: string, openPr: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'refresh-open-pr-'))
  const bin = path.join(dir, 'bin')
  const log = path.join(dir, 'gh.log')
  fs.mkdirSync(bin)
  const stub = (name: string, body: string) => {
    fs.writeFileSync(path.join(bin, name), `#!/bin/sh\n${body}\n`, { mode: 0o755 })
  }
  stub(
    'gh',
    `echo "$*" >> "${log}"
if [ "$1 $2" = "pr list" ]; then echo "${openPr}"; fi
exit 0`,
  )
  // `git diff --cached --quiet` must report staged changes.
  stub('git', 'for a in "$@"; do [ "$a" = "--quiet" ] && exit 1; done; exit 0')
  stub('npm', 'exit 0')
  stub('python3', 'exit 0')

  const fns = [
    'require_env',
    'require_gh_token',
    'prepare_checkout',
    'install_dependencies',
    'build_refresh_pr_body',
    'open_refresh_pr_number',
    'open_refresh_pr',
    'assert_refresh_pr_files',
    'assert_refresh_ci_green',
    'merge_refresh_pr',
  ]
    .map(extractFunction)
    .join('\n')
  const script = `set -euo pipefail
APP_DIR="${dir}"
BRANCH=data/weekly-refresh
REPO=neinna/AdmitDay
EXPECTED_DATA_FILES="data/schema-summary.json
data/school-embeddings.json
schools.json"
${fns}
${call}`
  const result = spawnSync('bash', ['-c', script], {
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, GH_TOKEN: 't', OPENAI_API_KEY: 'k' },
    encoding: 'utf-8',
  })
  const calls = fs.existsSync(log) ? fs.readFileSync(log, 'utf-8').split('\n').filter(Boolean) : []
  return { result, calls }
}

describe('vps-data-refresh.sh open PR lookup', () => {
  it('creates a PR when only a merged PR exists on the branch, never gh pr edit', () => {
    const { result, calls } = run('open_refresh_pr', '')
    expect(result.status).toBe(0)
    expect(calls.some((c) => c.startsWith('pr create'))).toBe(true)
    expect(calls.some((c) => c.startsWith('pr edit'))).toBe(false)
    expect(calls.some((c) => c.startsWith('api'))).toBe(false)
  })

  it('patches the open PR by number and does not create another', () => {
    const { result, calls } = run('open_refresh_pr', '271')
    expect(result.status).toBe(0)
    expect(calls.some((c) => c.startsWith('api -X PATCH repos/neinna/AdmitDay/pulls/271 '))).toBe(true)
    expect(calls.some((c) => c.startsWith('pr create'))).toBe(false)
    expect(calls.some((c) => c.startsWith('pr edit'))).toBe(false)
  })

  it('merge exits 0 without merging when no PR is open', () => {
    const { result, calls } = run('merge_refresh_pr', '')
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('No open data refresh PR for data/weekly-refresh; nothing to merge.')
    expect(calls.some((c) => c.startsWith('pr merge'))).toBe(false)
  })
})
