import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'

// ── agent-coordinator.sh: record turns per claude call ──────────────────────
// lf_record already stored input, output, cache-read and cache-write tokens and
// cost for every claude call, but not how many turns the call took. Turns are
// what explain cache reads: each turn re-reads the whole conversation so far.
// The CLI reports num_turns once per call, so it goes on the first row only —
// a call billed to two models must not count its turns twice. The Langfuse
// script must keep the field instead of dropping it at its allowlist.

const coordinatorPath = path.join(__dirname, '../agent-coordinator.sh')
const coordinatorSource = fs.readFileSync(coordinatorPath, 'utf-8')

function extractFunction(name: string): string {
  const marker = `${name}() {`
  const start = coordinatorSource.indexOf(marker)
  expect(start).toBeGreaterThan(-1)
  const end = coordinatorSource.indexOf('\n}\n', start)
  expect(end).toBeGreaterThan(start)
  return coordinatorSource.slice(start, end + 2)
}

function runLfRecord(claudeJson: Record<string, unknown>): Array<Record<string, unknown>> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lf-turns-'))
  const jsonPath = path.join(dir, 'claude.json')
  const runFile = path.join(dir, 'run.jsonl')
  fs.writeFileSync(jsonPath, JSON.stringify(claudeJson))
  const script = `
LF_RUN_FILE="${runFile}"
LOG_FILE="${path.join(dir, 'log')}"
${extractFunction('lf_record')}
lf_record implement 1 2 1 "${jsonPath}" 1
`
  execFileSync('bash', ['-c', script])
  return fs
    .readFileSync(runFile, 'utf-8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
}

describe('agent-coordinator.sh lf_record: turns', () => {
  it('records num_turns as turns alongside the token counts', () => {
    const rows = runLfRecord({
      num_turns: 26,
      modelUsage: {
        'claude-sonnet-5': {
          inputTokens: 32,
          outputTokens: 12304,
          cacheReadInputTokens: 808528,
          cacheCreationInputTokens: 36459,
          costUSD: 0.376,
        },
      },
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      model: 'claude-sonnet-5',
      turns: 26,
      cache_read_tokens: 808528,
      output_tokens: 12304,
    })
  })

  it('puts turns on the first model row only', () => {
    const rows = runLfRecord({
      num_turns: 9,
      modelUsage: {
        'claude-sonnet-5': { inputTokens: 1, outputTokens: 1, costUSD: 0.1 },
        'claude-haiku-4-5': { inputTokens: 1, outputTokens: 1, costUSD: 0.01 },
      },
    })
    expect(rows).toHaveLength(2)
    expect(rows.filter((r) => r.turns === 9)).toHaveLength(1)
    expect(rows.filter((r) => 'turns' in r)).toHaveLength(1)
  })

  it('records turns from the totals-only fallback too', () => {
    const rows = runLfRecord({
      num_turns: 4,
      model: 'claude-sonnet-5',
      usage: { input_tokens: 3, output_tokens: 5 },
      total_cost_usd: 0.02,
    })
    expect(rows[0]).toMatchObject({ turns: 4, output_tokens: 5 })
  })
})

describe('scripts/langfuse_trace.py: turns survive the span allowlist', () => {
  it('keeps turns on the span', () => {
    const script = `
import json, sys
sys.path.insert(0, "scripts")
import langfuse_trace as lt
raw = json.loads(sys.stdin.read())
trace, spans, t_start, t_end = lt.build_payload(raw)
print(json.dumps(spans))
`
    const out = execFileSync('python3', ['-c', script], {
      cwd: path.join(__dirname, '..'),
      input: JSON.stringify({
        trace: { issue_number: 1, outcome: 'success' },
        spans: [{ name: 'implement', start_ns: 1, end_ns: 2, model: 'claude-sonnet-5', turns: 26 }],
      }),
    }).toString()
    const spans = JSON.parse(out)
    expect(spans.find((s: Record<string, unknown>) => s.name === 'implement').turns).toBe(26)
  })
})
