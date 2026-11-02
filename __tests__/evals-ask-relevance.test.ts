import { scoreAnswer, buildErrorCaseResult } from "../evals/run-ask-eval";

jest.mock("../lib/ask", () => ({}));
jest.mock("../lib/rag", () => ({ searchSchools: jest.fn() }));
jest.mock("@anthropic-ai/sdk", () => jest.fn());

const types = { A: ["screened"], B: ["screened"], C: ["open"] };

function answer(dbns: string[], guardrail = "none") {
  return {
    answer: "ok",
    guardrail,
    retrieved: [],
    sources: [],
    reasons: dbns.map((dbn) => ({ dbn, reason: "r" })),
    model: "m",
  } as never;
}

function run(expect: unknown, dbns: string[], guardrail = "none") {
  const c = { id: "x", kind: "relevance", question: "q", expect } as never;
  return scoreAnswer(c, answer(dbns, guardrail), [], false, types);
}

describe("ask eval relevance score", () => {
  it("scores all_of", () => {
    expect(run({ type: "all_of", dbns: ["A", "B"] }, ["A", "B"]).scores.relevance.pass).toBe(true);
    expect(run({ type: "all_of", dbns: ["A", "B"] }, ["A"]).scores.relevance.pass).toBe(false);
  });

  it("scores min_of", () => {
    const e = { type: "min_of", k: 2, dbns: ["A", "B", "C"] };
    expect(run(e, ["A", "C"]).scores.relevance.pass).toBe(true);
    expect(run(e, ["A"]).scores.relevance.pass).toBe(false);
  });

  it("scores min_share using admissions types", () => {
    const e = { type: "min_share", k: 2, admissions_types: ["screened"] };
    expect(run(e, ["A", "B", "C"]).scores.relevance.pass).toBe(true);
    expect(run(e, ["A", "C"]).scores.relevance.pass).toBe(false);
  });

  it("fails relevance on a non-none guardrail", () => {
    const e = { type: "all_of", dbns: ["A"] };
    expect(run(e, ["A"], "off_topic").scores.relevance.pass).toBe(false);
  });

  it("has no relevance key without expect", () => {
    const c = { id: "x", kind: "vague", question: "q" } as never;
    expect(scoreAnswer(c, answer(["A"]), [], false, types).scores).not.toHaveProperty("relevance");
  });

  it("errored case with expect fails relevance", () => {
    const c = { id: "x", kind: "relevance", question: "q", expect: { type: "all_of", dbns: [] } } as never;
    expect(buildErrorCaseResult(c, "boom").scores.relevance).toEqual({ pass: false });
  });
});
