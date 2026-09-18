import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'

// ── agent-coordinator.sh: self-update installs the pulled script (issue #220) ──
// Observed 2026-09-17: self_update_from_main fast-forwarded and restarted PM2
// ten times overnight, but PM2 runs /home/agent/agent-coordinator.sh while the
// pull only ever updated /home/agent/app/agent-coordinator.sh. Nothing copied
// one over the other, so every restart reloaded the same stale (Aug 10) copy
// and three merged coordinator fixes never executed.
//
// These tests pin: (1) the comparison + swap runs on every check, not only
// after a pull, so a copy that already drifted gets corrected too; (2) the
// swap is gated by `bash -n` and uses `mv` of a separate temp file rather
// than an in-place write; (3) a syntactically broken candidate is rejected
// and the running script is left untouched.

const coordinatorPath = path.join(__dirname, '../agent-coordinator.sh')
const coordinatorSource = fs.readFileSync(coordinatorPath, 'utf-8')

function extractFunction(name: string): string {
  const marker = `${name}() {`
  const start = coordinatorSource.indexOf(marker)
  expect(start).toBeGreaterThan(-1)
  // Walk brace depth from the opening "{" to find this function's matching close.
  let depth = 0
  let i = coordinatorSource.indexOf('{', start)
  const bodyStart = i
  for (; i < coordinatorSource.length; i++) {
    const ch = coordinatorSource[i]
    if (ch === '{') depth++
    if (ch === '}') {
      depth--
      if (depth === 0) break
    }
  }
  return coordinatorSource.slice(start, i + 1)
}

describe('agent-coordinator.sh: self-update runs the comparison on every check', () => {
  it('runs install_running_coordinator_script after the pull attempt, unconditionally', () => {
    const body = extractFunction('self_update_from_main')
    const installAt = body.indexOf('install_running_coordinator_script')
    const fetchAt = body.indexOf('git fetch')
    expect(installAt).toBeGreaterThan(-1)
    expect(fetchAt).toBeGreaterThan(-1)
    expect(fetchAt).toBeLessThan(installAt)

    // The "nothing to pull" cases (fetch failed / same SHA / diverged) must
    // not bail out of the whole function before reaching the install call —
    // that was the exact bug: main not moving skipped the comparison too.
    // None of those branches may contain a bare `exit 0` between the fetch
    // and the install call; only the genuinely-idle branch/dirty-tree guards
    // above the fetch are allowed to exit early.
    const betweenFetchAndInstall = body.slice(fetchAt, installAt)
    expect(betweenFetchAndInstall).not.toMatch(/exit 0/)
  })

  it('logs blob hashes and gates the swap with bash -n, never writing the running file in place', () => {
    const fn = extractFunction('install_running_coordinator_script')
    expect(fn).toContain('git hash-object')
    expect(fn).toContain('bash -n')
    expect(fn).toContain('mktemp')
    expect(fn).toMatch(/mv\s+"\$TMP_SCRIPT"\s+"\$RUNNING_SCRIPT"/)
    // The candidate is written to a distinct temp path and only ever mv'd in,
    // never `cp`'d or redirected onto the running path directly.
    expect(fn).not.toMatch(/>\s*"\$RUNNING_SCRIPT"/)
    expect(fn).not.toMatch(/cp\s+"\$REPO_SCRIPT"\s+"\$RUNNING_SCRIPT"/)
  })

  it('keeps the running script and does not restart when bash -n fails', () => {
    const fn = extractFunction('install_running_coordinator_script')
    const guard = fn.match(/if ! bash -n "\$TMP_SCRIPT"[\s\S]*?fi/)
    expect(guard).not.toBeNull()
    const guardBody = guard![0]
    expect(guardBody).toContain('rm -f "$TMP_SCRIPT"')
    expect(guardBody).toContain('return 0')
    expect(guardBody).not.toContain('mv ')
    expect(guardBody).not.toContain('pm2 restart')
    expect(guardBody.toLowerCase()).toContain('keeping running copy')
  })
})

