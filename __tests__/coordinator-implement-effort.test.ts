import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'

// ── agent-coordinator.sh: run attempt 1 at low effort, retry at default
// (issue #449) ───────────────────────────────────────────────────────────
// `run_claude` only ever built its argv from --model and --max-budget-usd.
// The claude CLI also accepts --effort, which scales deliberation and tool
// calls. Anthropic's published result for "everything at low, re-run only
// failures at default" was the same pass rate for half the cost. The
// coordinator's existing two-attempt loop (fresh session on retry, issue
// #207) is exactly the structure that pattern needs: attempt 1 runs at
// CLAUDE_IMPLEMENT_EFFORT_FIRST (low by default), attempt 2 — a fresh
// session, so changing effort there does not invalidate any prompt cache —
// runs at CLAUDE_IMPLEMENT_EFFORT_RETRY (empty/default).
//
// These tests pin: (1) a non-empty effort setting puts --effort <value> in
// the argv passed to the claude CLI, and an empty one omits the flag
// entirely; (2) attempt 1 uses CLAUDE_IMPLEMENT_EFFORT_FIRST and attempt 2
// uses CLAUDE_IMPLEMENT_EFFORT_RETRY; (3) the review, planner and triage
// call sites pass no effort flag; (4) both effort values reach the
// Langfuse trace metadata.

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

