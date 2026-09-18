import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'

// Issue #262: the coordinator's reconcile_open_prs sweep (every 30 minutes)
// used to submit Langfuse traces named "agent-run" with outcome "swept" —
// the same name as real issue runs — which dragged down any agent-run
// latency/count chart. The sweep must name its traces "agent-reconcile";
// real issue runs must keep "agent-run".

describe('agent-coordinator.sh: reconcile sweep names its trace agent-reconcile', () => {
  const src = fs.readFileSync(path.join(__dirname, '../agent-coordinator.sh'), 'utf-8')

  it('passes "agent-reconcile" as the trace name from reconcile_open_prs', () => {
    const fnStart = src.indexOf('reconcile_open_prs() {')
    const fnEnd = src.indexOf('\n}\n', fnStart)
    expect(fnStart).toBeGreaterThan(-1)
    const body = src.slice(fnStart, fnEnd)
    const emitCall = body.match(/lf_emit\s+"[^"]*"\s+"reconcile-open-prs"[^\n]*"agent-reconcile"/)
    expect(emitCall).not.toBeNull()
  })

  it('does not pass a trace name override on the real issue-run lf_emit call sites, so they keep the default "agent-run"', () => {
    const runAgentStart = src.indexOf('run_agent() {')
    const runAgentBody = src.slice(runAgentStart)
    const emitCalls = runAgentBody.match(/lf_emit "\$ISSUE_NUMBER"[^\n]*/g) || []
    expect(emitCalls.length).toBeGreaterThan(0)
    for (const call of emitCalls) {
      expect(call).not.toContain('agent-reconcile')
    }
  })

  it('lf_emit forwards its 13th argument as LF_TRACE_NAME, defaulting to "agent-run"', () => {
    expect(src).toContain('LF_TRACE_NAME="${13:-agent-run}"')
    expect(src).toContain('"trace_name": os.environ.get("LF_TRACE_NAME") or None,')
  })
})

describe('scripts/langfuse_trace.py: trace_name flows through to the emitted trace', () => {
  function buildPayload(rawTrace: Record<string, unknown>): { trace_name?: string } {
    const script = `
import json, sys
sys.path.insert(0, "scripts")
import langfuse_trace as lt
trace, spans, t_start, t_end = lt.build_payload({"trace": ${JSON.stringify(rawTrace)}})
print(json.dumps(trace))
`
    const out = execFileSync('python3', ['-c', script], {
      cwd: path.join(__dirname, '..'),
    }).toString()
    return JSON.parse(out)
  }

  it('carries an explicit trace_name (the reconcile sweep\'s "agent-reconcile") through build_payload', () => {
    const trace = buildPayload({ outcome: 'swept', trace_name: 'agent-reconcile' })
    expect(trace.trace_name).toBe('agent-reconcile')
  })

  it('omits trace_name from build_payload when the caller supplies none (a real issue run)', () => {
    const trace = buildPayload({ issue_number: 5, outcome: 'success' })
    expect(trace.trace_name).toBeUndefined()
  })

  it('falls back to the DEFAULT_TRACE_NAME constant "agent-run" when no trace_name is set', () => {
    const emitSrc = fs.readFileSync(path.join(__dirname, '../scripts/langfuse_trace.py'), 'utf-8')
    expect(emitSrc).toContain('DEFAULT_TRACE_NAME = "agent-run"')
    expect(emitSrc).toContain('trace_name = trace_meta.get("trace_name") or DEFAULT_TRACE_NAME')
  })
})
