import fs from 'fs'
import path from 'path'
import yaml from 'js-yaml'

type Step = { name?: string; env?: Record<string, string> }

describe('eval-ask workflow', () => {
  it('sends Langfuse records to the US region', () => {
    const file = path.join(__dirname, '..', '.github', 'workflows', 'eval-ask.yml')
    const wf = yaml.load(fs.readFileSync(file, 'utf-8')) as {
      jobs: Record<string, { steps: Step[] }>
    }
    const step = wf.jobs['eval-ask'].steps.find((s) => s.name === 'Run ask evals')
    expect(step?.env?.EVAL_LANGFUSE_HOST).toBe('https://us.cloud.langfuse.com')
  })
})