// ── Functional test of install_running_coordinator_script in isolation ──────
// Extracts the real function body out of the shipped script and runs it
// against a scratch "repo copy" / "running copy" pair, with `pm2` and `log`
// stubbed. This exercises the actual bash logic (cmp, mktemp, bash -n, mv),
// not just a regex over the source.
describe('install_running_coordinator_script (functional)', () => {
  let dir: string
  let repoScript: string
  let runningScript: string
  let logFile: string
  let pm2Log: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coord-selfupdate-'))
    repoScript = path.join(dir, 'repo-agent-coordinator.sh')
    runningScript = path.join(dir, 'running-agent-coordinator.sh')
    logFile = path.join(dir, 'coordinator.log')
    pm2Log = path.join(dir, 'pm2.log')
    fs.writeFileSync(logFile, '')
    fs.writeFileSync(pm2Log, '')
    // A real git repo so `git hash-object` on the running/repo scripts works
    // the same way it does in the shipped script.
    execFileSync('git', ['init', '-q'], { cwd: dir })
  })

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

  function run(): { rc: number; log: string; pm2: string } {
    const fnBody = extractFunction('install_running_coordinator_script')
    const script = `
APP_DIR="${dir}"
LOG_FILE="${logFile}"
PM2_LOG="${pm2Log}"
REPO_SCRIPT_OVERRIDE="${repoScript}"
RUNNING_COORDINATOR_SCRIPT="${runningScript}"
log() { echo "[ts] $1" | tee -a "$LOG_FILE" >/dev/null; }
pm2() { echo "pm2 $*" >> "$PM2_LOG"; }
${fnBody.replace('local REPO_SCRIPT="$APP_DIR/agent-coordinator.sh"', 'local REPO_SCRIPT="$REPO_SCRIPT_OVERRIDE"')}
install_running_coordinator_script
echo "RC=$?"
`
    const out = execFileSync('bash', ['-c', script], { cwd: dir, encoding: 'utf-8' })
    const rcMatch = out.match(/RC=(\d+)/)
    return {
      rc: rcMatch ? Number(rcMatch[1]) : -1,
      log: fs.readFileSync(logFile, 'utf-8'),
      pm2: fs.readFileSync(pm2Log, 'utf-8'),
    }
  }

  it('installs a differing, syntactically valid repo script over the running one and restarts pm2', () => {
    fs.writeFileSync(runningScript, '#!/bin/bash\necho old\n')
    fs.writeFileSync(repoScript, '#!/bin/bash\necho new\n')

    const result = run()

    expect(result.rc).toBe(42)
    expect(fs.readFileSync(runningScript, 'utf-8')).toBe('#!/bin/bash\necho new\n')
    expect(result.pm2).toContain('restart agent-coordinator')
    expect(result.log).toMatch(/installed agent-coordinator\.sh/i)
  })

  it('does nothing and does not restart when the running copy already matches the repo', () => {
    fs.writeFileSync(runningScript, '#!/bin/bash\necho same\n')
    fs.writeFileSync(repoScript, '#!/bin/bash\necho same\n')
    const beforeMtime = fs.statSync(runningScript).mtimeMs

    const result = run()

    expect(result.rc).toBe(0)
    expect(fs.statSync(runningScript).mtimeMs).toBe(beforeMtime)
    expect(result.pm2).toBe('')
  })

  it('refuses to install a syntactically broken candidate, keeps the running script, and does not restart', () => {
    fs.writeFileSync(runningScript, '#!/bin/bash\necho old\n')
    fs.writeFileSync(repoScript, '#!/bin/bash\nif [ true\necho broken\n')

    const result = run()

    expect(result.rc).toBe(0)
    expect(fs.readFileSync(runningScript, 'utf-8')).toBe('#!/bin/bash\necho old\n')
    expect(result.pm2).toBe('')
    expect(result.log.toLowerCase()).toMatch(/bash -n|keeping running copy/)
  })

  it('installs when there is no running copy yet, without crashing on the missing-file hash lookup', () => {
    fs.writeFileSync(repoScript, '#!/bin/bash\necho fresh\n')

    const result = run()

    expect(result.rc).toBe(42)
    expect(fs.readFileSync(runningScript, 'utf-8')).toBe('#!/bin/bash\necho fresh\n')
  })

  it('replaces the running file via a distinct temp file rather than truncating it in place', () => {
    fs.writeFileSync(runningScript, '#!/bin/bash\necho old\n')
    fs.writeFileSync(repoScript, '#!/bin/bash\necho new\n')

    // Any leftover *.XXXXXX temp file next to the running script would mean
    // the swap did not clean up after itself.
    run()

    const leftoverTemps = fs
      .readdirSync(dir)
      .filter((f) => f.startsWith(path.basename(runningScript)) && f !== path.basename(runningScript))
    expect(leftoverTemps).toEqual([])
  })

  it('keeps the running script and does not restart when mv fails to install the staged candidate', () => {
    fs.writeFileSync(runningScript, '#!/bin/bash\necho old\n')
    fs.writeFileSync(repoScript, '#!/bin/bash\necho new\n')

    const fnBody = extractFunction('install_running_coordinator_script')
    const script = `
APP_DIR="${dir}"
LOG_FILE="${logFile}"
PM2_LOG="${pm2Log}"
REPO_SCRIPT_OVERRIDE="${repoScript}"
RUNNING_COORDINATOR_SCRIPT="${runningScript}"
log() { echo "[ts] $1" | tee -a "$LOG_FILE" >/dev/null; }
pm2() { echo "pm2 $*" >> "$PM2_LOG"; }
mv() { return 1; }
${fnBody.replace('local REPO_SCRIPT="$APP_DIR/agent-coordinator.sh"', 'local REPO_SCRIPT="$REPO_SCRIPT_OVERRIDE"')}
install_running_coordinator_script
echo "RC=$?"
`
    const out = execFileSync('bash', ['-c', script], { cwd: dir, encoding: 'utf-8' })
    const rc = Number((out.match(/RC=(\d+)/) || [])[1])

    expect(rc).toBe(0)
    expect(fs.readFileSync(runningScript, 'utf-8')).toBe('#!/bin/bash\necho old\n')
    expect(fs.readFileSync(pm2Log, 'utf-8')).toBe('')
    expect(fs.readFileSync(logFile, 'utf-8').toLowerCase()).toMatch(/mv .*failed|keeping running copy/)
  })
})
