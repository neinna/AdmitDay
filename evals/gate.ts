/**
 * evals/gate.ts
 *
 * Issue #285: pure decision logic for the weekly/PR ask-eval gate, kept
 * separate from evals/langfuse-run.ts (the network calls) so it can be unit
 * tested without a Langfuse client.
 */

export interface ScorerSummary {
  passed: number;
  total: number;
  rate: number;
}

export type RunSummary = Record<string, ScorerSummary>;

export const WEEKLY_RUN_PREFIX = "weekly-";

/** The eval run aborts once summed model cost across all cases passes this. */
export const COST_LIMIT_USD = 6;

/**
 * Message logged when the running cost guard trips mid-run. Named as a pure
 * function so the count-of-cases-run and dollar formatting can be unit
 * tested without executing eval cases.
 */
export function buildCostGuardAbortMessage(params: {
  lastCaseId: string;
  casesRun: number;
  totalCases: number;
  totalCostUsd: number;
}): string {
  const { lastCaseId, casesRun, totalCases, totalCostUsd } = params;
  return (
    `FAIL: eval run aborted after ${casesRun} of ${totalCases} cases (last: ${lastCaseId}) — ` +
    `summed model cost $${totalCostUsd.toFixed(2)} passed the $${COST_LIMIT_USD.toFixed(2)} guard.`
  );
}

/** Percentage-point drop that fails a PR run relative to the last weekly run on main. */
export const REGRESSION_THRESHOLD_POINTS = 10;

/** Required for every eval:ask run, not just CI ones — the run must always be recorded. */
export const REQUIRED_EVAL_ENV_KEYS = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "EVAL_LANGFUSE_PUBLIC_KEY",
  "EVAL_LANGFUSE_SECRET_KEY",
] as const;

export function findMissingEnvKeys(env: Record<string, string | undefined>): string[] {
  return REQUIRED_EVAL_ENV_KEYS.filter((key) => !env[key]);
}

export type EvalTrigger = "weekly" | "pull_request" | "manual";

export function resolveTrigger(rawTrigger: string | undefined): EvalTrigger {
  if (rawTrigger === "weekly" || rawTrigger === "pull_request") return rawTrigger;
  return "manual";
}

export function buildRunName(trigger: EvalTrigger, runId: string): string {
  if (trigger === "weekly") return `${WEEKLY_RUN_PREFIX}${runId}`;
  return `${trigger}-${runId}`;
}

interface DatasetRunLike {
  name: string;
  createdAt: string;
  metadata?: unknown;
}

/**
 * The most recent weekly run's summary, or null if none exists yet (e.g.
 * the very first PR run before any weekly run has landed on main, or the
 * Langfuse fetch that would have returned the run list failed).
 */
export function pickLatestWeeklyBaseline(
  runs: DatasetRunLike[] | null | undefined
): RunSummary | null {
  const weeklyRuns = (runs ?? []).filter((r) => r.name.startsWith(WEEKLY_RUN_PREFIX));
  if (weeklyRuns.length === 0) return null;

  const latest = weeklyRuns.reduce((a, b) =>
    new Date(a.createdAt).getTime() >= new Date(b.createdAt).getTime() ? a : b
  );

  const metadata = latest.metadata as { summary?: RunSummary } | null | undefined;
  return metadata?.summary ?? null;
}

/**
 * Scorers other than `excludeScorers` (the ones already gated at 100%) that
 * dropped more than REGRESSION_THRESHOLD_POINTS below the weekly baseline.
 * Returns human-readable descriptions, one per regressed scorer.
 */
/**
 * Distinguishes a broken run (every case threw before scoring) from a bad
 * answer (cases ran and scored, but failed a quality bar). Returns null
 * unless every result errored, in which case it lists the distinct error
 * messages so the real cause shows up in the log instead of a scorer
 * failure message.
 */
export function describeInfraFailure(results: { id: string; error?: string }[]): string | null {
  if (results.length === 0) return null;
  if (results.some((r) => !r.error)) return null;

  const counts = new Map<string, number>();
  for (const result of results) {
    const message = result.error as string;
    counts.set(message, (counts.get(message) ?? 0) + 1);
  }

  const lines = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([message, count]) => `  ${count}× ${message}`);

  return [`EVAL COULD NOT RUN: all ${results.length} cases errored before scoring.`, ...lines].join("\n");
}

export function computeRegressions(
  current: RunSummary,
  baseline: RunSummary | null,
  excludeScorers: readonly string[]
): string[] {
  if (!baseline) return [];

  const regressions: string[] = [];
  for (const [name, stat] of Object.entries(current)) {
    if (excludeScorers.includes(name)) continue;
    const base = baseline[name];
    if (!base) continue;

    const dropPoints = (base.rate - stat.rate) * 100;
    if (dropPoints > REGRESSION_THRESHOLD_POINTS) {
      regressions.push(
        `${name}: ${(stat.rate * 100).toFixed(1)}% vs weekly baseline ${(base.rate * 100).toFixed(1)}% ` +
          `(-${dropPoints.toFixed(1)} pts)`
      );
    }
  }
  return regressions;
}
