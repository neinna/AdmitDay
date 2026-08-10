#!/usr/bin/env python3
"""Write one Langfuse trace for one agent-coordinator run.

Reads run data as JSON on stdin, emits a single trace, exits 0. Always.

This is the ONLY place in the repo that talks to Langfuse. It is observability
only: it never influences the coordinator's control flow, and every failure mode
(bad input, missing SDK, unreachable host, hung export) is swallowed and
reported on stderr so a Langfuse outage can never break an agent run.

Input contract (stdin, JSON):

    {
      "trace": {
        "issue_number": 84,
        "issue_title": "Hide the unbuilt Full Access UI",
        "branch": "task-84-hide-the-unbuilt-full-acce",
        "repo": "neinna/AdmitDay",
        "outcome": "success" | "failed" | "needs-review",
        "attempts": 1,
        "github_label": "pr-open",
        "start_ns": 1754300000000000000,
        "end_ns":   1754301800000000000
      },
      "spans": [
        {"name": "implement", "start_ns": ..., "end_ns": ...,
         "model": "claude-sonnet-4-6", "input_tokens": 3, "output_tokens": 4,
         "cache_read_tokens": 10738, "cache_creation_tokens": 4796,
         "cost_usd": 0.0212754, "attempt": 1},
        {"name": "test",  "start_ns": ..., "end_ns": ..., "ok": true},
        {"name": "build", "start_ns": ..., "end_ns": ..., "ok": true,
         "status": "passed"}
      ]
    }

Every field is optional. If "spans" is empty or unusable, a single span named
"run" is emitted covering the whole trace, so a run is never invisible.

PRIVACY — load-bearing, do not relax:
Only the keys listed above are read. Everything else on stdin is dropped by
_pick() before any Langfuse call. No prompt text, no diffs, no file contents, no
agent output, no issue body ever leaves this process. The issue *title* is sent
deliberately, because a trace you cannot identify is not worth writing.

Config (read from the environment, never from arguments, never logged):
    LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_HOST
If the keys are unset, this exits 0 without doing anything.
"""

import json
import os
import signal
import sys

# Hard ceiling on this process. Belt and braces: the SDK gets an HTTP timeout
# below, but a wedged socket or a slow retry loop must never hold up the agent
# loop, so we also arm a wall-clock alarm that exits 0 no matter what.
WATCHDOG_SECONDS = int(os.environ.get("LANGFUSE_TRACE_TIMEOUT", "20"))
HTTP_TIMEOUT_SECONDS = 5

TRACE_NAME = "agent-run"
VALID_OUTCOMES = ("success", "failed", "needs-review")

# Phases that represent an LLM call become Langfuse generations (they carry
# model + tokens + cost). Everything else is a plain span.
SPAN_KEYS = (
    "name",
    "start_ns",
    "end_ns",
    "model",
    "input_tokens",
    "output_tokens",
    "cache_read_tokens",
    "cache_creation_tokens",
    "cost_usd",
    "attempt",
    "ok",
    "status",
)
TRACE_KEYS = (
    "issue_number",
    "issue_title",
    "branch",
    "repo",
    "outcome",
    "attempts",
    "github_label",
    "test_result",
    "build_result",
    "reviewer_result",
    "pr_outcome",
    "metadata_file",
    "start_ns",
    "end_ns",
)


def warn(msg):
    """Diagnostics go to stderr only. The caller pipes stderr to its log."""
    sys.stderr.write("langfuse_trace: %s\n" % msg)


def _bail(signum, frame):
    warn("watchdog fired after %ss, giving up (run unaffected)" % WATCHDOG_SECONDS)
    os._exit(0)


def _pick(src, keys):
    """Whitelist. The privacy guarantee is enforced here and nowhere else."""
    if not isinstance(src, dict):
        return {}
    return {k: src[k] for k in keys if src.get(k) is not None}


