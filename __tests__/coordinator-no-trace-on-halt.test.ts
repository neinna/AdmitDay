import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'

// ── agent-coordinator.sh: don't trace runs where the model was never called
// (issue #318) ────────────────────────────────────────────────────────────
// Observed 2026-09-22: on one day Langfuse recorded 62 zero-cost "agent-run"
// traces with outcome provider-unavailable against 11 real runs. Each no-op
// halt still wrote an "implement" observation at $0, so every average,
// median and count on the dashboard was diluted about 6:1. Langfuse has no
// cost/level filter column, so this can only be fixed at the source: when a
// run ends on the provider-halt path ("Work was never attempted; restoring
// the issue to the queue"), the coordinator must submit no trace at all. The
// halt streak counter (record_provider_halt) and the alert issue (#263/#301)
// already record those events, so nothing observability-relevant is lost.
//
// Every run where the model WAS called — including failures and budget
// exhaustion — must keep tracing, since that is real spend.

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

describe('agent-coordinator.sh: source checks on which branches trace', () => {
  it('defines lf_discard, which drops the run buffer without invoking the trace script', () => {
    const fn = extractFunction('lf_discard')
    expect(fn).not.toContain('LF_TRACE_SCRIPT')
    expect(fn).toMatch(/rm -f "\$RUN_FILE"/)
  })

  it('the provider-unavailable ("Work was never attempted") branch calls lf_discard, not lf_emit', () => {
    const body = runAgentBody()
    const start = body.indexOf('claude_provider_unavailable "$CLAUDE_OUT"')
    const end = body.indexOf('return 75', start)
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    const block = body.slice(start, end)
    expect(block).toContain('Work was never attempted')
    expect(block).toContain('lf_discard')
    expect(block).not.toContain('lf_emit')
  })

  it('the budget-exhausted branch (model was called, budget cap hit) still calls lf_emit', () => {
    const body = runAgentBody()
    const start = body.indexOf('claude_budget_exhausted "$CLAUDE_OUT"')
    const end = body.indexOf('return 0', start)
    expect(start).toBeGreaterThan(-1)
    const block = body.slice(start, end)
    expect(block).toContain('lf_emit')
  })

  it('the "failed after 2 attempts" path falls through to the final lf_emit call', () => {
    const body = runAgentBody()
    const start = body.indexOf('failed after 2 attempts, labeled agent-stuck')
    expect(start).toBeGreaterThan(-1)
    const tail = body.slice(start)
    expect(tail).toContain('lf_emit "$ISSUE_NUMBER"')
  })
})

describe('lf_record / lf_emit / lf_discard (functional): halt submits nothing, a real failure still does', () => {
  let dir: string
  let logFile: string
  let callsFile: string
  let stubScript: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coord-notrace-'))
    logFile = path.join(dir, 'coordinator.log')
    callsFile = path.join(dir, 'trace-calls.jsonl')
    fs.writeFileSync(logFile, '')
    fs.writeFileSync(callsFile, '')
    // Stand-in for scripts/langfuse_trace.py: records that it was invoked,
    // and with what payload, instead of talking to Langfuse.
    stubScript = path.join(dir, 'fake_langfuse_trace.py')
    fs.writeFileSync(
      stubScript,
      `import sys
with open(${JSON.stringify(callsFile)}, 'a') as f:
    f.write(sys.stdin.read() + '\\n')
`,
    )
  })

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

  function callsSubmitted(): any[] {
    return fs
      .readFileSync(callsFile, 'utf-8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l))
  }

  function script(body: string): string {
    const fns = ['lf_now_ns', 'lf_record', 'lf_emit', 'lf_discard'].map(extractFunction).join('\n\n')
    return `
LOG_FILE="${logFile}"
LF_TRACE_SCRIPT="${stubScript}"
LF_TRACE_PYTHON="python3"
RUN_METADATA_DIR=""
GITHUB_REPO="test/repo"
log() { :; }
${fns}
LF_RUN_FILE="${path.join(dir, 'lf-run.jsonl')}"
: > "$LF_RUN_FILE"
${body}
`
  }

  it('provider-unavailable halt: lf_record + lf_discard submits no trace at all', () => {
    execFileSync(
      'bash',
      [
        '-c',
        script(`
lf_record "implement" "1000" "2000" "0" "" "1"
lf_discard
`),
      ],
      { cwd: dir, encoding: 'utf-8' },
    )
    expect(callsSubmitted()).toEqual([])
    expect(fs.existsSync(path.join(dir, 'lf-run.jsonl'))).toBe(false)
  })

  it('a failed-but-attempted run: lf_record + lf_emit still submits exactly one trace', () => {
    execFileSync(
      'bash',
      [
        '-c',
        script(`
lf_record "implement" "1000" "2000" "0" "" "1"
lf_emit "318" "Some issue" "task-318-x" "failed" "1" "agent-stuck" "1000" "2000" "not-run" "not-run" "not-run" "not-attempted"
`),
      ],
      { cwd: dir, encoding: 'utf-8' },
    )
    const calls = callsSubmitted()
    expect(calls.length).toBe(1)
    expect(calls[0].trace.outcome).toBe('failed')
    expect(calls[0].trace.issue_number).toBe(318)
    expect(fs.existsSync(path.join(dir, 'lf-run.jsonl'))).toBe(false)
  })
})
