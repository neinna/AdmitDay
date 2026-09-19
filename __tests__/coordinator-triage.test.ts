import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'

// ── agent-coordinator.sh: triage every agent-stuck issue (issue #214) ───────
// On 2026-09-17 two stuck issues needed diagnosis, not retries: #194 ran out
// of budget with the work mostly written (should have been resumed from its
// branch) and #162 failed four times because it contradicted the PRD and
// never defined its thresholds (no retry could ever have fixed it). This adds
// a read-only, advisory-only triage pass that runs once at each of the three
// places the coordinator applies the agent-stuck label, and posts one issue
// comment ending in a TRIAGE: line.
//
// These tests pin: (1) the verdict parser accepts all four classes and
// rejects garbage; (2) run_triage always calls the read-only tool list with
// its own budget variable; (3) a triage failure (claude error or malformed
// verdict) posts nothing and never touches labels; (4) all three call sites
// invoke run_triage right after labeling agent-stuck.

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

describe('agent-coordinator.sh: triage source checks', () => {
  it('has its own budget variable, defaulting to 0.50', () => {
    expect(coordinatorSource).toMatch(/CLAUDE_TRIAGE_MAX_USD="\$\{CLAUDE_TRIAGE_MAX_USD:-0\.50\}"/)
  })

  it('run_triage calls run_claude with the read-only tool list, sonnet, and its own budget', () => {
    const fn = extractFunction('run_triage')
    expect(fn).toContain('run_claude "$TRIAGE_OUT" "" "Read,Glob,Grep" "sonnet" "${CLAUDE_TRIAGE_MAX_USD}"')
  })

  it('run_triage never calls github_label or github_remove_label', () => {
    const fn = extractFunction('run_triage')
    expect(fn).not.toContain('github_label')
    expect(fn).not.toContain('github_remove_label')
  })

  it('run_triage posts the comment only inside the parsed-verdict branch', () => {
    const fn = extractFunction('run_triage')
    // Exactly one github_comment call, and it must be gated behind a
    // non-empty VERDICT_LINE — not called unconditionally.
    const commentCalls = fn.match(/github_comment/g) || []
    expect(commentCalls.length).toBe(1)
    const commentIndex = fn.indexOf('github_comment')
    const guardIndex = fn.indexOf('if [ -z "$VERDICT_LINE" ]')
    expect(guardIndex).toBeGreaterThan(-1)
    expect(commentIndex).toBeGreaterThan(fn.indexOf('else', guardIndex))
  })

  it('prompts the model to check AGENTS.md Cost And Issue Sizing and the product rules', () => {
    const fn = extractFunction('run_triage')
    expect(fn).toContain('Cost And Issue Sizing')
    expect(fn).toContain('product rules')
    expect(fn).toContain('Diagnose only — do not propose or make any code change.')
  })

  it('spells out all four verdict classes in the prompt', () => {
    const fn = extractFunction('run_triage')
    expect(fn).toContain('TRIAGE: TOO-BIG - <which parts to split into>')
    expect(fn).toContain('TRIAGE: RESUMABLE - <branch with the partial work>')
    expect(fn).toContain('TRIAGE: NEEDS-DECISION - <the one product question, answerable in a sentence>')
    expect(fn).toContain('TRIAGE: INFRA - <what broke outside the issue itself>')
  })

  it('records a triage span through lf_record', () => {
    const fn = extractFunction('run_triage')
    expect(fn).toContain('lf_record "triage"')
  })
})

