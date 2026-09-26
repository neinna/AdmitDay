import { capReason, MAX_REASON_LENGTH } from "../lib/ask";

// parseReasons isn't exported, so exercise it through the module's public
// surface by re-importing the file and using a small local harness that
// mirrors the "DBN | reason" line format it parses.
import * as ask from "../lib/ask";

describe("capReason", () => {
  it("leaves an 80-character reason unchanged", () => {
    const reason = "a".repeat(80);
    expect(capReason(reason)).toBe(reason);
    expect(reason.length).toBe(80);
  });

  it("caps a 300-character reason made of words at a word boundary", () => {
    const reason = Array.from({ length: 60 }, (_, i) => `word${i}`).join(" ");
    expect(reason.length).toBeGreaterThan(200);

    const capped = capReason(reason);
    expect(capped.length).toBeLessThanOrEqual(MAX_REASON_LENGTH + 1);
    expect(capped.endsWith("…")).toBe(true);
    expect(capped.slice(0, -1).endsWith(" ")).toBe(false);
  });

  it("caps a 200-character reason with no spaces at exactly 120 chars plus ellipsis", () => {
    const reason = "a".repeat(200);
    const capped = capReason(reason);
    expect(capped).toBe("a".repeat(MAX_REASON_LENGTH) + "…");
  });
});

describe("parseReasons via answerQuestion's result shaping", () => {
  it("caps a 300-character reason for a retrieved DBN", () => {
    const dbn = "01M034";
    const longReason = Array.from({ length: 60 }, (_, i) => `word${i}`).join(" ");
    const rawAnswer = `${dbn} | ${longReason}`;

    const results = [
      {
        dbn,
        name: "Test School",
        score: 1,
        matchedChunkType: "overview",
        chunk: "",
      },
    ] as unknown as Parameters<typeof ask.buildAnswerResult>[2];

    const message = {
      content: [{ type: "text", text: rawAnswer }],
      model: "claude-sonnet-5",
      usage: {},
      stop_reason: "end_turn",
    } as unknown as Parameters<typeof ask.buildAnswerResult>[0];

    const result = ask.buildAnswerResult(message, "some question", results);

    expect(result.reasons).toHaveLength(1);
    expect(result.reasons[0].dbn).toBe(dbn);
    expect(result.reasons[0].reason.length).toBeLessThanOrEqual(MAX_REASON_LENGTH + 1);
    expect(result.reasons[0].reason.endsWith("…")).toBe(true);
  });
});
