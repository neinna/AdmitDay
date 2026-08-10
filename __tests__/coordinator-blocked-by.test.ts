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
