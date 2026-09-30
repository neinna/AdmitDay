import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'

// ── agent-coordinator.sh: review gate ───────────────────────────────────────
// Three gaps in review_change, fixed together:
// 1. The diff was cut at 60,000 bytes and still labelled "the complete diff",
//    so a large change could be approved on a partial view and auto-merge.
//    Now the reviewer is told it is truncated and given every changed file,
//    and an approval of a truncated diff escalates to a human.
// 2. Any "VERDICT: APPROVE" anywhere in the text counted as approval, even
//    quoted before a rejection. Now exactly one VERDICT line is allowed, at
//    the end (only the RISK line may follow); anything else is "malformed"
//    and escalates to a human.
// 3. review_change ran inside $(...), so its REVIEWER_RESULT assignment was
//    lost in the subshell and the run record said "not-run". It is now
//    called directly and sets REVIEW_TEXT / REVIEWER_RESULT in the caller.

const coordinatorPath = path.join(__dirname, '../agent-coordinator.sh')
const coordinatorSource = fs.readFileSync(coordinatorPath, 'utf-8')

function extractFunction(name: string): string {
  const marker = `${name}() {`
  const start = coordinatorSource.indexOf(marker)
  expect(start).toBeGreaterThan(-1)
  const end = coordinatorSource.indexOf('\n}\n', start)
  expect(end).toBeGreaterThan(start)
  return coordinatorSource.slice(start, end + 2)
}

function verdict(text: string): string {
  return execFileSync('bash', ['-c', `${extractFunction('review_verdict')}\nreview_verdict`], {
    input: text,
  })
    .toString()
    .trim()
}

describe('review_verdict', () => {
  it('approves a plain final APPROVE line', () => {
    expect(verdict('Looks right.\n\nVERDICT: APPROVE\n')).toBe('approve')
  })

  it('approves when only the RISK line follows', () => {
    expect(verdict('Fine.\nVERDICT: APPROVE\nRISK: LIVE-VERIFY-NEEDED')).toBe('approve')
  })

  it('tolerates markdown bold around the verdict line', () => {
    expect(verdict('Fine.\n**VERDICT: APPROVE**')).toBe('approve')
  })

  it('rejects a REJECT line with a reason', () => {
    expect(verdict('Scope creep.\nVERDICT: REJECT - edits unrelated files')).toBe('reject')
  })

  it('does not approve a quoted APPROVE followed by a REJECT', () => {
    expect(
      verdict('I nearly wrote\nVERDICT: APPROVE\nbut the tests are weakened.\nVERDICT: REJECT - tests weakened'),
    ).toBe('malformed')
  })

  it('does not approve APPROVE mentioned inside a sentence', () => {
    expect(verdict('I would say VERDICT: APPROVE if the tests imported the component.')).toBe('malformed')
  })

  it('treats a verdict followed by more prose as malformed', () => {
    expect(verdict('VERDICT: APPROVE\nActually, one more concern.')).toBe('malformed')
  })

  it('treats REJECT with no reason, or no verdict, as malformed', () => {
    expect(verdict('VERDICT: REJECT')).toBe('malformed')
    expect(verdict('No verdict here.')).toBe('malformed')
  })
})

describe('review_change (functional)', () => {
  function runReview(opts: { reviewText: string; diffBytes: number; maxBytes: number }) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'review-gate-'))
    const app = path.join(dir, 'app')
    fs.mkdirSync(app)
    const git = (...args: string[]) => execFileSync('git', args, { cwd: app, stdio: 'pipe' })
    git('init', '-q', '-b', 'main')
    git('config', 'user.email', 't@t')
    git('config', 'user.name', 't')
    fs.writeFileSync(path.join(app, 'a.txt'), 'base\n')
    git('add', '-A')
    git('commit', '-qm', 'base')
    git('update-ref', 'refs/remotes/origin/main', 'HEAD')
    git('checkout', '-qb', 'task')
    fs.writeFileSync(path.join(app, 'a.txt'), 'x'.repeat(opts.diffBytes) + '\n')
    git('commit', '-qam', 'change')

    const promptFile = path.join(dir, 'prompt.txt')
    const script = `
APP_DIR="${app}"
LOG_FILE="${path.join(dir, 'log')}"
REVIEW_DIFF_MAX_BYTES=${opts.maxBytes}
CLAUDE_REVIEW_MODEL=m; CLAUDE_REVIEW_MAX_USD=1; CLAUDE_REVIEW_FALLBACK_MODEL=""
log() { echo "$1" >> "$LOG_FILE"; }
lf_now_ns() { echo 1; }
lf_record() { :; }
claude_ran_on_fallback() { return 1; }
claude_json_field() { cat "${path.join(dir, 'review.txt')}"; }
run_claude() { printf '%s' "$PROMPT" > "${promptFile}"; return 0; }
${extractFunction('review_verdict')}
${extractFunction('review_change')}
caller() {
  local REVIEWER_RESULT="not-run" REVIEW_TEXT="" REVIEW_DIFF_BYTES=0
  review_change 1 "Title" "Body"
  local RC=$?
  echo "rc=$RC result=$REVIEWER_RESULT"
}
caller
`
    fs.writeFileSync(path.join(dir, 'review.txt'), opts.reviewText)
    const out = execFileSync('bash', ['-c', script]).toString().trim()
    return { out, prompt: fs.readFileSync(promptFile, 'utf-8') }
  }

  it('sets REVIEWER_RESULT in the caller instead of leaving not-run', () => {
    const { out } = runReview({ reviewText: 'ok\nVERDICT: APPROVE', diffBytes: 10, maxBytes: 60000 })
    expect(out).toBe('rc=0 result=approved')
  })

  it('records a rejection', () => {
    const { out } = runReview({ reviewText: 'VERDICT: REJECT - scope', diffBytes: 10, maxBytes: 60000 })
    expect(out).toBe('rc=1 result=rejected')
  })

  it('escalates a malformed verdict to a human', () => {
    const { out } = runReview({
      reviewText: 'VERDICT: APPROVE\nVERDICT: REJECT - no',
      diffBytes: 10,
      maxBytes: 60000,
    })
    expect(out).toBe('rc=2 result=malformed')
  })

  it('calls a small diff complete', () => {
    const { prompt } = runReview({ reviewText: 'VERDICT: APPROVE', diffBytes: 10, maxBytes: 60000 })
    expect(prompt).toContain('The complete diff against main:')
    expect(prompt).not.toContain('TRUNCATED')
  })

  it('tells the reviewer a large diff is truncated, lists the files, and escalates an approval', () => {
    const { out, prompt } = runReview({ reviewText: 'VERDICT: APPROVE', diffBytes: 5000, maxBytes: 1000 })
    expect(out).toBe('rc=2 result=approved-diff-truncated')
    expect(prompt).toContain('TRUNCATED')
    expect(prompt).toContain('a.txt')
    expect(prompt).not.toContain('The complete diff against main:')
  })
})

describe('run_agent call site', () => {
  it('calls review_change directly, not inside a command substitution', () => {
    expect(coordinatorSource).not.toMatch(/\$\(review_change /)
    expect(coordinatorSource).toMatch(/\n\s+review_change "\$ISSUE_NUMBER" "\$ISSUE_TITLE" "\$ISSUE_BODY"\n\s+local REVIEW_RC=\$\?/)
  })
})
