import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'

// ── agent-coordinator.sh: retry in a fresh session, preserve partial work
// (issue #207) ────────────────────────────────────────────────────────────
// Observed 2026-09-17 on #162: attempt 2 ran with `--resume <attempt 1's
// session id>`. A resumed session re-sends the ENTIRE prior conversation —
// including attempt 1's 5.5-minute exploration — as input context on every
// turn, so attempt 2 paid for that exploration repeatedly and exhausted the
// $2 per-call budget without ever finishing. AGENTS.md already tells agents
// to do the opposite themselves ("write a compact task brief and start a
// fresh implementation session"); the coordinator's own retry violated that
// same rule.
//
// Separately, when attempt 2 then died on the budget cap with a dirty
// working tree, the coordinator deleted the branch without committing,
// which is how #162's paid-for edits nearly vanished — recovered only
// because a human happened to look at the working tree before the next
// issue's entry-cleanup (`git reset --hard && git clean -fd`) wiped it.
//
// These tests pin: (1) the retry no longer resumes a session, and instead
// builds a compact, self-contained brief; (2) a run that dies with a dirty
// tree commits that work to the task branch instead of discarding it.

const coordinatorPath = path.join(__dirname, '../agent-coordinator.sh')
const coordinatorSource = fs.readFileSync(coordinatorPath, 'utf-8')

function extractFunction(name: string): string {
  const marker = `${name}() {`
  const start = coordinatorSource.indexOf(marker)
  expect(start).toBeGreaterThan(-1)
  let depth = 0
  let i = coordinatorSource.indexOf('{', start)
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

function runAgentBody(): string {
  const body = coordinatorSource.split('run_agent() {')[1]
  expect(body).toBeDefined()
  return body
}

describe('agent-coordinator.sh: retry does not resume a session', () => {
  it('never passes a resume id to the implementation claude call', () => {
    const body = runAgentBody()
    // The implement call must always pass an empty resume argument — no
    // SESSION_ID captured from a prior attempt, and no --resume wiring tied
    // to $ATTEMPT.
    expect(body).toContain('run_claude "$CLAUDE_OUT" "" \\')
    expect(coordinatorSource).not.toMatch(/SESSION_ID/)
  })

  it('does not tell the operator the retry resumes a session', () => {
    expect(coordinatorSource).not.toMatch(/retrying with session resume/)
    expect(coordinatorSource).toMatch(/retrying in a fresh session/)
  })

  it('builds a self-contained retry prompt carrying the issue, the failure reason, and touched files', () => {
    const body = runAgentBody()
    const retryBlock = body.slice(
      body.indexOf('if [ $ATTEMPT -lt 2 ]; then'),
      body.indexOf('ATTEMPT=$((ATTEMPT + 1))'),
    )
    // No longer just "PROMPT=$FAIL_REASON" riding on conversation memory.
    expect(retryBlock).not.toMatch(/PROMPT="\$FAIL_REASON"/)
    expect(retryBlock).toContain('FRESH session')
    expect(retryBlock).toContain('${ISSUE_BODY}')
    expect(retryBlock).toContain('${FAIL_REASON}')
    expect(retryBlock).toContain('${RETRY_TOUCHED}')
    // Still restates the house rules a fresh session has no memory of.
    expect(retryBlock).toContain('Never modify data/schools.json')
    expect(retryBlock).toContain('Never push, never merge, never switch branches')
  })
})

describe('RETRY_TOUCHED (functional): lists files touched so far on the branch', () => {
  let repo: string

  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: repo, encoding: 'utf-8' })

  beforeEach(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'coord-retry-touched-'))
    git('init', '-q')
    git('config', 'user.email', 'test@example.com')
    git('config', 'user.name', 'test')
    fs.writeFileSync(path.join(repo, 'existing.ts'), 'original\n')
    git('add', '-A')
    git('commit', '-qm', 'initial')
    // Fake an "origin/main" ref without a real remote, since the snippet
    // only needs something named origin/main to diff against.
    git('branch', 'origin/main')
    git('checkout', '-qb', 'task-207-test')
  })

  afterEach(() => fs.rmSync(repo, { recursive: true, force: true }))

  function computeRetryTouched(): string {
    const body = runAgentBody()
    const snippet = body.slice(
      body.indexOf('local RETRY_TOUCHED'),
      body.indexOf('[ -z "$RETRY_TOUCHED" ]') + '[ -z "$RETRY_TOUCHED" ] && RETRY_TOUCHED="(no files changed yet)"'.length,
    )
    const script = `${snippet.replace('local RETRY_TOUCHED\n', '')}\necho "$RETRY_TOUCHED"`
    return execFileSync('bash', ['-c', script], { cwd: repo, encoding: 'utf-8' }).trim()
  }

  it('reports "(no files changed yet)" on a clean branch', () => {
    expect(computeRetryTouched()).toBe('(no files changed yet)')
  })

  it('lists a committed change on this branch', () => {
    fs.writeFileSync(path.join(repo, 'existing.ts'), 'edited\n')
    git('add', '-A')
    git('commit', '-qm', 'attempt 1 edit')
    expect(computeRetryTouched()).toBe('existing.ts')
  })

  it('lists an uncommitted edit and a new untracked file left by a dying attempt', () => {
    fs.writeFileSync(path.join(repo, 'existing.ts'), 'half-finished\n')
    fs.writeFileSync(path.join(repo, 'new-file.ts'), 'new\n')
    const touched = computeRetryTouched().split('\n').sort()
    expect(touched).toEqual(['existing.ts', 'new-file.ts'])
  })
})

