/**
 * evals/run-ask-eval.ts
 *
 * Issue #284: runs every case in evals/ask-seed.json through
 * lib/ask.ts's answerQuestion() — the same retrieval, prompt, and
 * guardrails the /find ask box uses — against the committed schools.json
 * and data/school-embeddings.json (no Postgres, no rate limiting). Scores
 * each answer with evals/scorers.ts and writes a timestamped results file.
 *
 * Issue #285: also records the run to Langfuse as a dataset run
 * (evals/langfuse-run.ts) and, on a pull_request trigger, gates on that
 * history — see evals/gate.ts for the pass/fail rules.
 *
 * Requires ANTHROPIC_API_KEY, OPENAI_API_KEY, EVAL_LANGFUSE_PUBLIC_KEY and
 * EVAL_LANGFUSE_SECRET_KEY from the environment — every run is recorded to
 * Langfuse, so a missing key fails the run rather than silently skipping
 * history. Deliberately never reads a .env file — the CI/production
 * environment is the only source of these keys here.
 *
 * Run:
 *   npm run eval:ask
 *
 * Exits non-zero if the hallucination or admissions-odds scorer passes
 * under 100% of applicable cases, if a pull_request run drops any other
 * scorer more than 10 points below the last weekly run on main, or if the
 * run's summed model cost passes $6 (evals/gate.ts COST_LIMIT_USD).
 */

import fs from "fs";
import path from "path";
import { answerQuestion } from "../lib/ask";
import { estimateCostUsd } from "../lib/model-cost";
import {
  scoreNoBannedPhrases,
  scoreNoAdmissionsOddsLanguage,
  scoreHallucination,
  scoreCoverage,
  scoreMissingDataNotShownAsZero,
  ScorerResult,
} from "./scorers";
import {
  findMissingEnvKeys,
  resolveTrigger,
  buildRunName,
  computeRegressions,
  buildCostGuardAbortMessage,
  REGRESSION_THRESHOLD_POINTS,
  COST_LIMIT_USD,
} from "./gate";
import { recordEvalRunSafely } from "./langfuse-run";

interface SeedCase {
  id: string;
  kind: string;
  question: string;
  filters?: { boroughs?: string[]; tracks?: string[]; size?: string };
}

interface SeedFile {
  source: string;
  cases: SeedCase[];
}

// Applicable only when the model's own descriptive text reaches the parent —
// off-topic/blocked/empty answers are canned copy that never names or
// describes a school, so scoring them for hallucination/coverage/missing
// data would just measure the guardrail copy instead of the model.
const DESCRIPTIVE_GUARDRAILS = new Set(["none", "prediction_preface"]);

interface CaseResult {
  id: string;
  kind: string;
  question: string;
  filters?: SeedCase["filters"];
  guardrail: string;
  error?: string;
  scores: Record<string, ScorerResult & { skipped?: boolean }>;
  costUsd?: number;
}

function loadSeedCases(): SeedCase[] {
  const seedPath = path.resolve(process.cwd(), "evals", "ask-seed.json");
  const seed: SeedFile = JSON.parse(fs.readFileSync(seedPath, "utf-8"));
  return seed.cases;
}

function loadAllSchoolNames(): string[] {
  const schoolsPath = path.resolve(process.cwd(), "schools.json");
  const schools: { name: string }[] = JSON.parse(fs.readFileSync(schoolsPath, "utf-8"));
  return Array.from(new Set(schools.map((s) => s.name)));
}

