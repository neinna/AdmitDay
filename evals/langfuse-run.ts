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

import { randomBytes, randomUUID } from "crypto";
import { LangfuseClient } from "@langfuse/client";
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

  return new LangfuseClient({
    publicKey,
    secretKey,
    baseUrl: process.env.EVAL_LANGFUSE_HOST || undefined,
  });
}

/** Records one dataset run: upserts the dataset and its items, then one trace+score+run-item per case. */
export async function recordDatasetRun(params: RecordRunParams): Promise<void> {
  const client = getClient();

  try {
    await client.api.datasets.create({ name: DATASET_NAME });
  } catch (err) {
    // 409 means the dataset already exists, which is what we want.
    if ((err as { statusCode?: number; status?: number })?.statusCode !== 409 &&
        (err as { status?: number })?.status !== 409) {
      throw err;
    }
  }

  const runMetadata = { trigger: params.trigger, commitSha: params.commitSha, summary: params.summary };

  for (const result of params.results) {
    await client.api.datasetItems.create({
      datasetName: DATASET_NAME,
      id: result.id,
      input: { question: result.question, filters: result.filters ?? null },
    });

    const traceId = randomBytes(16).toString("hex");

    await client.api.ingestion.batch({
      batch: [
        {
          type: "trace-create",
          id: randomUUID(),
          timestamp: new Date().toISOString(),
          body: {
            id: traceId,
            name: `ask-eval:${result.id}`,
            tags: ["eval"],
            metadata: { kind: result.kind, guardrail: result.guardrail, error: result.error },
          },
        },
      ],
    });

    for (const [scorerName, score] of Object.entries(result.scores)) {
      if (score.skipped) continue;
      client.score.create({ traceId, name: scorerName, value: score.pass ? 1 : 0, comment: score.detail });
    }

    await client.api.datasetRunItems.create({
      runName: params.runName,
      datasetItemId: result.id,
      traceId,
      metadata: runMetadata,
    });
  }

  await client.flush();
}

/** The last weekly run's per-scorer summary on main, or null if none has run yet. */
export async function fetchWeeklyBaselineSummary(): Promise<RunSummary | null> {
  const client = getClient();
  const { data: runs } = await client.api.datasets.getRuns(DATASET_NAME);
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
