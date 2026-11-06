import fs from 'fs'
import path from 'path'

// ── agent-coordinator.sh: label the PR ai-approved when the reviewer approved
// and nothing escalated (issue #739). The merge-gate check passes only on PRs
// carrying that label.

const coordinatorSource = fs.readFileSync(path.join(__dirname, '../agent-coordinator.sh'), 'utf-8')

const label = 'github_label "$PR_NUMBER" "ai-approved"'
const needsYouAt = coordinatorSource.indexOf('github_label "$PR_NUMBER" "needs-you"')
const ifAt = coordinatorSource.lastIndexOf('if echo "$REVIEW_TEXT"', needsYouAt)
const nodeIdAt = coordinatorSource.indexOf('local PR_NODE_ID', needsYouAt)

describe('agent-coordinator.sh: ai-approved label', () => {
  it('finds the escalation and auto-merge branches', () => {
    expect(needsYouAt).toBeGreaterThan(-1)
    expect(ifAt).toBeGreaterThan(-1)
    expect(nodeIdAt).toBeGreaterThan(needsYouAt)
  })

  it('labels ai-approved in the auto-merge branch before enabling auto-merge', () => {
    const branch = coordinatorSource.slice(nodeIdAt - 80, coordinatorSource.indexOf('\n      fi', nodeIdAt))
    const labelAt = branch.indexOf(label)
    expect(labelAt).toBeGreaterThan(-1)
    expect(labelAt).toBeLessThan(branch.indexOf('github_enable_automerge'))
  })

  it('does not label ai-approved in the escalation branch', () => {
    const escalation = coordinatorSource.slice(ifAt, coordinatorSource.lastIndexOf('\n      else', nodeIdAt))
    expect(escalation).not.toContain('ai-approved')
  })
})
