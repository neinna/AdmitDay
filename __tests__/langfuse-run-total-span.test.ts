import { execFileSync } from 'child_process'
import path from 'path'

// Issue #312: Langfuse dashboard widgets here only offer an Observations
// view, not Traces. scripts/langfuse_trace.py emitted one span per phase
// (implement, test, build, review, pr) but never a single observation
// covering the whole run, so total run duration could not be charted.
// build_payload() must now append one "run-total" span bounded by the same
// start/end already computed for the trace, carrying outcome/issue_number
// but no usage or cost (so per-phase cost totals don't double-count), while
// leaving the phase spans and the agent-reconcile sweep untouched.

function buildPayload(raw: Record<string, unknown>): {
  trace: Record<string, unknown>
  spans: Array<Record<string, unknown>>
  t_start: number | null
  t_end: number | null
} {
  const script = `
import json, sys
sys.path.insert(0, "scripts")
import langfuse_trace as lt
raw = json.loads(sys.stdin.read())
trace, spans, t_start, t_end = lt.build_payload(raw)
print(json.dumps({"trace": trace, "spans": spans, "t_start": t_start, "t_end": t_end}))
`
  const out = execFileSync('python3', ['-c', script], {
    cwd: path.join(__dirname, '..'),
    input: JSON.stringify(raw),
  }).toString()
  return JSON.parse(out)
}

describe('scripts/langfuse_trace.py: run-total span', () => {
  const rawRun = {
    trace: {
      issue_number: 312,
      outcome: 'success',
    },
    spans: [
      { name: 'implement', start_ns: 1000, end_ns: 5000, model: 'claude-sonnet-5', cost_usd: 0.02 },
      { name: 'test', start_ns: 5000, end_ns: 6000, ok: true },
      { name: 'build', start_ns: 6000, end_ns: 9000, ok: true },
    ],
  }

  it('adds exactly one run-total span bounded by the earliest start and latest end', () => {
    const { spans, t_start, t_end } = buildPayload(rawRun)

    const runTotals = spans.filter((s) => s.name === 'run-total')
    expect(runTotals).toHaveLength(1)
    expect(t_start).toBe(1000)
    expect(t_end).toBe(9000)
    expect(runTotals[0].start_ns).toBe(t_start)
    expect(runTotals[0].end_ns).toBe(t_end)
  })

  it('carries outcome and issue_number on the run-total span but no usage or cost fields', () => {
    const { spans } = buildPayload(rawRun)
    const runTotal = spans.find((s) => s.name === 'run-total')!

    expect(runTotal.outcome).toBe('success')
    expect(runTotal.issue_number).toBe(312)
    expect(runTotal).not.toHaveProperty('model')
    expect(runTotal).not.toHaveProperty('cost_usd')
    expect(runTotal).not.toHaveProperty('input_tokens')
    expect(runTotal).not.toHaveProperty('output_tokens')
    expect(runTotal).not.toHaveProperty('cache_read_tokens')
    expect(runTotal).not.toHaveProperty('cache_creation_tokens')
  })

  it('leaves the existing per-phase spans unchanged', () => {
    const { spans } = buildPayload(rawRun)
    const phaseSpans = spans.filter((s) => s.name !== 'run-total')

    expect(phaseSpans).toEqual(rawRun.spans)
  })

  it('does not add a run-total span to the agent-reconcile sweep trace', () => {
    const { spans } = buildPayload({
      trace: { outcome: 'swept', trace_name: 'agent-reconcile' },
      spans: [{ name: 'reconcile-open-prs', start_ns: 1000, end_ns: 2000, ok: true }],
    })

    expect(spans.some((s) => s.name === 'run-total')).toBe(false)
  })

  it('still adds a run-total span for a real issue run even when no phase spans are usable (the "run" fallback)', () => {
    const { spans } = buildPayload({
      trace: { issue_number: 7, outcome: 'failed', start_ns: 100, end_ns: 400 },
      spans: [],
    })

    const names = spans.map((s) => s.name)
    expect(names).toContain('run')
    expect(names).toContain('run-total')
    const runTotal = spans.find((s) => s.name === 'run-total')!
    expect(runTotal.start_ns).toBe(100)
    expect(runTotal.end_ns).toBe(400)
    expect(runTotal.outcome).toBe('failed')
    expect(runTotal.issue_number).toBe(7)
  })
})