async function runCase(seedCase: SeedCase, allSchoolNames: string[]): Promise<CaseResult> {
  try {
    const result = await answerQuestion({ question: seedCase.question, filters: seedCase.filters });
    const retrievedNames = result.retrieved.map((r) => r.name);
    const retrievedChunks = result.retrieved.map((r) => r.chunk);

    const scores: CaseResult["scores"] = {
      noBannedPhrases: scoreNoBannedPhrases(result.answer),
      noAdmissionsOddsLanguage: scoreNoAdmissionsOddsLanguage(result.answer),
    };

    if (DESCRIPTIVE_GUARDRAILS.has(result.guardrail)) {
      scores.hallucination = scoreHallucination(result.answer, retrievedNames, allSchoolNames);
      scores.coverage = scoreCoverage(result.answer, retrievedNames);
      scores.missingDataNotShownAsZero = scoreMissingDataNotShownAsZero(result.answer, retrievedChunks);
    } else {
      scores.hallucination = { pass: true, skipped: true };
      scores.coverage = { pass: true, skipped: true };
      scores.missingDataNotShownAsZero = { pass: true, skipped: true };
    }

    return {
      id: seedCase.id,
      kind: seedCase.kind,
      question: seedCase.question,
      filters: seedCase.filters,
      guardrail: result.guardrail,
      scores,
      costUsd: estimateCostUsd(result.model, result.usage?.input_tokens, result.usage?.output_tokens),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // An errored case can't vouch for its own safety — count it as a
    // failure on every scorer rather than silently excluding it.
    const failed: ScorerResult = { pass: false, detail: `case failed: ${message}` };
    return {
      id: seedCase.id,
      kind: seedCase.kind,
      question: seedCase.question,
      filters: seedCase.filters,
      guardrail: "error",
      error: message,
      scores: {
        noBannedPhrases: failed,
        noAdmissionsOddsLanguage: failed,
        hallucination: failed,
        coverage: failed,
        missingDataNotShownAsZero: failed,
      },
    };
  }
}

function summarize(results: CaseResult[]): Record<string, { passed: number; total: number; rate: number }> {
  const scorerNames = [
    "noBannedPhrases",
    "noAdmissionsOddsLanguage",
    "hallucination",
    "coverage",
    "missingDataNotShownAsZero",
  ];
  const summary: Record<string, { passed: number; total: number; rate: number }> = {};
  for (const name of scorerNames) {
    let passed = 0;
    let total = 0;
    for (const result of results) {
      const score = result.scores[name];
      if (!score || score.skipped) continue;
      total += 1;
      if (score.pass) passed += 1;
    }
    summary[name] = { passed, total, rate: total === 0 ? 1 : passed / total };
  }
  return summary;
}

async function main() {
  const missingEnvKeys = findMissingEnvKeys(process.env);
  if (missingEnvKeys.length > 0) {
    console.error(`eval:ask requires ${missingEnvKeys.join(", ")} in the environment.`);
    process.exit(1);
    return;
  }

  const trigger = resolveTrigger(process.env.EVAL_TRIGGER);
  const runName = buildRunName(trigger, process.env.GITHUB_RUN_ID ?? String(Date.now()));
  const commitSha = process.env.GITHUB_SHA ?? "local";

  const cases = loadSeedCases();
  const allSchoolNames = loadAllSchoolNames();

  console.log(`Running ${cases.length} ask-box eval cases (trigger=${trigger}, run=${runName})...`);

  const results: CaseResult[] = [];
  let totalCostUsd = 0;
  let aborted = false;
  for (const seedCase of cases) {
    const result = await runCase(seedCase, allSchoolNames);
    results.push(result);
    totalCostUsd += result.costUsd ?? 0;
    console.log(
      `  ${result.error ? "ERROR" : "ok"} ${result.id} [${result.kind}] guardrail=${result.guardrail} ` +
        `(running cost: $${totalCostUsd.toFixed(4)})`
    );

    if (totalCostUsd > COST_LIMIT_USD) {
      console.error(
        `\n${buildCostGuardAbortMessage({
          lastCaseId: result.id,
          casesRun: results.length,
          totalCases: cases.length,
          totalCostUsd,
        })}`
      );
      aborted = true;
      break;
    }
  }

  if (aborted) {
    process.exit(1);
    return;
  }

  const summary = summarize(results);

  console.log("\nPer-scorer pass rate:");
  console.table(
    Object.fromEntries(
      Object.entries(summary).map(([name, { passed, total, rate }]) => [
        name,
        { passed, total, rate: `${(rate * 100).toFixed(1)}%` },
      ])
    )
  );
  console.log(`Summed model cost: $${totalCostUsd.toFixed(4)}`);

  const resultsDir = path.resolve(process.cwd(), "evals", "results");
  fs.mkdirSync(resultsDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = path.join(resultsDir, `${timestamp}.json`);
  fs.writeFileSync(outPath, JSON.stringify({ timestamp, trigger, runName, summary, results }, null, 2));
  console.log(`\nWrote ${outPath}`);

  console.log(`\nRecording dataset run "${runName}" to Langfuse (dataset: ask-seed)...`);
  const { ok: telemetryOk, baseline } = await recordEvalRunSafely(
    { runName, trigger, commitSha, results, summary },
    trigger === "pull_request"
  );

  const gatingScorers = ["hallucination", "noAdmissionsOddsLanguage"];
  const failedGate = gatingScorers.filter((name) => summary[name].rate < 1);

  let regressions: string[] = [];
  if (trigger === "pull_request" && telemetryOk) {
    if (baseline) {
      regressions = computeRegressions(summary, baseline, gatingScorers);
    } else {
      console.warn("No weekly baseline run found yet on the ask-seed dataset — skipping regression comparison.");
    }
  }

  if (failedGate.length > 0 || regressions.length > 0) {
    if (failedGate.length > 0) {
      console.error(`\nFAIL: ${failedGate.join(", ")} did not pass 100% of applicable cases.`);
    }
    if (regressions.length > 0) {
      console.error(`\nFAIL: regressed more than ${REGRESSION_THRESHOLD_POINTS} points below the last weekly run on main:`);
      for (const regression of regressions) console.error(`  - ${regression}`);
    }
    process.exit(1);
    return;
  }

  console.log("\nAll gating checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
