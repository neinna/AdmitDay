import { formatRetrievalNotice } from "../evals/run-retrieval-eval";

describe("formatRetrievalNotice", () => {
  it("starts with the notice title", () => {
    expect(formatRetrievalNotice(3, 15, ["a"]).startsWith("::notice title=Retrieval eval 3/15::")).toBe(true);
  });

  it("joins lines with %0A", () => {
    expect(formatRetrievalNotice(1, 15, ["a", "b"]).endsWith("::a%0Ab")).toBe(true);
  });

  it("escapes % in a line", () => {
    expect(formatRetrievalNotice(1, 15, ["50% hit"])).toContain("50%25 hit");
  });

  it("has no raw newline", () => {
    const out = formatRetrievalNotice(1, 15, ["a\nb", "c\r\nd"]);
    expect(out).not.toMatch(/[\r\n]/);
    expect(out).toContain("a%0Ab%0Ac%0D%0Ad");
  });
});
