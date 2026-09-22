/**
 * evals/gate.ts
 *
 * Issue #285: pure decision logic for the nightly/PR ask-eval gate, kept
 * separate from evals/langfuse-run.ts (the network calls) so it can be unit
 * tested without a Langfuse client.
 */

export interface ScorerSummary {
  passed: number;
  total: number;
  rate: number;
}

export type RunSummary = Record<string, ScorerSummary>;

export const NIGHTLY_RUN_PREFIX = "nightly-";

/** Percentage-point drop that fails a PR run relative to the last nightly run on main. */
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

export type EvalTrigger = "nightly" | "pull_request" | "manual";

export function resolveTrigger(rawTrigger: string | undefined): EvalTrigger {
  if (rawTrigger === "nightly" || rawTrigger === "pull_request") return rawTrigger;
  return "manual";
}

export function buildRunName(trigger: EvalTrigger, runId: string): string {
  if (trigger === "nightly") return `${NIGHTLY_RUN_PREFIX}${runId}`;
  return `${trigger}-${runId}`;
}

interface DatasetRunLike {
  name: string;
  createdAt: string;
  metadata?: unknown;
}

/**
 * The most recent nightly run's summary, or null if none exists yet (e.g.
 * the very first PR run before any nightly run has landed on main).
 */
export function pickLatestNightlyBaseline(runs: DatasetRunLike[]): RunSummary | null {
  const nightlyRuns = runs.filter((r) => r.name.startsWith(NIGHTLY_RUN_PREFIX));
  if (nightlyRuns.length === 0) return null;

  const latest = nightlyRuns.reduce((a, b) =>
    new Date(a.createdAt).getTime() >= new Date(b.createdAt).getTime() ? a : b
  );

  const metadata = latest.metadata as { summary?: RunSummary } | null | undefined;
  return metadata?.summary ?? null;
}

/**
 * Scorers other than `excludeScorers` (the ones already gated at 100%) that
 * dropped more than REGRESSION_THRESHOLD_POINTS below the nightly baseline.
 * Returns human-readable descriptions, one per regressed scorer.
 */
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
        `${name}: ${(stat.rate * 100).toFixed(1)}% vs nightly baseline ${(base.rate * 100).toFixed(1)}% ` +
          `(-${dropPoints.toFixed(1)} pts)`
      );
    }
  }
  return regressions;
}
