import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'

// ── scripts/vps-data-refresh.sh: a deleted data branch must not block the push
// The merge step squash-merges with --delete-branch, so GitHub's
// data/weekly-refresh disappears while the VPS checkout keeps a remote-tracking
// ref to it. The next run's `git push --force-with-lease` compared against that
// stale ref and was rejected as "stale info" (the 2026-09-28 run built the data
// and opened no PR). prepare_checkout now prunes, so the push goes through.

const scriptSource = fs.readFileSync(
  path.join(__dirname, '../scripts/vps-data-refresh.sh'),
  'utf-8',
)

function extractFunction(name: string): string {
  const start = scriptSource.indexOf(`${name}() {`)
  expect(start).toBeGreaterThan(-1)
  const end = scriptSource.indexOf('\n}\n', start)
  return scriptSource.slice(start, end + 2)
}

describe('vps-data-refresh.sh prepare_checkout', () => {
  it('lets the force-with-lease push succeed after GitHub deleted the data branch', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'refresh-stale-'))
    const remote = path.join(dir, 'remote.git')
    const app = path.join(dir, 'app')
    const git = (cwd: string, ...args: string[]) =>
      execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd, stdio: 'pipe' })
        .toString()
        .trim()

    git(dir, 'init', '-q', '--bare', '-b', 'main', remote)
    git(dir, 'clone', '-q', remote, app)
    fs.writeFileSync(path.join(app, 'schools.json'), '[]\n')
    git(app, 'add', '-A')
    git(app, 'commit', '-qm', 'base')
    git(app, 'push', '-q', 'origin', 'main')

    // A previous run pushed the data branch, then the merge step deleted it on the remote.
    git(app, 'switch', '-qc', 'data/weekly-refresh')
    fs.writeFileSync(path.join(app, 'schools.json'), '[1]\n')
    git(app, 'commit', '-qam', 'old data')
    git(app, 'push', '-q', 'origin', 'data/weekly-refresh')
    git(remote, 'branch', '-D', 'data/weekly-refresh')
    git(app, 'switch', '-q', 'main')

    execFileSync('bash', ['-c', `APP_DIR="${app}"\n${extractFunction('prepare_checkout')}\nprepare_checkout`], {
      stdio: 'pipe',
    })

    // Same steps as open_refresh_pr after prepare_checkout.
    git(app, 'switch', '-qC', 'data/weekly-refresh', 'origin/main')
    fs.writeFileSync(path.join(app, 'schools.json'), '[2]\n')
    git(app, 'commit', '-qam', 'new data')
    expect(() => git(app, 'push', '-q', '--force-with-lease', 'origin', 'data/weekly-refresh')).not.toThrow()
    expect(git(remote, 'log', '-1', '--format=%s', 'data/weekly-refresh')).toBe('new data')
  })
})
