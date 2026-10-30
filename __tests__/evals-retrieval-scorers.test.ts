import fs from "fs";
import path from "path";
import { scoreAllOf, scoreMinOf, scoreMinShare } from "../evals/retrieval-scorers";

const filler = (n: number) => Array.from({ length: n }, (_, i) => `F${i}`);

describe("scoreAllOf", () => {
  it("passes when everything is in the top 20", () => {
    const r = scoreAllOf([...filler(18), "A", "B"], ["A", "B"]);
    expect(r.pass).toBe(true);
    expect(r.hitsTop20).toBe(2);
    expect(r.hitsTop10).toBe(0);
  });

  it("fails when one is at position 21 and reports it missing", () => {
    const r = scoreAllOf([...filler(19), "A", "B"], ["A", "B"]);
    expect(r.pass).toBe(false);
    expect(r.missing).toEqual(["B"]);
  });
});

describe("scoreMinOf", () => {
  const results = [...filler(17), "A", "B", "C", "D"];
  it("passes at exactly k", () => {
    expect(scoreMinOf(results, ["A", "B", "C", "X"], 3).pass).toBe(true);
  });
  it("fails at k - 1", () => {
    expect(scoreMinOf(results, ["A", "B", "X", "Y"], 3).pass).toBe(false);
  });
});

describe("scoreMinShare", () => {
  it("counts only the top 20", () => {
    const types: Record<string, string[]> = {};
    const results = filler(25);
    results.forEach((d, i) => (types[d] = i < 18 || i >= 20 ? ["ASD / ACES"] : []));
    const r = scoreMinShare(results, types, ["ASD / ACES"], 18);
    expect(r.count).toBe(18);
    expect(r.pass).toBe(true);
    expect(scoreMinShare(results, types, ["ASD / ACES"], 19).pass).toBe(false);
  });
});

describe("retrieval seed", () => {
  const seed = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../evals/retrieval-seed.json"), "utf-8")
  );
  it("has 15 cases with valid DBNs and types", () => {
    expect(seed.cases).toHaveLength(15);
    for (const c of seed.cases) {
      expect(["all_of", "min_of", "min_share"]).toContain(c.expect.type);
      for (const d of c.expect.dbns ?? []) expect(d).toMatch(/^\d{2}[MKXQR]\d{3}$/);
    }
  });
});
