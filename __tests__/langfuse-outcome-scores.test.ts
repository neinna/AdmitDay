import { execFileSync } from 'child_process'
import path from 'path'

// Issue #211: Langfuse dashboard widgets here read Observations and Scores,
// not trace metadata, so "cost per merged PR" and "money spent on runs that
// merged nothing" could not be charted even though outcome/issue_number were
// already recorded on every trace. scripts/langfuse_trace.py must attach an
// "outcome" categorical score, a "merged" numeric score (1 iff the run ended
// with auto-merge enabled on a PR, else 0), and an "attempt" numeric score
// (1 or 2) to every agent-run trace, plus an "issue-<n>" tag — while leaving
// agent-reconcile sweeps with no scores at all.

function runEmit(raw: Record<string, unknown>): {
  scores: Array<{ name: string; value: unknown; data_type: string | null }>
  tags: string[]
} {
  const script = `
import contextlib
import json
import os
import sys
import types

os.environ["LANGFUSE_PUBLIC_KEY"] = "test-public"
os.environ["LANGFUSE_SECRET_KEY"] = "test-secret"

CREATED = []
CAPTURED = {}

class FakeSpan:
    def __init__(self, otel_span=None, langfuse_client=None, **kwargs):
        self.name = getattr(otel_span, "name", None)
        self.metadata = kwargs.get("metadata")
        self.scores = []
        self.trace_id = "trace-id"
        self.id = "obs-id"
        self._otel_span = otel_span
        CREATED.append(self)

    def update(self, **kwargs):
        if "metadata" in kwargs:
            self.metadata = kwargs["metadata"]

    def end(self, end_time=None):
        pass

    def score_trace(self, *, name, value, data_type=None, **kwargs):
        self.scores.append({"name": name, "value": value, "data_type": data_type})


class FakeGeneration(FakeSpan):
    pass


class FakeTracer:
    def start_span(self, name, context=None, start_time=None):
        return types.SimpleNamespace(name=name)


class FakeClient:
    def __init__(self, **kwargs):
        self._otel_tracer = FakeTracer()

    def start_observation(self, name=None, as_type=None, **kwargs):
        span = FakeGeneration(**kwargs) if as_type == "generation" else FakeSpan(**kwargs)
        span.name = name
        return span

    def flush(self):
        pass


@contextlib.contextmanager
def fake_propagate_attributes(**kwargs):
    CAPTURED.update(kwargs)
    yield


fake_langfuse = types.ModuleType("langfuse")
fake_langfuse.Langfuse = FakeClient
fake_langfuse.LangfuseSpan = FakeSpan
fake_langfuse.LangfuseGeneration = FakeGeneration
fake_langfuse.propagate_attributes = fake_propagate_attributes
sys.modules["langfuse"] = fake_langfuse

fake_otel_trace = types.ModuleType("opentelemetry.trace")
fake_otel_trace.set_span_in_context = lambda span: span
fake_otel = types.ModuleType("opentelemetry")
fake_otel.trace = fake_otel_trace
sys.modules["opentelemetry"] = fake_otel
sys.modules["opentelemetry.trace"] = fake_otel_trace

sys.path.insert(0, "scripts")
import langfuse_trace as lt

raw = json.loads(sys.stdin.read())
lt.emit(raw)

trace_name = (raw.get("trace") or {}).get("trace_name") or lt.DEFAULT_TRACE_NAME
root = next(s for s in CREATED if s.name == trace_name)
print(json.dumps({"scores": root.scores, "tags": CAPTURED.get("tags")}))
`
  const out = execFileSync('python3', ['-c', script], {
    cwd: path.join(__dirname, '..'),
    input: JSON.stringify(raw),
  }).toString()
  return JSON.parse(out)
}

describe('scripts/langfuse_trace.py: outcome/merged/attempt scores', () => {
  it('scores a success run that merged: outcome, merged=1, attempt', () => {
    const { scores, tags } = runEmit({
      trace: {
        issue_number: 211,
        outcome: 'success',
        attempts: 1,
        pr_outcome: 'opened-auto-merge-enabled',
        start_ns: 1000,
        end_ns: 5000,
      },
      spans: [{ name: 'implement', start_ns: 1000, end_ns: 5000, model: 'claude-sonnet-5', cost_usd: 0.02 }],
    })

    const byName = Object.fromEntries(scores.map((s) => [s.name, s]))
    expect(byName.outcome).toEqual({ name: 'outcome', value: 'success', data_type: 'CATEGORICAL' })
    expect(byName.merged).toEqual({ name: 'merged', value: 1.0, data_type: 'NUMERIC' })
    expect(byName.attempt).toEqual({ name: 'attempt', value: 1.0, data_type: 'NUMERIC' })
    expect(tags).toContain('issue-211')
  })

  it('scores a budget-exhausted run that opened no PR: outcome, merged=0, attempt=2', () => {
    const { scores, tags } = runEmit({
      trace: {
        issue_number: 84,
        outcome: 'budget-exhausted',
        attempts: 2,
        pr_outcome: 'not-attempted',
        start_ns: 1000,
        end_ns: 5000,
      },
      spans: [{ name: 'implement', start_ns: 1000, end_ns: 5000, model: 'claude-sonnet-5', cost_usd: 0.05 }],
    })

    const byName = Object.fromEntries(scores.map((s) => [s.name, s]))
    expect(byName.outcome).toEqual({ name: 'outcome', value: 'budget-exhausted', data_type: 'CATEGORICAL' })
    expect(byName.merged).toEqual({ name: 'merged', value: 0.0, data_type: 'NUMERIC' })
    expect(byName.attempt).toEqual({ name: 'attempt', value: 2.0, data_type: 'NUMERIC' })
    expect(tags).toContain('issue-84')
  })

  it('scores merged=0 when a PR was opened but auto-merge was not enabled', () => {
    const { scores } = runEmit({
      trace: {
        issue_number: 9,
        outcome: 'needs-review',
        attempts: 1,
        pr_outcome: 'opened-escalated',
        start_ns: 1000,
        end_ns: 2000,
      },
      spans: [{ name: 'implement', start_ns: 1000, end_ns: 2000, model: 'claude-sonnet-5', cost_usd: 0.01 }],
    })

    const merged = scores.find((s) => s.name === 'merged')!
    expect(merged.value).toBe(0.0)
  })

  it('leaves the agent-reconcile sweep with no scores at all', () => {
    const { scores } = runEmit({
      trace: { outcome: 'swept', trace_name: 'agent-reconcile', start_ns: 1000, end_ns: 2000 },
      spans: [{ name: 'reconcile-open-prs', start_ns: 1000, end_ns: 2000, ok: true }],
    })

    expect(scores).toEqual([])
  })
})