def _int(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def _ms(start_ns, end_ns):
    if start_ns is None or end_ns is None or end_ns < start_ns:
        return None
    return round((end_ns - start_ns) / 1e6, 1)


def build_payload(raw):
    """Normalize stdin into exactly what we are willing to send."""
    trace = _pick(raw.get("trace"), TRACE_KEYS)

    outcome = trace.get("outcome")
    if outcome not in VALID_OUTCOMES:
        # Never invent an outcome. An unknown one is itself worth seeing.
        trace["outcome"] = "needs-review" if outcome is None else str(outcome)

    spans = []
    for item in raw.get("spans") or []:
        span = _pick(item, SPAN_KEYS)
        if span.get("name"):
            spans.append(span)

    t_start = _int(trace.get("start_ns"))
    t_end = _int(trace.get("end_ns"))

    if not spans:
        # Documented fallback: phase boundaries were not available, so the run
        # still gets exactly one span rather than disappearing.
        warn("no usable spans on stdin, falling back to a single 'run' span")
        spans = [{"name": "run", "start_ns": t_start, "end_ns": t_end}]

    # Bound the trace by its spans when the caller did not supply its own edges.
    starts = [s for s in (_int(x.get("start_ns")) for x in spans) if s is not None]
    ends = [e for e in (_int(x.get("end_ns")) for x in spans) if e is not None]
    if t_start is None and starts:
        t_start = min(starts)
    if t_end is None and ends:
        t_end = max(ends)

    return trace, spans, t_start, t_end


def usage_for(span):
    """Langfuse usage_details. Token counts only — that is the whole point."""
    usage = {}
    for key, field in (
        ("input", "input_tokens"),
        ("output", "output_tokens"),
        ("cache_read_input_tokens", "cache_read_tokens"),
        ("cache_creation_input_tokens", "cache_creation_tokens"),
    ):
        value = _int(span.get(field))
        if value is not None:
            usage[key] = value
    if usage:
        usage["total"] = sum(usage.values())
    return usage


def cost_for(span):
    """Prefer the cost the Claude CLI actually reported.

    Langfuse can derive cost from model + tokens, but only for models in its
    price table. Passing the CLI's own figure means the cost column is populated
    even for a model the server has never heard of, which matters the week a new
    model ships. When the CLI gives us nothing, we omit this and let Langfuse
    compute it from the token counts.
    """
    try:
        cost = float(span["cost_usd"])
    except (KeyError, TypeError, ValueError):
        return None
    return {"total": cost} if cost >= 0 else None


def emit(raw):
    from langfuse import Langfuse, LangfuseGeneration, LangfuseSpan, propagate_attributes
    from opentelemetry import trace as otel_trace

    trace_meta, spans, t_start, t_end = build_payload(raw)

    client = Langfuse(
        public_key=os.environ["LANGFUSE_PUBLIC_KEY"],
        secret_key=os.environ["LANGFUSE_SECRET_KEY"],
        host=os.environ.get("LANGFUSE_HOST") or None,
        timeout=HTTP_TIMEOUT_SECONDS,
        flush_at=512,
    )
    tracer = client._otel_tracer  # only private API used; see new_span() fallback

    issue_number = trace_meta.get("issue_number")
    models = sorted({s["model"] for s in spans if s.get("model")})

    # Raw nanosecond edges are already the span's own start/end; keep them out of
    # metadata so the UI shows the one timing number a human reads.
    metadata = {k: v for k, v in trace_meta.items() if k not in ("start_ns", "end_ns")}
    metadata["latency_ms"] = _ms(t_start, t_end)
    metadata["models"] = models

    # Tags are what make the UI answer "which model, and did it work" in one
    # click, and later "did routing change the mix" without a query.
    tags = ["outcome:%s" % trace_meta["outcome"]] + ["model:%s" % m for m in models]

    def new_span(name, start_ns, parent_ctx, cls, **kwargs):
        """Create a span with a backdated start time.

        This script runs after the fact, so a span started 'now' would report a
        nonsensical duration. OTel accepts an explicit start_time; the Langfuse
        wrapper classes accept a raw otel_span. If a future SDK moves the tracer
        we fall back to the public constructor: timings collapse, but the trace
        still carries model, tokens and cost, and latency_ms in metadata keeps
        the real durations readable either way.
        """
        as_type = "generation" if cls is LangfuseGeneration else "span"
        try:
            otel_span = tracer.start_span(name, context=parent_ctx, start_time=start_ns)
            return cls(otel_span=otel_span, langfuse_client=client, **kwargs)
        except Exception as exc:
            warn("backdated span %r unavailable (%s), using live timing" % (name, exc))
            return client.start_observation(name=name, as_type=as_type, **kwargs)

    with propagate_attributes(
        trace_name=TRACE_NAME,
        metadata=metadata,
        tags=tags,
        user_id="coding-agent",
        # One session per issue, so a re-run of the same issue lines up next to
        # its earlier attempts instead of scattering across the trace list.
        session_id="issue-%s" % issue_number if issue_number is not None else None,
    ):
        root = new_span(TRACE_NAME, t_start, None, LangfuseSpan)
        root.update(metadata=metadata, output={"outcome": trace_meta["outcome"]})

        # Nest the phases under the run. If the SDK ever stops exposing the
        # underlying otel span, fall back to a flat trace rather than no trace.
        root_otel = getattr(root, "_otel_span", None)
        parent_ctx = otel_trace.set_span_in_context(root_otel) if root_otel else None

        for span in spans:
            usage = usage_for(span)
            cost = cost_for(span)
            is_generation = bool(span.get("model") or usage)

            span_meta = {
                "latency_ms": _ms(_int(span.get("start_ns")), _int(span.get("end_ns")))
            }
            for key in ("attempt", "ok", "status"):
                if span.get(key) is not None:
                    span_meta[key] = span[key]

            kwargs = {"metadata": span_meta}
            if is_generation:
                kwargs.update(model=span.get("model"), usage_details=usage or None)
                if cost:
                    kwargs["cost_details"] = cost

            child = new_span(
                span["name"],
                _int(span.get("start_ns")),
                parent_ctx,
                LangfuseGeneration if is_generation else LangfuseSpan,
                **kwargs
            )
            if span.get("ok") is False:
                child.update(level="ERROR", status_message="%s failed" % span["name"])
            child.end(end_time=_int(span.get("end_ns")))

        if trace_meta["outcome"] != "success":
            root.update(level="WARNING", status_message=trace_meta["outcome"])
        root.end(end_time=t_end)

    client.flush()
    # "submitted", not "wrote": the OTel exporter reports its own delivery
    # failures on stderr just above this line, and we deliberately do not treat
    # a failed delivery as our problem.
    warn(
        "submitted trace for issue #%s (outcome=%s, spans=%d)"
        % (issue_number, trace_meta["outcome"], len(spans))
    )


def main():
    if hasattr(signal, "SIGALRM"):
        signal.signal(signal.SIGALRM, _bail)
        signal.alarm(WATCHDOG_SECONDS)

    if not (os.environ.get("LANGFUSE_PUBLIC_KEY") and os.environ.get("LANGFUSE_SECRET_KEY")):
        warn("LANGFUSE_PUBLIC_KEY/LANGFUSE_SECRET_KEY not set, skipping")
        return

    try:
        raw = json.loads(sys.stdin.read() or "{}")
    except Exception as exc:
        warn("could not parse stdin as JSON: %s" % exc)
        return
    if not isinstance(raw, dict):
        warn("stdin was not a JSON object, skipping")
        return

    try:
        emit(raw)
    except ImportError as exc:
        warn("langfuse SDK not installed (%s), skipping" % exc)
    except Exception as exc:
        # Unreachable host, auth rejection, SDK change — all the same to us.
        warn("%s: %s" % (type(exc).__name__, exc))


if __name__ == "__main__":
    main()
    # Explicit: no code path may hand a nonzero status back to the coordinator.
    sys.exit(0)
