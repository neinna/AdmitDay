import fs from 'fs'
import path from 'path'

// ── agent-coordinator.sh: post the reviewer's output as a PR comment ──
// Issue #740: every merged PR shows its independent review, on both the
// escalated and the auto-merge path.

const source = fs.readFileSync(path.join(__dirname, '../agent-coordinator.sh'), 'utf-8')

describe('agent-coordinator.sh: reviewer output is commented on the PR', () => {
  const prNumberAt = source.indexOf('local PR_NUMBER="${PR_URL##*/}"')
  const commentAt = source.indexOf('github_comment "$PR_NUMBER" "Independent review', prNumberAt)
  const escalationAt = source.indexOf('if echo "$REVIEW_TEXT" | grep -q "RISK: LIVE-VERIFY-NEEDED"', prNumberAt)

  it('comments after PR_NUMBER is set and before the escalation if', () => {
    expect(prNumberAt).toBeGreaterThan(-1)
    expect(commentAt).toBeGreaterThan(prNumberAt)
    expect(escalationAt).toBeGreaterThan(commentAt)
  })

  it('targets $PR_NUMBER and includes the truncated review text', () => {
    const block = source.slice(commentAt, escalationAt)
    expect(block).toContain('github_comment "$PR_NUMBER"')
    expect(block).toContain('${REVIEW_COMMENT:0:60000}')
  })

  it('falls back to a message when the reviewer returned no output', () => {
    const block = source.slice(prNumberAt, escalationAt)
    expect(block).toContain('The reviewer returned no output.')
  })
})
