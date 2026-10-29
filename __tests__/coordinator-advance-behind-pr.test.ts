import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'

// Issue #563: advance at most one behind, green task-* PR per call, and only
// when no task-* PR has a `test` run in flight.

const source = fs.readFileSync(path.join(__dirname, '../agent-coordinator.sh'), 'utf-8')

function extractFunction(name: string): string {
  const start = source.indexOf(`${name}() {`)
  expect(start).toBeGreaterThan(-1)
  let depth = 0
  let i = source.indexOf('{', start)
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++
    if (source[i] === '}' && --depth === 0) break
  }
  return source.slice(start, i + 1)
}

type Pr = {
  number: number
  ref: string
  state: string
  test?: { status: string; conclusion: string | null }
}

describe('advance_one_behind_pr', () => {
  let dir: string
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coord-advance-'))
  })
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

  function run(prs: Pr[]): { calls: string[]; logs: string } {
    const fixtures: Record<string, unknown> = {
      '/pulls?state=open&per_page=100': prs.map((p) => ({ number: p.number, head: { ref: p.ref } })),
    }
    for (const p of prs) {
      fixtures[`/pulls/${p.number}`] = {
        number: p.number,
        mergeable_state: p.state,
        head: { sha: `sha${p.number}` },
      }
      fixtures[`/commits/sha${p.number}/check-runs?per_page=100`] = {
        check_runs: p.test
          ? [{ id: 1, name: 'test', started_at: '2026-10-29T00:00:00Z', ...p.test }]
          : [],
      }
    }
    const fixDir = path.join(dir, 'fx')
    fs.mkdirSync(fixDir)
    fs.writeFileSync(path.join(fixDir, 'all.json'), JSON.stringify(fixtures))
    const callsFile = path.join(dir, 'calls')
    const logFile = path.join(dir, 'log')
    fs.writeFileSync(callsFile, '')
    fs.writeFileSync(logFile, '')
    execFileSync(
      'bash',
      [
        '-c',
        `
LOG_FILE="${logFile}"
log() { echo "$*" >> "${logFile}"; }
gh_api() {
  if [ "$1" = "PUT" ]; then echo "$1 $2" >> "${callsFile}"; echo '{}'; return 0; fi
  python3 -c "import json,sys; d=json.load(open('${fixDir}/all.json')); print(json.dumps(d.get(sys.argv[1], {})))" "$2"
}
${extractFunction('advance_one_behind_pr')}
advance_one_behind_pr
`,
      ],
      { cwd: dir, encoding: 'utf-8' },
    )
    return {
      calls: fs.readFileSync(callsFile, 'utf-8').split('\n').filter(Boolean),
      logs: fs.readFileSync(logFile, 'utf-8'),
    }
  }

  const green = { status: 'completed', conclusion: 'success' }

  it('updates only the lowest-numbered behind green PR', () => {
    const { calls, logs } = run([
      { number: 12, ref: 'task-12-b', state: 'behind', test: green },
      { number: 10, ref: 'task-10-a', state: 'behind', test: green },
    ])
    expect(calls).toEqual(['PUT /pulls/10/update-branch'])
    expect(logs).toContain('Advance: updating PR #10 (behind main)')
  })

  it('does nothing while another PR has test in progress', () => {
    const { calls } = run([
      { number: 10, ref: 'task-10-a', state: 'blocked', test: { status: 'in_progress', conclusion: null } },
      { number: 12, ref: 'task-12-b', state: 'behind', test: green },
    ])
    expect(calls).toEqual([])
  })

  it('does nothing while another PR has test queued', () => {
    const { calls } = run([
      { number: 12, ref: 'task-12-b', state: 'behind', test: green },
      { number: 20, ref: 'task-20-c', state: 'clean', test: { status: 'queued', conclusion: null } },
    ])
    expect(calls).toEqual([])
  })

  it('skips a behind PR whose test failed', () => {
    const { calls } = run([
      { number: 10, ref: 'task-10-a', state: 'behind', test: { status: 'completed', conclusion: 'failure' } },
    ])
    expect(calls).toEqual([])
  })

  it('skips a behind PR with no test check', () => {
    expect(run([{ number: 10, ref: 'task-10-a', state: 'behind' }]).calls).toEqual([])
  })

  it('ignores non task-* head refs', () => {
    const { calls } = run([
      { number: 10, ref: 'data/weekly-refresh', state: 'behind', test: green },
      { number: 11, ref: 'claude/x', state: 'behind', test: green },
    ])
    expect(calls).toEqual([])
  })

  it('does nothing with no open PRs', () => {
    expect(run([]).calls).toEqual([])
  })
})
