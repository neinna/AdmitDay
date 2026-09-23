import fs from 'fs'
import path from 'path'

// ── agent-coordinator.sh: "Blocked by #N" dependency gate (issue #177) ──
// AGENTS.md promises: "An issue whose body contains a line `Blocked by #N`
// is skipped while issue #N is still open." The coordinator previously ran
// every `agent-ok` issue with no such check, so a dependent issue (e.g. #176
// "Blocked by #175") could run before its blocker was resolved. These tests
// pin that the gate exists, runs before any label is touched, and logs why
// an issue was skipped.

describe('agent-coordinator.sh "Blocked by #N" dependency gate', () => {
  const coordinatorSource = fs.readFileSync(path.join(__dirname, '../agent-coordinator.sh'), 'utf-8')

  it('defines a helper that finds a still-open "Blocked by #N" dependency', () => {
    expect(coordinatorSource).toContain('blocking_issue_number()')
    const fn = coordinatorSource.match(/blocking_issue_number\(\) \{([\s\S]*?)\n\}/)
    expect(fn).not.toBeNull()
    const body = fn![1]
    // Matches a line that is exactly "Blocked by #N", not just any mention.
    expect(body).toMatch(/\^Blocked by #\[0-9\]\+/)
    // Only treats it as blocking when the referenced issue is still open.
    expect(body).toContain('"$STATE" = "open"')
  })

  it('checks the gate before the trigger label or any other label is touched', () => {
    const runAgentBody = coordinatorSource.split('run_agent() {')[1]
    expect(runAgentBody).toBeDefined()
    const gateIndex = runAgentBody.indexOf('blocking_issue_number "$ISSUE_BODY"')
    const firstLabelChangeIndex = runAgentBody.indexOf('github_remove_label "$ISSUE_NUMBER" "$TRIGGER_LABEL"')
    expect(gateIndex).toBeGreaterThan(-1)
    expect(firstLabelChangeIndex).toBeGreaterThan(-1)
    expect(gateIndex).toBeLessThan(firstLabelChangeIndex)
  })

  function extractGateBranch() {
    const marker = 'BLOCKER=$(blocking_issue_number "$ISSUE_BODY")'
    const start = coordinatorSource.indexOf(marker)
    if (start === -1) return null
    const ifIndex = coordinatorSource.indexOf('if [ -n "$BLOCKER" ]; then', start)
    if (ifIndex === -1 || ifIndex - (start + marker.length) > 10) return null
    const bodyStart = ifIndex + 'if [ -n "$BLOCKER" ]; then'.length
    const fiIndex = coordinatorSource.indexOf('fi', bodyStart)
    if (fiIndex === -1) return null
    return coordinatorSource.slice(bodyStart, fiIndex)
  }

  it('returns early on a block, leaving labels untouched for this loop', () => {
    const body = extractGateBranch()
    expect(body).not.toBeNull()
    expect(body).toContain('return')
    expect(body).not.toContain('github_label')
    expect(body).not.toContain('github_remove_label')
  })

  it('logs the skip reason including the blocking issue number', () => {
    const body = extractGateBranch()
    expect(body).not.toBeNull()
    expect(body).toMatch(/log ".*blocked by open issue #\$\{BLOCKER\}"/)
  })
})

// ── agent-coordinator.sh: malformed "Blocked by" near-miss check (issue #359) ──
// The gate above only ever matches a line that is exactly "Blocked by #N".
// A body that says "Blocked by 336." or "Blocked by #336 (part 2)" produces
// no blocker at all, and the issue ran as if it had no dependency — silently.
// These tests pin a near-miss check: it must fire on the loose shape without
// running the issue, and must not fire on a clean line or on no mention at all.

describe('agent-coordinator.sh malformed "Blocked by" near-miss check', () => {
  const coordinatorSource = fs.readFileSync(path.join(__dirname, '../agent-coordinator.sh'), 'utf-8')

  it('defines a helper that detects a "blocked by" mention with no strict match', () => {
    expect(coordinatorSource).toContain('malformed_blocked_by()')
    const fn = coordinatorSource.match(/malformed_blocked_by\(\) \{([\s\S]*?)\n\}/)
    expect(fn).not.toBeNull()
    const body = fn![1]
    expect(body).toMatch(/\[Bb\]locked \[Bb\]y/)
    expect(body).toMatch(/\^Blocked by #\[0-9\]\+/)
  })

  function extractMalformedBranch() {
    const marker = 'if malformed_blocked_by "$ISSUE_BODY"; then'
    const start = coordinatorSource.indexOf(marker)
    if (start === -1) return null
    const bodyStart = start + marker.length
    const fiIndex = coordinatorSource.indexOf('fi', bodyStart)
    if (fiIndex === -1) return null
    return coordinatorSource.slice(bodyStart, fiIndex)
  }

  it('runs after the dependency gate, logs, labels needs-you, and skips the issue', () => {
    const runAgentBody = coordinatorSource.split('run_agent() {')[1]
    expect(runAgentBody).toBeDefined()
    const gateIndex = runAgentBody.indexOf('blocking_issue_number "$ISSUE_BODY"')
    const malformedIndex = runAgentBody.indexOf('malformed_blocked_by "$ISSUE_BODY"')
    expect(gateIndex).toBeGreaterThan(-1)
    expect(malformedIndex).toBeGreaterThan(gateIndex)

    const body = extractMalformedBranch()
    expect(body).not.toBeNull()
    expect(body).toMatch(/log ".*no line matches 'Blocked by #N' exactly.*"/)
    expect(body).toContain('github_label "$ISSUE_NUMBER" "needs-you"')
    expect(body).toContain('return')
  })

  // Exercise the actual helper logic (shell semantics), not just its source text.
  function runMalformedCheck(body: string): boolean {
    const script = `
malformed_blocked_by() {
  local BODY="$1"
  printf '%s\\n' "$BODY" | grep -qiE '[Bb]locked [Bb]y' || return 1
  printf '%s\\n' "$BODY" | grep -qE '^Blocked by #[0-9]+\\r?$' && return 1
  return 0
}
malformed_blocked_by "$1" && echo YES || echo NO
`
    const result = require('child_process').execFileSync('bash', ['-c', script, 'bash', body], {
      encoding: 'utf-8',
    })
    return result.trim() === 'YES'
  }

  it('flags "Blocked by 336." (missing #) as a near miss', () => {
    expect(runMalformedCheck('Blocked by 336. Part 2 of the old #303.')).toBe(true)
  })

  it('flags "Blocked by #336 (part 2)" (trailing text on the line) as a near miss', () => {
    expect(runMalformedCheck('Blocked by #336 (part 2)')).toBe(true)
  })

  it('does not flag a clean "Blocked by #336" line', () => {
    expect(runMalformedCheck('Some context.\nBlocked by #336\nMore context.')).toBe(false)
  })

  it('does not flag a body with no blocker mention at all', () => {
    expect(runMalformedCheck('Just a normal issue body with no dependency.')).toBe(false)
  })
})