describe('run_claude (functional): --effort argument', () => {
  let workDir: string
  let binDir: string
  let argsFile: string
  let logFile: string
  let outFile: string

  beforeEach(() => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'coord-effort-'))
    binDir = path.join(workDir, 'bin')
    fs.mkdirSync(binDir)
    argsFile = path.join(workDir, 'claude-args')
    logFile = path.join(workDir, 'coordinator.log')
    outFile = path.join(workDir, 'claude-out.json')
    fs.writeFileSync(logFile, '')

    const claudeStub = `#!/bin/sh
printf '%s\\n' "$@" > "${argsFile}"
echo '{"is_error": false, "result": "ok", "model": "claude-sonnet-5"}'
`
    fs.writeFileSync(path.join(binDir, 'claude'), claudeStub, { mode: 0o755 })
  })

  afterEach(() => fs.rmSync(workDir, { recursive: true, force: true }))

  function callRunClaude(effort: string): string {
    const fnBody = extractFunction('run_claude')
    const script = `
CLAUDE_TIMEOUT=5
LOG_FILE="${logFile}"
ANTHROPIC_API_KEY="test"
PROMPT="hello"
${fnBody}
run_claude "${outFile}" "" "Read" "sonnet" "" "" "${effort}"
`
    execFileSync('bash', ['-c', script], {
      env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` },
      encoding: 'utf-8',
    })
    return fs.readFileSync(argsFile, 'utf-8')
  }

  it('puts --effort <value> in the argument list when the setting is non-empty', () => {
    const args = callRunClaude('low')
    expect(args).toContain('--effort\nlow')
  })

  it('omits --effort entirely when the setting is empty', () => {
    const args = callRunClaude('')
    expect(args).not.toContain('--effort')
  })
})

describe('run_claude signature: seventh positional parameter is the effort level', () => {
  it('defaults EFFORT to empty and only appends the flag when set', () => {
    const body = extractFunction('run_claude')
    expect(body).toContain('local EFFORT="${7:-}"')
    expect(body).toContain('if [ -n "$EFFORT" ]; then')
    expect(body).toContain('--effort "$EFFORT"')
  })
})

describe('agent-coordinator.sh: implement effort settings', () => {
  // `-` not `:-` on EFFORT_FIRST: an operator who sets it to EMPTY means "no
  // --effort flag", and `:-` would silently turn that back into "low" — the
  // same fault #454 fixed for other settings.
  it('defaults EFFORT_FIRST to "low" when unset via `-`, and EFFORT_RETRY to empty via `:-`', () => {
    expect(coordinatorSource).toMatch(
      /CLAUDE_IMPLEMENT_EFFORT_FIRST="\$\{CLAUDE_IMPLEMENT_EFFORT_FIRST-low\}"/,
    )
    expect(coordinatorSource).not.toMatch(/CLAUDE_IMPLEMENT_EFFORT_FIRST="\$\{CLAUDE_IMPLEMENT_EFFORT_FIRST:-low\}"/)
    expect(coordinatorSource).toMatch(
      /CLAUDE_IMPLEMENT_EFFORT_RETRY="\$\{CLAUDE_IMPLEMENT_EFFORT_RETRY:-\}"/,
    )
  })

  it.each([
    ['unset', '', 'low'],
    ['empty', 'CLAUDE_IMPLEMENT_EFFORT_FIRST=', ''],
    ['set', 'CLAUDE_IMPLEMENT_EFFORT_FIRST=high', 'high'],
  ])('resolves CLAUDE_IMPLEMENT_EFFORT_FIRST for %s -> %s', (_label, assignment, expected) => {
    const line = coordinatorSource
      .split('\n')
      .find((l) => l.startsWith('CLAUDE_IMPLEMENT_EFFORT_FIRST='))
    expect(line).toBeDefined()
    const out = execFileSync(
      '/bin/sh',
      ['-c', `${assignment ? assignment + '; ' : ''}${line}; printf '%s' "$CLAUDE_IMPLEMENT_EFFORT_FIRST"`],
      { encoding: 'utf-8' },
    )
    expect(out).toBe(expected)
  })

  it('resolves CLAUDE_IMPLEMENT_EFFORT_RETRY to empty when unset', () => {
    const line = coordinatorSource
      .split('\n')
      .find((l) => l.startsWith('CLAUDE_IMPLEMENT_EFFORT_RETRY='))
    expect(line).toBeDefined()
    const out = execFileSync(
      '/bin/sh',
      ['-c', `${line}; printf '%s' "$CLAUDE_IMPLEMENT_EFFORT_RETRY"`],
      { encoding: 'utf-8' },
    )
    expect(out).toBe('')
  })
})

describe('agent-coordinator.sh: attempt 1 uses EFFORT_FIRST, attempt 2 uses EFFORT_RETRY', () => {
  it('selects CLAUDE_IMPLEMENT_EFFORT_FIRST on attempt 1 and CLAUDE_IMPLEMENT_EFFORT_RETRY otherwise', () => {
    const body = runAgentBody()
    const loopStart = body.indexOf('while [ $ATTEMPT -le 2 ]; do')
    const loopBody = body.slice(loopStart, body.indexOf('run_claude "$CLAUDE_OUT"'))
    expect(loopBody).toContain('if [ $ATTEMPT -eq 1 ]; then')
    expect(loopBody).toContain('IMPLEMENT_EFFORT="$CLAUDE_IMPLEMENT_EFFORT_FIRST"')
    expect(loopBody).toContain('IMPLEMENT_EFFORT="$CLAUDE_IMPLEMENT_EFFORT_RETRY"')
  })

  it('passes IMPLEMENT_EFFORT as the 7th argument to run_claude at the implement call site', () => {
    expect(coordinatorSource).toContain(
      '"Bash,Read,Write,Edit,Glob,Grep,WebFetch,WebSearch" "$CLAUDE_IMPLEMENT_MODEL" "$CLAUDE_IMPLEMENT_MAX_USD" "$CLAUDE_IMPLEMENT_FALLBACK_MODEL" "$IMPLEMENT_EFFORT"',
    )
  })

  it('logs the effort level used on attempt 1', () => {
    expect(coordinatorSource).toMatch(
      /agent attempt \$\{ATTEMPT\} \(effort \$\{IMPLEMENT_EFFORT:-default\}\)/,
    )
  })

  it('never changes effort inside a single run_claude call — EFFORT is fixed once per attempt before the call, not derived from ATTEMPT inside run_claude itself', () => {
    const runClaudeBody = extractFunction('run_claude')
    expect(runClaudeBody).not.toMatch(/ATTEMPT/)
  })
})

describe('agent-coordinator.sh: review, planner and triage call sites pass no effort flag', () => {
  it('review, planner and triage run_claude calls have no 7th argument', () => {
    expect(coordinatorSource).toContain(
      'run_claude "$REVIEW_OUT" "" "Read,Glob,Grep" "$CLAUDE_REVIEW_MODEL" "$CLAUDE_REVIEW_MAX_USD" "$CLAUDE_REVIEW_FALLBACK_MODEL"',
    )
    expect(coordinatorSource).toContain(
      'run_claude "$PLAN_OUT" "" "Read,Glob,Grep" "$CLAUDE_PLANNER_MODEL" "$CLAUDE_PLANNER_MAX_USD"',
    )
    expect(coordinatorSource).toContain(
      'run_claude "$TRIAGE_OUT" "" "Read,Glob,Grep" "sonnet" "${CLAUDE_TRIAGE_MAX_USD}"',
    )
  })
})

describe('agent-coordinator.sh: effort values reach the Langfuse trace metadata', () => {
  it('lf_emit forwards its 14th/15th arguments as LF_EFFORT_FIRST/LF_EFFORT_RETRY', () => {
    expect(coordinatorSource).toContain('LF_EFFORT_FIRST="${14:-}" LF_EFFORT_RETRY="${15:-}"')
    expect(coordinatorSource).toContain('"effort_first": os.environ.get("LF_EFFORT_FIRST") or None,')
    expect(coordinatorSource).toContain('"effort_retry": os.environ.get("LF_EFFORT_RETRY") or None,')
  })

  it('all three lf_emit call sites in run_agent pass the effort settings', () => {
    const body = runAgentBody()
    const emitCalls = (body.match(/lf_emit "\$ISSUE_NUMBER"[\s\S]*?\n.*?\n.*?(?="\)|\n)/g) || [])
    // Simpler: just assert the literal trailing args appear exactly 3 times.
    const occurrences = body.split('"$CLAUDE_IMPLEMENT_EFFORT_FIRST" "$CLAUDE_IMPLEMENT_EFFORT_RETRY"').length - 1
    expect(occurrences).toBe(3)
    expect(emitCalls.length).toBeGreaterThan(0)
  })

  it('functionally: build_payload carries effort_first/effort_retry through to the emitted trace', () => {
    const script = `
import json, sys
sys.path.insert(0, "scripts")
import langfuse_trace as lt
trace, spans, t_start, t_end = lt.build_payload({"trace": {"issue_number": 449, "outcome": "success", "effort_first": "low", "effort_retry": ""}})
print(json.dumps(trace))
`
    const out = execFileSync('python3', ['-c', script], { cwd: path.join(__dirname, '..') }).toString()
    const trace = JSON.parse(out)
    expect(trace.effort_first).toBe('low')
  })
})
