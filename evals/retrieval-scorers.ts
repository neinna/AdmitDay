/**
 * evals/retrieval-scorers.ts
 *
 * Pure scorers for the retrieval relevance eval (evals/run-retrieval-eval.ts).
 * `results` is the ordered DBN list returned by searchSchools.
 */

const TOP_N = 20;

export interface DbnScore {
  pass: boolean;
  hitsTop10: number;
  hitsTop20: number;
  missing: string[];
}

function scoreDbns(results: string[], dbns: string[]) {
  const top10 = new Set(results.slice(0, 10));
  const top20 = new Set(results.slice(0, TOP_N));
  return {
    hitsTop10: dbns.filter((d) => top10.has(d)).length,
    hitsTop20: dbns.filter((d) => top20.has(d)).length,
    missing: dbns.filter((d) => !top20.has(d)),
  };
}

export function scoreAllOf(results: string[], dbns: string[]): DbnScore {
  const s = scoreDbns(results, dbns);
  return { pass: s.missing.length === 0, ...s };
}

export function scoreMinOf(results: string[], dbns: string[], k: number): DbnScore {
  const s = scoreDbns(results, dbns);
  return { pass: s.hitsTop20 >= k, ...s };
}

export function scoreMinShare(
  results: string[],
  typesByDbn: Record<string, string[]>,
  admissionsTypes: string[],
  k: number
): { pass: boolean; count: number } {
  const count = results
    .slice(0, TOP_N)
    .filter((d) => (typesByDbn[d] ?? []).some((t) => admissionsTypes.includes(t))).length;
  return { pass: count >= k, count };
}
