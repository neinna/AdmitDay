import fs from 'fs'
import path from 'path'
import yaml from 'js-yaml'

type Step = { name?: string; run?: string; env?: Record<string, string> }
type Workflow = {
  on: { pull_request: { types: string[] } }
  permissions: Record<string, string>
  jobs: Record<string, { steps: Step[] }>
}

const file = path.join(__dirname, '..', '.github', 'workflows', 'merge-gate.yml')
const wf = yaml.load(fs.readFileSync(file, 'utf-8')) as Workflow

describe('merge-gate workflow', () => {
  it('has a merge-gate job', () => {
    expect(Object.keys(wf.jobs)).toEqual(['merge-gate'])
  })

  it('runs on the five pull_request types', () => {
    expect([...wf.on.pull_request.types].sort()).toEqual(
      ['labeled', 'opened', 'reopened', 'synchronize', 'unlabeled'].sort()
    )
  })

  it('has read-only contents and pull-requests permissions only', () => {
    expect(wf.permissions).toEqual({ contents: 'read', 'pull-requests': 'read' })
  })

  it('runs the script as the last step with LABELS from the PR labels', () => {
    const steps = wf.jobs['merge-gate'].steps
    const last = steps[steps.length - 1]
    expect(last.run).toBe('bash scripts/merge-gate.sh')
    expect(last.env?.LABELS).toContain('github.event.pull_request.labels.*.name')
  })
})
