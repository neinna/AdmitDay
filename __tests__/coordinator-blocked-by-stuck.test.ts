import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'

// ── agent-coordinator.sh: agent-stuck blocker breaks the dependency deadlock (issue #429) ──
// The "Blocked by #N" gate (see coordinator-blocked-by.test.ts) leaves a
// blocked issue "agent-ok" so it becomes eligible again once its blocker
// closes. That is correct when the blocker is merely open, but an
// agent-stuck blocker never closes on its own: #405 went agent-stuck and
// #406-#408 each logged "skipping this loop" once a minute for eleven hours
// with nothing else queued. These tests pin that an agent-stuck blocker is
// handled once — relabel to "blocked" and comment — instead of polled
// forever, while a merely-open blocker is still left completely untouched.

describe('agent-coordinator.sh dependency gate: agent-stuck blocker', () => {
  const coordinatorSource = fs.readFileSync(path.join(__dirname, '../agent-coordinator.sh'), 'utf-8')

  it('defines a helper that checks whether the blocker issue carries the agent-stuck label', () => {
    expect(coordinatorSource).toContain('blocker_is_agent_stuck()')
    const fn = coordinatorSource.match(/blocker_is_agent_stuck\(\) \{([\s\S]*?)\n\}/)
    expect(fn).not.toBeNull()
    const body = fn![1]
    expect(body).toContain("'agent-stuck' in names")
  })

  // Extracts the full "if [ -n "$BLOCKER" ]; then ... fi" gate from run_agent,
  // matching nested if/fi pairs by depth rather than the first "fi" substring
  // (the gate now nests a second if/fi inside it), so this reflects the
  // whole branch instead of truncating at the first inner "fi".
  function extractGate(): string | null {
    const marker = 'BLOCKER=$(blocking_issue_number "$ISSUE_BODY")'
    const start = coordinatorSource.indexOf(marker)
    if (start === -1) return null
    const ifStart = coordinatorSource.indexOf('if [ -n "$BLOCKER" ]; then', start)
    if (ifStart === -1 || ifStart - (start + marker.length) > 10) return null
    const rest = coordinatorSource.slice(ifStart)
    const tokenRe = /\bif\b|\bfi\b/g
    let depth = 0
    let m: RegExpExecArray | null
    let endIdx = -1
    while ((m = tokenRe.exec(rest))) {
      if (m[0] === 'if') {
        depth++
      } else {
        depth--
        if (depth === 0) {
          endIdx = m.index + 2
          break
        }
      }
    }
    if (endIdx === -1) return null
    return rest.slice(0, endIdx)
  }

  it('nests the not-agent-stuck case first, unchanged: log and return, no label or comment calls', () => {
    const gate = extractGate()
    expect(gate).not.toBeNull()
    expect(gate).toContain('if ! blocker_is_agent_stuck "$BLOCKER"; then')
    const notStuckBranch = gate!.slice(
      gate!.indexOf('if ! blocker_is_agent_stuck "$BLOCKER"; then'),
      gate!.indexOf('\n    fi', gate!.indexOf('if ! blocker_is_agent_stuck "$BLOCKER"; then'))
    )
    expect(notStuckBranch).toMatch(/log ".*blocked by open issue #\$\{BLOCKER\}"/)
    expect(notStuckBranch).toContain('return')
    expect(notStuckBranch).not.toContain('github_label')
    expect(notStuckBranch).not.toContain('github_remove_label')
    expect(notStuckBranch).not.toContain('github_comment')
  })

  it('handles the agent-stuck case exactly once: relabels agent-ok to blocked and comments once', () => {
    const gate = extractGate()
    expect(gate).not.toBeNull()
    const removeMatches = gate!.match(/github_remove_label "\$ISSUE_NUMBER" "\$TRIGGER_LABEL"/g) || []
    const labelMatches = gate!.match(/github_label "\$ISSUE_NUMBER" "blocked"/g) || []
    const commentMatches = gate!.match(/github_comment "\$ISSUE_NUMBER"/g) || []
    expect(removeMatches).toHaveLength(1)
    expect(labelMatches).toHaveLength(1)
    expect(commentMatches).toHaveLength(1)
  })

  it('posts the exact required comment text', () => {
    const gate = extractGate()
    expect(gate).not.toBeNull()
    expect(gate).toContain(
      'Waiting on #${BLOCKER}, which is agent-stuck. Removed from the queue so the coordinator does not poll it every minute. Re-add agent-ok once #${BLOCKER} is resolved.'
    )
  })

  it('never touches the blocker issue itself: no label change or comment targets $BLOCKER', () => {
    const gate = extractGate()
    expect(gate).not.toBeNull()
    expect(gate).not.toMatch(/github_(remove_)?label "\$BLOCKER"/)
    expect(gate).not.toMatch(/github_comment "\$BLOCKER"/)
  })

  // Exercise the actual gate logic (shell semantics), not just its source
  // text, with blocker_is_agent_stuck stubbed to force each branch.
  function runGate(stuckExitCode: 0 | 1): { calls: string; reachedAfter: boolean } {
    const gate = extractGate()
    if (gate === null) throw new Error('could not extract gate')
    const script = `
CALLS=""
log() { CALLS="\${CALLS}LOG:$1|"; }
github_remove_label() { CALLS="\${CALLS}REMOVE:$1:$2|"; }
github_label() { CALLS="\${CALLS}LABEL:$1:$2|"; }
github_comment() { CALLS="\${CALLS}COMMENT:$1:$2|"; }
blocker_is_agent_stuck() { return ${stuckExitCode}; }
ISSUE_NUMBER="406"
TRIGGER_LABEL="agent-ok"
BLOCKER="405"
gate() {
${gate}
  echo "REACHED_AFTER_GATE"
}
gate
printf '%s' "$CALLS"
`
    const out = execFileSync('bash', ['-c', script], { encoding: 'utf-8' })
    return { calls: out, reachedAfter: out.includes('REACHED_AFTER_GATE') }
  }

  it('open, not agent-stuck: leaves the child untouched (only logs, returns before running)', () => {
    const { calls, reachedAfter } = runGate(1)
    expect(reachedAfter).toBe(false)
    expect(calls).toContain('LOG:')
    expect(calls).not.toContain('REMOVE:')
    expect(calls).not.toContain('LABEL:')
    expect(calls).not.toContain('COMMENT:')
  })

  it('open and agent-stuck: relabels agent-ok to blocked and comments exactly once, then returns', () => {
    const { calls, reachedAfter } = runGate(0)
    expect(reachedAfter).toBe(false)
    expect(calls.match(/REMOVE:406:agent-ok\|/g) || []).toHaveLength(1)
    expect(calls.match(/LABEL:406:blocked\|/g) || []).toHaveLength(1)
    expect(calls.match(/COMMENT:406:/g) || []).toHaveLength(1)
    expect(calls).toContain('COMMENT:406:Waiting on #405, which is agent-stuck.')
  })
})