describe('agent-coordinator.sh: all three agent-stuck sites call run_triage', () => {
  it('budget-exhausted site triages right after labeling agent-stuck', () => {
    const body = runAgentBody()
    const start = body.indexOf('claude_budget_exhausted "$CLAUDE_OUT"')
    const end = body.indexOf('return 0', start)
    const block = body.slice(start, end)
    const labelIdx = block.indexOf('github_label "$ISSUE_NUMBER" "agent-stuck"')
    const triageIdx = block.indexOf('run_triage ')
    expect(labelIdx).toBeGreaterThan(-1)
    expect(triageIdx).toBeGreaterThan(labelIdx)
  })

  it('PR-creation-failed site triages right after labeling agent-stuck', () => {
    const body = runAgentBody()
    const start = body.indexOf('branch pushed but PR creation failed')
    const block = body.slice(Math.max(0, start - 400), start + 200)
    const labelIdx = block.indexOf('github_label "$ISSUE_NUMBER" "agent-stuck"')
    const triageIdx = block.indexOf('run_triage ')
    expect(labelIdx).toBeGreaterThan(-1)
    expect(triageIdx).toBeGreaterThan(labelIdx)
  })

  it('failed-after-2-attempts site triages right after labeling agent-stuck', () => {
    const body = runAgentBody()
    const start = body.indexOf('failed after 2 attempts, labeled agent-stuck')
    const block = body.slice(Math.max(0, start - 400), start + 200)
    const labelIdx = block.indexOf('github_label "$ISSUE_NUMBER" "agent-stuck"')
    const triageIdx = block.indexOf('run_triage ')
    expect(labelIdx).toBeGreaterThan(-1)
    expect(triageIdx).toBeGreaterThan(labelIdx)
  })

  it('the secrets-file-changed guard (out of scope for #214) does not call run_triage', () => {
    const body = runAgentBody()
    const start = body.indexOf('SECRETS FILE CHANGED')
    const end = body.indexOf('return 0', start)
    const block = body.slice(start, end)
    expect(block).not.toContain('run_triage')
  })
})

describe('triage_verdict_line (functional): accepts all four classes, rejects garbage', () => {
  const fnBody = extractFunction('triage_verdict_line')

  function verdictLine(text: string): string {
    const script = `${fnBody}\ntriage_verdict_line`
    return execFileSync('bash', ['-c', script], { input: text, encoding: 'utf-8' }).trim()
  }

  it('parses TOO-BIG', () => {
    const text = 'Some diagnosis text.\n\nTRIAGE: TOO-BIG - split into schema change and UI change'
    expect(verdictLine(text)).toBe('TRIAGE: TOO-BIG - split into schema change and UI change')
  })

  it('parses RESUMABLE', () => {
    const text = 'Work is mostly done.\nTRIAGE: RESUMABLE - branch task-194-langfuse-tracing has the implementation'
    expect(verdictLine(text)).toBe('TRIAGE: RESUMABLE - branch task-194-langfuse-tracing has the implementation')
  })

  it('parses NEEDS-DECISION (the #162 reference case)', () => {
    const text =
      'This asks for a derived selectivity rating, which the PRD bans.\n' +
      'TRIAGE: NEEDS-DECISION - should selectivity be a derived rating, which the PRD bans, or evidence shown per admissions method?'
    expect(verdictLine(text)).toBe(
      'TRIAGE: NEEDS-DECISION - should selectivity be a derived rating, which the PRD bans, or evidence shown per admissions method?'
    )
  })

  it('parses INFRA', () => {
    const text = 'The CI runner ran out of disk mid-build.\nTRIAGE: INFRA - build host had no free disk space'
    expect(verdictLine(text)).toBe('TRIAGE: INFRA - build host had no free disk space')
  })

  it('rejects garbage input with no TRIAGE line', () => {
    expect(verdictLine('I could not figure out what went wrong.')).toBe('')
  })

  it('rejects a line using a class outside the allowed four', () => {
    expect(verdictLine('TRIAGE: MAYBE - not sure')).toBe('')
  })

  it('rejects an empty result', () => {
    expect(verdictLine('')).toBe('')
  })
})

