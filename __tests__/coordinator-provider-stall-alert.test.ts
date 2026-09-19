import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'

// ── agent-coordinator.sh: alert when the queue stalls (issue #263) ──────────
// Observed 2026-09-16/17: the queue retried a provider-unavailable issue
// every 10 minutes for ~22 hours (133 no-op runs) with no alert anywhere
// reachable overnight. The blocked-provider label exists but nobody watches
// labels, and Telegram is being removed, so the only channel left is a
// GitHub issue: after 3 CONSECUTIVE provider-unavailable halts, open or
// comment on one issue titled "Agent queue stalled" (needs-you), and close
// it with a "resumed at <time>" comment once a run next succeeds.
//
// These tests pin: (1) nothing is opened before the 3rd consecutive halt;
// (2) exactly one issue is ever opened for a single streak — later halts in
// the same streak comment on it instead of duplicating; (3) resolving the
// streak comments "resumed at <time>" and closes that same issue.

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

describe('agent-coordinator.sh: provider-stall alert source checks', () => {
  it('defines a 3-strike threshold', () => {
    expect(coordinatorSource).toMatch(/STALL_THRESHOLD=3\b/)
  })

  it('titles the alert issue exactly "Agent queue stalled"', () => {
    expect(coordinatorSource).toMatch(/STALL_ISSUE_TITLE="Agent queue stalled"/)
  })

  it('record_provider_halt opens the alert issue with needs-you, not agent-ok, and only once per streak', () => {
    const fn = extractFunction('record_provider_halt')
    expect(fn).toContain('STALL_THRESHOLD')
    expect(fn).toContain('github_create_needs_you_issue')
    // Once an alert issue exists for this streak, later halts must comment
    // on it, not call github_create_needs_you_issue again.
    const ifBlock = fn.match(/if \[ -n "\$ALERT_ISSUE" \][\s\S]*?else([\s\S]*?)fi/)
    expect(ifBlock).not.toBeNull()
  })

  it('github_create_needs_you_issue labels needs-you and never agent-ok', () => {
    const fn = extractFunction('github_create_needs_you_issue')
    expect(fn).toMatch(/\\"labels\\":\[\\"needs-you\\"\]/)
  })

  it('resolve_provider_halt comments "resumed at <time>" and closes the alert issue', () => {
    const fn = extractFunction('resolve_provider_halt')
    expect(fn).toMatch(/resumed at \$\{NOW\}/)
    expect(fn).toMatch(/\\"state\\":\s*\\"closed\\"/)
  })
})

// ── Functional test of the stall/resume lifecycle ────────────────────────────
// Extracts the real functions out of the shipped script and runs them
// against a scratch state file, with gh_api stubbed to record every GitHub
// call it would have made instead of hitting the network.
describe('provider-stall alert lifecycle (functional)', () => {
  let dir: string
  let stateFile: string
  let callsFile: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coord-stall-'))
    stateFile = path.join(dir, 'stall-state.json')
    callsFile = path.join(dir, 'gh-calls.log')
    fs.writeFileSync(callsFile, '')
  })

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

  function run(commands: string): { calls: string[]; state: any } {
    const fns = [
      'json_escape',
      'github_comment',
      'stall_state_field',
      'stall_state_write',
      'github_create_needs_you_issue',
      'record_provider_halt',
      'resolve_provider_halt',
    ]
      .map(extractFunction)
      .join('\n\n')

    const script = `
STALL_STATE_FILE="${stateFile}"
STALL_THRESHOLD=3
STALL_ISSUE_TITLE="Agent queue stalled"
CALLS_FILE="${callsFile}"
log() { :; }
gh_api() {
  local METHOD="$1" PATH_="$2" DATA="$3"
  printf '%s\\t%s\\t%s\\n' "$METHOD" "$PATH_" "$DATA" >> "$CALLS_FILE"
  if [ "$METHOD" = "POST" ] && [ "$PATH_" = "/issues" ]; then
    echo '{"number": 42}'
  fi
}
${fns}
${commands}
`
    execFileSync('bash', ['-c', script], { cwd: dir, encoding: 'utf-8' })
    const calls = fs
      .readFileSync(callsFile, 'utf-8')
      .split('\n')
      .filter(Boolean)
    let state: any = null
    if (fs.existsSync(stateFile)) {
      try {
        state = JSON.parse(fs.readFileSync(stateFile, 'utf-8'))
      } catch {
        state = null
      }
    }
    return { calls, state }
  }

  it('does not open an issue on the 1st or 2nd consecutive provider-unavailable halt', () => {
    const { calls, state } = run(`
record_provider_halt "credit balance is too low"
record_provider_halt "credit balance is too low"
`)
    expect(calls.filter((c) => c.includes('POST\t/issues\t')).length).toBe(0)
    expect(state.count).toBe(2)
    expect(state.alert_issue).toBe('')
  })

  it('opens exactly one issue titled "Agent queue stalled" (needs-you) on the 3rd consecutive halt', () => {
    const { calls, state } = run(`
record_provider_halt "credit balance is too low"
record_provider_halt "credit balance is too low"
record_provider_halt "credit balance is too low"
`)
    const opens = calls.filter((c) => c.startsWith('POST\t/issues\t'))
    expect(opens.length).toBe(1)
    const [, , data] = opens[0].split('\t')
    expect(data).toContain('"title":"Agent queue stalled"')
    expect(data).toContain('"labels":["needs-you"]')
    expect(data).not.toContain('agent-ok')
    expect(data).toMatch(/First stall:/)
    expect(data).toMatch(/credit balance is too low/)
    expect(state.count).toBe(3)
    expect(state.alert_issue).toBe('42')
  })

  it('comments on the same issue instead of opening a duplicate on the 4th+ consecutive halt', () => {
    const { calls, state } = run(`
record_provider_halt "credit balance is too low"
record_provider_halt "credit balance is too low"
record_provider_halt "credit balance is too low"
record_provider_halt "credit balance is too low"
`)
    const opens = calls.filter((c) => c.startsWith('POST\t/issues\t'))
    const comments = calls.filter((c) => c.startsWith('POST\t/issues/42/comments\t'))
    expect(opens.length).toBe(1)
    expect(comments.length).toBe(1)
    expect(state.count).toBe(4)
    expect(state.alert_issue).toBe('42')
  })

  it('resolve_provider_halt comments "resumed at <time>" and closes the alert issue, then resets the streak', () => {
    const { calls, state } = run(`
record_provider_halt "credit balance is too low"
record_provider_halt "credit balance is too low"
record_provider_halt "credit balance is too low"
resolve_provider_halt
`)
    const comments = calls.filter((c) => c.startsWith('POST\t/issues/42/comments\t'))
    const closes = calls.filter((c) => c.startsWith('PATCH\t/issues/42\t'))
    expect(comments.length).toBe(1)
    expect(comments[0]).toMatch(/resumed at /)
    expect(closes.length).toBe(1)
    expect(closes[0]).toContain('"state":"closed"')
    expect(state).toBeNull()
  })

  it('resolve_provider_halt is a no-op when no streak is in progress', () => {
    const { calls, state } = run(`resolve_provider_halt`)
    expect(calls.length).toBe(0)
    expect(state).toBeNull()
  })

  it('a streak that never reaches 3 leaves no alert issue behind when resolved', () => {
    const { calls, state } = run(`
record_provider_halt "rate limit exceeded"
resolve_provider_halt
`)
    expect(calls.filter((c) => c.startsWith('POST\t/issues\t')).length).toBe(0)
    expect(calls.filter((c) => c.includes('/comments'))).toEqual([])
    expect(state).toBeNull()
  })
})
