import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'

// ── agent-coordinator.sh: escalate any PR that touches .github/workflows/ ──
// Decided by Inna 2026-09-22 (issue #306): the agent's GitHub token now has
// the `workflow` scope, so it can add or edit CI workflow files. The repo is
// public and secrets live in Actions, so a workflow change that self-merges
// is the one path where a mistake could print a key into a public log. This
// adds a deterministic check — independent of the LLM reviewer's judgment —
// alongside the existing escalation rule (auth, secrets, migrations, infra):
// any diff touching .github/workflows/ never gets auto-merge, and both the
// issue and the PR are labeled needs-you.

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

describe('agent-coordinator.sh: workflow_files_changed source checks', () => {
  it('checks the diff against origin/main for a path under .github/workflows/', () => {
    const fn = extractFunction('workflow_files_changed')
    expect(fn).toContain('git diff --name-only origin/main...HEAD')
    expect(fn).toContain('.github/workflows/')
  })
})

describe('agent-coordinator.sh: escalation branch includes workflow file changes', () => {
  it('the escalation condition also fires on WORKFLOW_CHANGED', () => {
    const start = coordinatorSource.indexOf('if [ -n "$PR_URL" ]; then')
    expect(start).toBeGreaterThan(-1)
    const conditionLine = coordinatorSource.slice(
      start,
      coordinatorSource.indexOf('\n', start + 1) + 200,
    )
    expect(conditionLine).toContain('RISK: LIVE-VERIFY-NEEDED')
    expect(conditionLine).toContain('"$REVIEW_RC" -eq 2')
    expect(conditionLine).toContain('"$WORKFLOW_CHANGED" -eq 1')
  })

  it('WORKFLOW_CHANGED is computed from workflow_files_changed before the PR is opened', () => {
    const computeAt = coordinatorSource.indexOf('workflow_files_changed && WORKFLOW_CHANGED=1')
    const openAt = coordinatorSource.indexOf('PR_URL=$(github_open_pr')
    expect(computeAt).toBeGreaterThan(-1)
    expect(openAt).toBeGreaterThan(-1)
    expect(computeAt).toBeLessThan(openAt)
  })

  it('does not enable auto-merge in the escalation branch', () => {
    const escalateAt = coordinatorSource.indexOf('"$WORKFLOW_CHANGED" -eq 1 ]; then')
    const nextElseAt = coordinatorSource.indexOf('local PR_NODE_ID', escalateAt)
    const escalationBlock = coordinatorSource.slice(escalateAt, nextElseAt)
    expect(escalationBlock).not.toContain('github_enable_automerge')
  })

  it('labels both the issue and the PR needs-you in the escalation branch', () => {
    const escalateAt = coordinatorSource.indexOf('"$WORKFLOW_CHANGED" -eq 1 ]; then')
    const nextElseAt = coordinatorSource.indexOf('local PR_NODE_ID', escalateAt)
    const escalationBlock = coordinatorSource.slice(escalateAt, nextElseAt)
    expect(escalationBlock).toContain('github_label "$ISSUE_NUMBER" "needs-you"')
    expect(escalationBlock).toContain('github_label "$PR_NUMBER" "needs-you"')
  })

  it('says in the PR body that the PR changes CI and needs a human to merge it', () => {
    const bodyAt = coordinatorSource.indexOf('if [ "$WORKFLOW_CHANGED" -eq 1 ]; then')
    const prUrlAt = coordinatorSource.indexOf('PR_URL=$(github_open_pr', bodyAt)
    const block = coordinatorSource.slice(bodyAt, prUrlAt)
    expect(block).toContain('PR_BODY=')
    expect(block).toContain('.github/workflows/')
    expect(block.toLowerCase()).toContain('needs a human')
  })
})

describe('workflow_files_changed (functional): fires for CI workflow diffs, not ordinary app files', () => {
  let repo: string

  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf-8' })

  function fired(): boolean {
    const fnBody = extractFunction('workflow_files_changed')
    const script = `${fnBody}\nworkflow_files_changed`
    try {
      execFileSync('bash', ['-c', script], { cwd: repo })
      return true
    } catch (err: any) {
      // grep -q exits 1 when it finds no match: that is workflow_files_changed
      // correctly reporting "no CI workflow file in this diff", not a test error.
      if (err.status === 1) return false
      throw err
    }
  }

  beforeEach(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'coord-workflow-'))
    git('init', '-q')
    git('config', 'user.email', 'test@example.com')
    git('config', 'user.name', 'test')
    fs.mkdirSync(path.join(repo, 'lib'))
    fs.writeFileSync(path.join(repo, 'lib/app.ts'), 'original\n')
    git('add', '-A')
    git('commit', '-qm', 'initial')
    git('branch', 'origin/main')
  })

  afterEach(() => fs.rmSync(repo, { recursive: true, force: true }))

  it('fires for a changed-file list containing .github/workflows/eval-ask.yml', () => {
    git('checkout', '-qb', 'task-306-test')
    fs.mkdirSync(path.join(repo, '.github/workflows'), { recursive: true })
    fs.writeFileSync(path.join(repo, '.github/workflows/eval-ask.yml'), 'name: eval-ask\n')
    git('add', '-A')
    git('commit', '-qm', 'add CI workflow')

    expect(fired()).toBe(true)
  })

  it('does not fire for a list of ordinary app files', () => {
    git('checkout', '-qb', 'task-306-test')
    fs.writeFileSync(path.join(repo, 'lib/app.ts'), 'edited\n')
    fs.writeFileSync(path.join(repo, 'lib/other.ts'), 'new file\n')
    git('add', '-A')
    git('commit', '-qm', 'ordinary app change')

    expect(fired()).toBe(false)
  })
})
