import { formatAskNotice, summarize } from "../evals/run-ask-eval";

const ok = { pass: true };

describe("formatAskNotice", () => {
  const results = [
    {
      id: "a",
      kind: "k",
      question: "q",
      guardrail: "none",
      scores: {
        noBannedPhrases: ok,
        noAdmissionsOddsLanguage: ok,
        hallucination: ok,
        coverage: ok,
        missingDataNotShownAsZero: ok,
        numbersGrounded: ok,
        relevance: { pass: true, missing: [] },
      },
    },
    {
      id: "b",
      kind: "k",
      question: "q",
      guardrail: "none",
      scores: {
        noBannedPhrases: ok,
        noAdmissionsOddsLanguage: ok,
        hallucination: ok,
        coverage: { pass: true, skipped: true },
        missingDataNotShownAsZero: ok,
        numbersGrounded: ok,
        relevance: { pass: false, missing: ["01M001", "02M002"] },
      },
    },
  ];

  const notice = formatAskNotice(results, summarize(results), "claude-test");
  const body = notice.split("::").slice(2).join("::").split("%0A");

  it("starts with the notice title", () => {
    expect(notice.startsWith("::notice title=Ask eval 1/2 (claude-test)::")).toBe(true);
    expect(notice.startsWith("::notice title=Ask eval ")).toBe(true);
  });

  it("holds one line per scorer, then one per relevance case", () => {
    expect(body).toHaveLength(7 + 2);
    expect(body[3]).toBe("coverage  1/1");
    expect(body[6]).toBe("relevance  1/2");
    expect(body[7]).toBe("a  pass  missing: -");
    expect(body[8]).toBe("b  FAIL  missing: 01M001, 02M002");
  });
});
