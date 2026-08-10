import fs from 'fs'
import path from 'path'

// ── agent-coordinator.sh: blocked-provider label (issue #168) ──
// `provider-unavailable` was the only terminal outcome that left no visible
// trace anywhere a human looks. These tests pin that a `blocked-provider`
// label is applied when the run fails safe due to the Anthropic API being
// unreachable, and cleared as soon as a later run's Claude call succeeds —
// so a stalled queue becomes visible without needing a new notification path.

describe('agent-coordinator.sh blocked-provider label', () => {
  const coordinatorSource = fs.readFileSync(path.join(__dirname, '../agent-coordinator.sh'), 'utf-8')

  it('labels the issue "blocked-provider" alongside restoring the trigger label', () => {
    const providerBranch = coordinatorSource.match(
      /if \[ \$RC -ne 0 \] && claude_provider_unavailable "\$CLAUDE_OUT"; then([\s\S]*?)\n    fi\n/
    )
    expect(providerBranch).not.toBeNull()
    const body = providerBranch![1]
    expect(body).toContain('github_label "$ISSUE_NUMBER" "$TRIGGER_LABEL"')
    expect(body).toContain('github_label "$ISSUE_NUMBER" "blocked-provider"')
  })

  it('clears "blocked-provider" once a run gets past the first successful Claude call', () => {
    // Guarded on RC -eq 0, ahead of the provider-unavailable check (which
    // only ever fires when RC is nonzero) — so any successful call clears it.
    const clearBranch = coordinatorSource.match(
      /if \[ \$RC -eq 0 \]; then\n\s*github_remove_label "\$ISSUE_NUMBER" "blocked-provider"\n\s*fi/
    )
    expect(clearBranch).not.toBeNull()
  })

  it('relies on the idempotent label API rather than adding new state to dedupe repeated outages', () => {
    // github_label/github_remove_label wrap gh_api, which does not branch on
    // HTTP status — POSTing an already-applied label or DELETEing an absent
    // one is a silent no-op, so retries every poll cycle during one outage
    // produce exactly one visible label change, not a stream of side effects.
    expect(coordinatorSource).toContain('github_label() {')
    expect(coordinatorSource).toContain('github_remove_label() {')
  })
})
