import { execFileSync } from 'child_process'
import { readFileSync } from 'fs'
import path from 'path'

describe('coordinator default models', () => {
  it('reviews with a different model from the implementer when unset', () => {
    const source = readFileSync(path.join(__dirname, '..', 'agent-coordinator.sh'), 'utf8')
    const lines = source
      .split('\n')
      .filter((l) => l.startsWith('CLAUDE_IMPLEMENT_MODEL=') || l.startsWith('CLAUDE_REVIEW_MODEL='))
    expect(lines).toHaveLength(2)

    const script = `${lines.join('\n')}\necho "$CLAUDE_IMPLEMENT_MODEL"\necho "$CLAUDE_REVIEW_MODEL"`
    const env = { ...process.env }
    delete env.CLAUDE_IMPLEMENT_MODEL
    delete env.CLAUDE_REVIEW_MODEL
    const [implementer, reviewer] = execFileSync('bash', ['-c', script], { env, encoding: 'utf8' })
      .trim()
      .split('\n')

    expect(reviewer).not.toBe(implementer)
    expect(reviewer).toBe('claude-opus-5-5')
  })
})
