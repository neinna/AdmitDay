import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'

const coordinatorSource = fs.readFileSync(path.join(__dirname, '../agent-coordinator.sh'), 'utf-8')

function extractFunction(name: string): string {
  const start = coordinatorSource.indexOf(`${name}() {`)
  expect(start).toBeGreaterThan(-1)
  let depth = 0
  let i = coordinatorSource.indexOf('{', start)
  for (; i < coordinatorSource.length; i++) {
    const ch = coordinatorSource[i]
    if (ch === '{') depth++
    if (ch === '}') {
      depth--
      if (depth === 0) break
    }
  }
  return coordinatorSource.slice(start, i + 1)
}

const patternLine = coordinatorSource.split('\n').find((l) => l.startsWith('CONTROL_FILES_PATTERN='))

describe('control_files_changed (functional)', () => {
  let repo: string
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf-8' })

  function fired(): boolean {
    expect(patternLine).toBeDefined()
    const script = `${patternLine}\n${extractFunction('control_files_changed')}\ncontrol_files_changed`
    try {
      execFileSync('bash', ['-c', script], { cwd: repo })
      return true
    } catch (err: any) {
      if (err.status === 1) return false
      throw err
    }
  }

  function change(file: string) {
    git('checkout', '-qb', 'task-test')
    fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true })
    fs.writeFileSync(path.join(repo, file), 'changed\n')
    git('add', '-A')
    git('commit', '-qm', 'change')
  }

  beforeEach(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'coord-control-'))
    git('init', '-q')
    git('config', 'user.email', 'test@example.com')
    git('config', 'user.name', 'test')
    fs.mkdirSync(path.join(repo, 'lib'))
    fs.writeFileSync(path.join(repo, 'lib/app.ts'), 'original\n')
    git('add', '-A')
    git('commit', '-qm', 'initial')
    git('branch', 'origin/main')
  })

  afterEach(() => fs.rmSync(repo, { recursive: true, force: true }))

  it.each([
    'agent-coordinator.sh',
    'AGENTS.md',
    '.github/workflows/ci.yml',
    'package.json',
    'scripts/merge-gate.sh',
    'scripts/vps-data-refresh.sh',
    '__tests__/coordinator-x.test.ts',
    'lib/db.ts',
  ])('fires for a change to %s', (file) => {
    change(file)
    expect(fired()).toBe(true)
  })

  it.each(['lib/app.ts', 'components/X.tsx', '__tests__/schools.test.ts'])(
    'does not fire for a change to %s',
    (file) => {
      change(file)
      expect(fired()).toBe(false)
    },
  )
})

describe('agent-coordinator.sh: control file escalation source check', () => {
  it('includes CONTROL_CHANGED in the escalation condition', () => {
    const cond = coordinatorSource.split('\n').find((l) => l.includes('RISK: LIVE-VERIFY-NEEDED" ||'))
    expect(cond).toContain('"$CONTROL_CHANGED" -eq 1')
  })
})
