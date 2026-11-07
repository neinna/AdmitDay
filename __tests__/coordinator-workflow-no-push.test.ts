import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.join(__dirname, '../agent-coordinator.sh'), 'utf-8')

describe('agent-coordinator.sh: a workflow change is not pushed', () => {
  const start = source.indexOf('if [ "$WORKFLOW_CHANGED" -eq 1 ]; then\n      local WF_FILES')
  const pushAt = source.indexOf('git push origin "$BRANCH"')
  const elseAt = source.indexOf('\n    else\n', start)
  const block = source.slice(start, elseAt)

  it('branches on WORKFLOW_CHANGED and marks not-pushed before the push', () => {
    expect(start).toBeGreaterThan(-1)
    expect(source.indexOf('PR_OUTCOME="not-pushed-workflow"')).toBeGreaterThan(start)
    expect(source.indexOf('PR_OUTCOME="not-pushed-workflow"')).toBeLessThan(pushAt)
  })

  it('labels the issue needs-you and neither pushes nor opens a PR', () => {
    expect(block).toContain('github_label "$ISSUE_NUMBER" "needs-you"')
    expect(block).not.toContain('git push')
    expect(block).not.toContain('github_open_pr')
  })
})
