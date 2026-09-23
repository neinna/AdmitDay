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

// ── Coordinator's own halt log line names the provider's actual error ───────
// Issue #370: the coordinator's halt log line was a fixed sentence — "provider
// unavailable (billing, rate limit, or API outage)" — naming three possible
// causes and distinguishing none of them. On 2026-09-23 this line repeated 69
// times over ~12 hours while the real cause (a $160/$160 monthly spend cap,
// reported by the API as a 400 with a specific error.message) sat unlogged.
// The alert-issue comment path (#301) already carries the real reason and is
// untouched; this only covers the coordinator's own log() line.
describe('agent-coordinator.sh: provider error detail in the halt log line (issue #370)', () => {
  it('the provider-unavailable branch logs claude_provider_error_detail, not only the generic sentence unconditionally', () => {
    const fn = extractFunction('run_agent')
    expect(fn).toContain('claude_provider_error_detail')
    expect(fn).toMatch(/provider unavailable — \$\{PROVIDER_DETAIL\}/)
  })

  function runDetail(jsonBody: string, apiKey = 'sk-ant-test-secret-key'): string {
    const fn = extractFunction('claude_provider_error_detail')
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coord-detail-'))
    const outFile = path.join(dir, 'claude-out.json')
    fs.writeFileSync(outFile, jsonBody)
    const script = `
${fn}
ANTHROPIC_API_KEY="${apiKey}"
claude_provider_error_detail "${outFile}"
`
    const result = execFileSync('bash', ['-c', script], { encoding: 'utf-8' })
    fs.rmSync(dir, { recursive: true, force: true })
    return result.trim()
  }

  let dir: string

  afterEach(() => {
    if (dir && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
  })

  it('includes the captured HTTP status and the provider message verbatim, not just the generic sentence', () => {
    const detail = runDetail(
      JSON.stringify({
        is_error: true,
        terminal_reason: 'api_error',
        api_error_status: 400,
        result:
          'API Error: 400 You have reached your specified API usage limits. You will regain access on 2026-10-01 at 00:00 UTC.',
      })
    )
    expect(detail).toBe(
      'HTTP 400: You have reached your specified API usage limits. You will regain access on 2026-10-01 at 00:00 UTC.'
    )
    expect(detail).not.toMatch(/billing, rate limit, or API outage/)
  })

  it('extracts error.message verbatim out of an embedded raw provider JSON body', () => {
    const rawBody = JSON.stringify({
      type: 'error',
      error: {
        type: 'invalid_request_error',
        message: 'You have reached your specified API usage limits. You will regain access on 2026-10-01 at 00:00 UTC.',
      },
    })
    const detail = runDetail(
      JSON.stringify({
        is_error: true,
        terminal_reason: 'api_error',
        api_error_status: 400,
        result: `API Error: 400 ${rawBody} request_id: req_abc123`,
      })
    )
    expect(detail).toBe(
      'HTTP 400: You have reached your specified API usage limits. You will regain access on 2026-10-01 at 00:00 UTC.'
    )
  })

  it('truncates the provider message at 300 characters', () => {
    const longMessage = 'x'.repeat(400)
    const detail = runDetail(
      JSON.stringify({
        is_error: true,
        terminal_reason: 'api_error',
        api_error_status: 429,
        result: `API Error: 429 ${longMessage}`,
      })
    )
    const message = detail.replace(/^HTTP 429: /, '')
    expect(message.length).toBe(300)
    expect(message).toBe('x'.repeat(300))
  })

  it('never logs the API key, even when it appears verbatim in the captured output', () => {
    const apiKey = 'sk-ant-super-secret-value'
    const detail = runDetail(
      JSON.stringify({
        is_error: true,
        result: `API Error: 400 leaked key ${apiKey} in the message text`,
      }),
      apiKey
    )
    expect(detail).not.toContain(apiKey)
  })

  it('falls back to a raw excerpt (not the generic sentence, not empty) when the body cannot be parsed as JSON', () => {
    const raw = 'not json at all — connection reset by peer while reading response body ' + 'z'.repeat(400)
    const detail = runDetail(raw)
    expect(detail.length).toBeGreaterThan(0)
    expect(detail.length).toBeLessThanOrEqual(300)
    expect(detail).not.toMatch(/billing, rate limit, or API outage/)
    expect(detail).toMatch(/^not json at all/)
  })

  it('redacts the API key even in the raw-excerpt fallback for an unparseable body', () => {
    const apiKey = 'sk-ant-super-secret-value'
    const detail = runDetail(`not valid json, but it leaks ${apiKey} anyway`, apiKey)
    expect(detail).not.toContain(apiKey)
  })
})
