/**
 * evals/run-retrieval-eval.ts
 *
 * Retrieval relevance eval: runs every case in evals/retrieval-seed.json
 * through lib/rag.ts's searchSchools() only (OpenAI embeddings, no Claude)
 * and scores the top ASK_RETRIEVAL_COUNT DBNs. Writes
 * evals/results/retrieval-<ISO timestamp>.json.
 *
 * Requires OPENAI_API_KEY from the environment; never reads a .env file.
 * Exits 0 whatever the pass count (baseline run, does not gate). Exits 1
 * only when the key is missing or a search call throws.
 *
 * Run:
 *   npm run eval:retrieval
 */

import fs from "fs";
import path from "path";
import { ASK_RETRIEVAL_COUNT } from "../lib/ask";
import { searchSchools } from "../lib/rag";
import { scoreAllOf, scoreMinOf, scoreMinShare } from "./retrieval-scorers";

type Expect =
  | { type: "all_of"; dbns: string[] }
  | { type: "min_of"; k: number; dbns: string[] }
  | { type: "min_share"; k: number; admissions_types: string[] };

interface SeedCase {
  id: string;
  question: string;
  filters: Record<string, unknown>;
  expect: Expect;
}

async function main(): Promise<void> {
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is required");
    process.exit(1);
  }

  const seed: { cases: SeedCase[] } = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "retrieval-seed.json"), "utf-8")
  );
  const schools: { dbn: string; admissions_types?: string[] }[] = JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), "schools.json"), "utf-8")
  );
  const typesByDbn: Record<string, string[]> = {};
  for (const s of schools) typesByDbn[s.dbn] = s.admissions_types ?? [];

  const rows: Record<string, unknown>[] = [];
  let passed = 0;

  for (const c of seed.cases) {
    let results: string[];
    try {
      const found = await searchSchools(c.question, ASK_RETRIEVAL_COUNT, c.filters);
      results = found.map((r) => r.dbn);
    } catch (err) {
      console.error(`Search failed for ${c.id}:`, err);
      process.exit(1);
    }

    const e = c.expect;
    let row: Record<string, unknown>;
    let summary: string;
    if (e.type === "all_of" || e.type === "min_of") {
      const s = e.type === "all_of" ? scoreAllOf(results, e.dbns) : scoreMinOf(results, e.dbns, e.k);
      row = { id: c.id, type: e.type, ...s };
      summary = `${s.hitsTop10}/${s.hitsTop20}  missing: ${s.missing.join(",") || "-"}`;
    } else {
      const s = scoreMinShare(results, typesByDbn, e.admissions_types, e.k);
      row = { id: c.id, type: e.type, ...s };
      summary = `count ${s.count}/${e.k}`;
    }
    if (row.pass) passed++;
    rows.push({ ...row, top20: results.slice(0, ASK_RETRIEVAL_COUNT) });
    console.log(`${c.id}  ${row.pass ? "pass" : "FAIL"}  ${summary}`);
  }

  console.log(`Retrieval: ${passed}/${seed.cases.length} passed`);

  const outDir = path.resolve(process.cwd(), "evals", "results");
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/:/g, "-");
  fs.writeFileSync(
    path.join(outDir, `retrieval-${stamp}.json`),
    JSON.stringify({ passed, total: seed.cases.length, cases: rows }, null, 2)
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