describe('agent-coordinator.sh: abandoning a run preserves partial work (#207)', () => {
  it('commits and keeps the branch on budget-exhausted instead of deleting it', () => {
    const body = runAgentBody()
    const start = body.indexOf('claude_budget_exhausted "$CLAUDE_OUT"')
    const end = body.indexOf('return 0', start)
    const block = body.slice(start, end)
    expect(block).toContain('preserve_branch_before_abandoning')
    expect(block).not.toContain('git branch -D "$BRANCH"')
  })

  it('commits and keeps the branch when both attempts fail, instead of deleting it', () => {
    const body = runAgentBody()
    const start = body.indexOf('failed after 2 attempts')
    const block = body.slice(Math.max(0, start - 400), start + 400)
    expect(block).toContain('preserve_branch_before_abandoning')
    expect(block).not.toContain('git branch -D "$BRANCH"')
  })
})

describe('preserve_branch_before_abandoning (functional)', () => {
  let workDir: string
  let repo: string
  let logFile: string

  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: repo, encoding: 'utf-8' })

  beforeEach(() => {
    // The log file must live OUTSIDE the git repo, exactly like production
    // (/home/agent/agent-coordinator.log vs. the /home/agent/app checkout):
    // this function's own `>> "$LOG_FILE"` redirections must never land
    // inside the tree that `git add -A` is about to stage.
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'coord-preserve-'))
    repo = path.join(workDir, 'app')
    fs.mkdirSync(repo)
    logFile = path.join(workDir, 'coordinator.log')
    fs.writeFileSync(logFile, '')
    git('init', '-q')
    git('config', 'user.email', 'test@example.com')
    git('config', 'user.name', 'test')
    fs.writeFileSync(path.join(repo, 'tracked.ts'), 'original\n')
    git('add', '-A')
    git('commit', '-qm', 'initial')
    git('checkout', '-qb', 'task-207-budget-test')
  })

  afterEach(() => fs.rmSync(workDir, { recursive: true, force: true }))

  function run(reason: string): { note: string; commitCount: number; status: string } {
    const fnBody = extractFunction('preserve_branch_before_abandoning')
    const script = `
ISSUE_NUMBER="207"
BRANCH="task-207-budget-test"
COMMIT_TITLE="fix: issue #207 - test"
LOG_FILE="${logFile}"
log() { echo "[ts] $1" | tee -a "$LOG_FILE" >/dev/null; }
${fnBody}
preserve_branch_before_abandoning "${reason}"
echo "NOTE_START"
echo "$DIRTY_TREE_NOTE"
echo "NOTE_END"
`
    const out = execFileSync('bash', ['-c', script], { cwd: repo, encoding: 'utf-8' })
    const note = out.slice(out.indexOf('NOTE_START') + 'NOTE_START'.length, out.indexOf('NOTE_END')).trim()
    const commitCount = Number(git('rev-list', '--count', 'HEAD').trim())
    const status = git('status', '--porcelain').trim()
    return { note, commitCount, status }
  }

  it('a budget-exhausted attempt with a dirty tree produces a commit on the task branch', () => {
    fs.writeFileSync(path.join(repo, 'tracked.ts'), 'half-finished edit\n')
    fs.writeFileSync(path.join(repo, 'leftover.test.ts'), 'new test\n')

    const before = { commitCount: Number(git('rev-list', '--count', 'HEAD').trim()) }
    const result = run('budget exhausted on attempt 2')

    expect(result.commitCount).toBe(before.commitCount + 1)
    expect(result.status).toBe('')
    expect(git('log', '-1', '--pretty=%B').trim()).toContain('partial')
    expect(result.note).toContain('task-207-budget-test')
    // The branch itself must still exist — nothing here deletes it.
    expect(git('branch', '--list', 'task-207-budget-test').trim()).not.toBe('')
  })

  it('does nothing when the tree is already clean', () => {
    const before = Number(git('rev-list', '--count', 'HEAD').trim())
    const result = run('failed after 2 attempts')

    expect(Number(git('rev-list', '--count', 'HEAD').trim())).toBe(before)
    expect(result.note).toBe('')
  })
})
