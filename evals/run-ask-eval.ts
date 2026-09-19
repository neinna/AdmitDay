/**
 * evals/run-ask-eval.ts
 *
 * Issue #284: runs every case in evals/ask-seed.json through
 * lib/ask.ts's answerQuestion() — the same retrieval, prompt, and
 * guardrails the /find ask box uses — against the committed schools.json
 * and data/school-embeddings.json (no Postgres, no rate limiting, no
 * Langfuse). Scores each answer with evals/scorers.ts and writes a
 * timestamped results file.
 *
 * Requires ANTHROPIC_API_KEY and OPENAI_API_KEY from the environment.
 * Deliberately never reads a .env file — the CI/production environment is
 * the only source of these keys here.
 *
 * Run:
 *   npm run eval:ask
 *
 * Exits non-zero if the hallucination or admissions-odds scorer passes
 * under 100% of applicable cases — every other scorer is reported but does
 * not fail the run.
 */

import fs from "fs";
import path from "path";
import { answerQuestion } from "../lib/ask";
import {
  scoreNoBannedPhrases,
  scoreNoAdmissionsOddsLanguage,
  scoreHallucination,
  scoreCoverage,
  scoreMissingDataNotShownAsZero,
  ScorerResult,
} from "./scorers";

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
  guardrail: string;
  error?: string;
  scores: Record<string, ScorerResult & { skipped?: boolean }>;
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
      guardrail: result.guardrail,
      scores,
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
  if (!process.env.ANTHROPIC_API_KEY || !process.env.OPENAI_API_KEY) {
    console.error("eval:ask requires ANTHROPIC_API_KEY and OPENAI_API_KEY in the environment.");
    process.exit(1);
  }

  const cases = loadSeedCases();
  const allSchoolNames = loadAllSchoolNames();

  console.log(`Running ${cases.length} ask-box eval cases...`);

  const results: CaseResult[] = [];
  for (const seedCase of cases) {
    const result = await runCase(seedCase, allSchoolNames);
    results.push(result);
    console.log(`  ${result.error ? "ERROR" : "ok"} ${result.id} [${result.kind}] guardrail=${result.guardrail}`);
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

  const resultsDir = path.resolve(process.cwd(), "evals", "results");
  fs.mkdirSync(resultsDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = path.join(resultsDir, `${timestamp}.json`);
  fs.writeFileSync(outPath, JSON.stringify({ timestamp, summary, results }, null, 2));
  console.log(`\nWrote ${outPath}`);

  const gatingScorers = ["hallucination", "noAdmissionsOddsLanguage"];
  const failedGate = gatingScorers.filter((name) => summary[name].rate < 1);
  if (failedGate.length > 0) {
    console.error(
      `\nFAIL: ${failedGate.join(", ")} did not pass 100% of applicable cases.`
    );
    process.exit(1);
  }

  console.log("\nAll gating scorers passed 100%.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
