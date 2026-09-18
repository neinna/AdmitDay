import fs from 'fs'
import path from 'path'

const coordinator = fs.readFileSync(
  path.join(__dirname, '..', 'agent-coordinator.sh'),
  'utf-8'
)
const agentsMd = fs.readFileSync(path.join(__dirname, '..', 'AGENTS.md'), 'utf-8')

function between(src: string, start: string, end: string): string {
  const i = src.indexOf(start)
  const j = src.indexOf(end, i + start.length)
  if (i === -1 || j === -1) throw new Error(`markers not found: ${start} … ${end}`)
  return src.slice(i, j)
}

const brief = between(coordinator, 'local BRIEF="', 'local ATTEMPT=1')
const reviewPrompt = between(
  coordinator,
  'You are an independent code reviewer',
  'RISK: LIVE-VERIFY-NEEDED"'
)

describe('implementation brief', () => {
  it('tells the agent not to run the build, which the coordinator runs anyway', () => {
    expect(brief).toContain("Do NOT run 'npm run build'")
    expect(brief).not.toMatch(/iterate until both are green/)
  })

  it('points the agent at existing infrastructure before adding anything new', () => {
    expect(brief).toContain('infrastructure the app already has')
  })

  it('no longer offers the Telegram progress hook', () => {
    expect(brief).not.toContain('notify.sh')
  })
})

describe('reviewer prompt', () => {
  it('rejects a new external service the issue does not name', () => {
    expect(reviewPrompt).toContain('adds a new external service')
  })

  it('rejects infrastructure changes that leave README.md behind', () => {
    expect(reviewPrompt).toContain('without updating README.md')
  })
})

describe('rejection reasons are kept', () => {
  it('logs the reviewer verdict line when it rejects an attempt', () => {
    expect(coordinator).toContain("grep -m1 'VERDICT: REJECT'")
  })
})

describe('AGENTS.md', () => {
  it('has a use-what-already-exists section naming the existing stack', () => {
    expect(agentsMd).toContain('## Use What Already Exists')
    expect(agentsMd).toContain('Vercel Postgres')
  })
})
