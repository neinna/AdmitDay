/**
 * evals/langfuse-run.ts
 *
 * Issue #285: the only place evals/run-ask-eval.ts talks to Langfuse. Records
 * every eval run as a dataset run on the "ask-seed" dataset in the
 * admitday-app Langfuse project (same project lib/trace.ts writes product
 * traces to), tagged `eval` so it stays out of the production cost charts.
 * One dataset item per seed case, one trace + one score per scorer per case,
 * linked into the run via createDatasetRunItem. The run's own summary (the
 * per-scorer pass rates evals/run-ask-eval.ts already computed) is stored on
 * the run's metadata so a later PR run can read the last weekly run's
 * numbers back without re-aggregating every trace's scores.
 *
 * Issue #455: recording is observability, not the gate. A Langfuse outage
 * (expired credentials, network failure, etc.) must not fail the eval run —
 * recordEvalRunSafely below catches any failure from the record-and-fetch-
 * baseline path, logs one warning, and lets the case results alone decide
 * the exit code.
 */

import type { Langfuse as LangfuseClient } from "langfuse";
import type { EvalTrigger, RunSummary } from "./gate";
import { pickLatestWeeklyBaseline } from "./gate";

const DATASET_NAME = "ask-seed";

export interface LangfuseCaseResult {
  id: string;
  kind: string;
  question: string;
  filters?: unknown;
  guardrail: string;
  error?: string;
  scores: Record<string, { pass: boolean; detail?: string; skipped?: boolean }>;
}

export interface RecordRunParams {
  runName: string;
  trigger: EvalTrigger;
  commitSha: string;
  results: LangfuseCaseResult[];
  summary: RunSummary;
}

function getClient(): LangfuseClient {
  const publicKey = process.env.EVAL_LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.EVAL_LANGFUSE_SECRET_KEY;
  if (!publicKey || !secretKey) {
    throw new Error(
      "evals/langfuse-run requires EVAL_LANGFUSE_PUBLIC_KEY and EVAL_LANGFUSE_SECRET_KEY in the environment."
    );
  }

  const { Langfuse } = require("langfuse") as typeof import("langfuse");
  return new Langfuse({
    publicKey,
    secretKey,
    baseUrl: process.env.EVAL_LANGFUSE_HOST || undefined,
  });
}

/** Records one dataset run: upserts the dataset and its items, then one trace+score+run-item per case. */
export async function recordDatasetRun(params: RecordRunParams): Promise<void> {
  const langfuse = getClient();

  await langfuse.createDataset(DATASET_NAME);

  const runMetadata = { trigger: params.trigger, commitSha: params.commitSha, summary: params.summary };

  for (const result of params.results) {
    await langfuse.createDatasetItem({
      datasetName: DATASET_NAME,
      id: result.id,
      input: { question: result.question, filters: result.filters ?? null },
    });

    const trace = langfuse.trace({
      name: `ask-eval:${result.id}`,
      tags: ["eval"],
      metadata: { kind: result.kind, guardrail: result.guardrail, error: result.error },
    });

    for (const [scorerName, score] of Object.entries(result.scores)) {
      if (score.skipped) continue;
      trace.score({ name: scorerName, value: score.pass ? 1 : 0, comment: score.detail });
    }

    await langfuse.createDatasetRunItem({
      runName: params.runName,
      datasetItemId: result.id,
      traceId: trace.id,
      metadata: runMetadata,
    });
  }

  await langfuse.flushAsync();
}

/** The last weekly run's per-scorer summary on main, or null if none has run yet. */
export async function fetchWeeklyBaselineSummary(): Promise<RunSummary | null> {
  const langfuse = getClient();
  const { data: runs } = await langfuse.getDatasetRuns(DATASET_NAME);
  return pickLatestWeeklyBaseline(runs);
}

export const LANGFUSE_FAILURE_WARNING =
  "Langfuse recording failed (401) — eval result stands, baseline comparison skipped";

export interface RecordEvalRunResult {
  /** Whether the record-and-fetch-baseline path completed without a Langfuse failure. */
  ok: boolean;
  /** The weekly baseline, or null if not requested, not found, or the fetch failed. */
  baseline: RunSummary | null;
}

/**
 * Records the run and, on request, fetches the weekly baseline — but never
 * throws. Any Langfuse failure anywhere in this path (expired credentials,
 * network error, a malformed response) is caught once here, logged as a
 * single warning, and reported back as `ok: false` so the caller can skip
 * regression comparison without changing the eval's exit code.
 */
export async function recordEvalRunSafely(
  params: RecordRunParams,
  fetchBaseline: boolean
): Promise<RecordEvalRunResult> {
  try {
    await recordDatasetRun(params);
    console.log("Recorded.");
    const baseline = fetchBaseline ? await fetchWeeklyBaselineSummary() : null;
    return { ok: true, baseline };
  } catch (err) {
    console.warn(LANGFUSE_FAILURE_WARNING);
    return { ok: false, baseline: null };
  }
}