describe('run_triage (functional): a triage failure or malformed verdict never posts or changes labels', () => {
  let dir: string
  let repo: string
  let commentsFile: string
  let labelCallsFile: string

  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf-8' })

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coord-triage-'))
    repo = path.join(dir, 'app')
    fs.mkdirSync(repo)
    commentsFile = path.join(dir, 'comments.log')
    labelCallsFile = path.join(dir, 'label-calls.log')
    fs.writeFileSync(commentsFile, '')
    fs.writeFileSync(labelCallsFile, '')
    git('init', '-q')
    git('config', 'user.email', 'test@example.com')
    git('config', 'user.name', 'test')
    fs.writeFileSync(path.join(repo, 'file.ts'), 'original\n')
    git('add', '-A')
    git('commit', '-qm', 'initial')
    git('branch', 'origin/main')
    git('checkout', '-qb', 'task-214-test')
    fs.writeFileSync(path.join(repo, 'file.ts'), 'edited\n')
    git('add', '-A')
    git('commit', '-qm', 'partial work')
  })

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

  // Runs the real run_triage + triage_verdict_line against stubbed
  // run_claude/claude_json_field/github_comment/github_label/lf_record/log,
  // so every GitHub-visible or label-changing side effect is observable.
  function run(resultText: string | null, claudeRc: number): { comments: string[]; labelCalls: string[] } {
    const runTriageBody = extractFunction('run_triage')
    const verdictBody = extractFunction('triage_verdict_line')
    const resultLiteral = resultText === null ? '' : Buffer.from(resultText, 'utf-8').toString('base64')

    const script = `
set -u
ISSUE_NUMBER="214"
ISSUE_TITLE="Test issue"
ISSUE_BODY="Test body"
BRANCH="task-214-test"
CLAUDE_TRIAGE_MAX_USD="0.50"
LOG_FILE="${path.join(dir, 'log.txt')}"

lf_now_ns() { echo 0; }
log() { :; }
lf_record() { :; }
github_comment() { printf '%s\n---END-OF-COMMENT---\n' "$2" >> "${commentsFile}"; }
github_label() { echo "$1 $2" >> "${labelCallsFile}"; }
github_remove_label() { echo "$1 $2" >> "${labelCallsFile}"; }

# Stub run_claude: ignores its real args, just reports the canned RC. The
# TRIAGE_OUT file is never read by claude_json_field below since we stub
# that too, so its content does not matter.
run_claude() { : > "$1"; return ${claudeRc}; }
claude_json_field() {
  if [ -n "${resultLiteral}" ]; then
    echo "${resultLiteral}" | base64 -d
  fi
}

${verdictBody}
${runTriageBody}

run_triage "some reason" "some output tail" "1"
`
    execFileSync('bash', ['-c', script], { cwd: repo, encoding: 'utf-8' })
    const comments = fs
      .readFileSync(commentsFile, 'utf-8')
      .split('---END-OF-COMMENT---\n')
      .map((s) => s.trim())
      .filter(Boolean)
    const labelCalls = fs
      .readFileSync(labelCallsFile, 'utf-8')
      .split('\n')
      .filter(Boolean)
    return { comments, labelCalls }
  }

  it('posts exactly one comment when claude returns a well-formed verdict', () => {
    const { comments, labelCalls } = run(
      'Diagnosis text.\nTRIAGE: NEEDS-DECISION - should X be derived or shown as evidence?',
      0
    )
    expect(comments).toHaveLength(1)
    expect(comments[0]).toContain('TRIAGE: NEEDS-DECISION')
    expect(labelCalls).toHaveLength(0)
  })

  it('posts nothing and changes no label when the claude call itself fails', () => {
    const { comments, labelCalls } = run(null, 1)
    expect(comments).toHaveLength(0)
    expect(labelCalls).toHaveLength(0)
  })

  it('posts nothing and changes no label when claude times out (rc 124)', () => {
    const { comments, labelCalls } = run(null, 124)
    expect(comments).toHaveLength(0)
    expect(labelCalls).toHaveLength(0)
  })

  it('posts nothing and changes no label when the result has no TRIAGE line', () => {
    const { comments, labelCalls } = run('I looked into it but could not conclude anything useful.', 0)
    expect(comments).toHaveLength(0)
    expect(labelCalls).toHaveLength(0)
  })

  it('posts nothing when the result uses a class outside the allowed four', () => {
    const { comments, labelCalls } = run('TRIAGE: UNSURE - not sure what happened', 0)
    expect(comments).toHaveLength(0)
    expect(labelCalls).toHaveLength(0)
  })
})
