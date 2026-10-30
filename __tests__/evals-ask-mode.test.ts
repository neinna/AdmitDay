import fs from "fs";
import { main } from "../evals/run-retrieval-eval";
import { answerQuestion } from "../lib/ask";

jest.mock("../lib/ask", () => ({ ASK_RETRIEVAL_COUNT: 20, answerQuestion: jest.fn() }));
jest.mock("../lib/rag", () => ({ searchSchools: jest.fn() }));
const scorers = require("../evals/retrieval-scorers");

const mockAsk = answerQuestion as jest.Mock;

describe("eval --ask mode", () => {
  const env = { ...process.env };
  let logs: string[];
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "o";
    process.env.ANTHROPIC_API_KEY = "a";
    logs = [];
    jest.spyOn(console, "log").mockImplementation((m) => void logs.push(String(m)));
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(fs, "writeFileSync").mockImplementation(() => {});
    jest.spyOn(fs, "mkdirSync").mockImplementation(() => undefined);
  });
  afterEach(() => {
    process.env = { ...env };
    jest.restoreAllMocks();
    mockAsk.mockReset();
  });

  it("scores the reasons in the order answerQuestion returned them", async () => {
    mockAsk.mockResolvedValue({
      guardrail: "none",
      reasons: [{ dbn: "C" }, { dbn: "A" }, { dbn: "B" }],
    });
    const spy = jest.spyOn(scorers, "scoreAllOf");
    await main(["--ask"]);
    expect(spy.mock.calls.length).toBeGreaterThan(0);
    expect(spy.mock.calls[0][0]).toEqual(["C", "A", "B"]);
    expect(logs.some((l) => /^Ask: \d+\/15 passed$/.test(l))).toBe(true);
  });

  it("fails a case whose guardrail is off_topic", async () => {
    mockAsk.mockResolvedValue({ guardrail: "off_topic", reasons: [] });
    await main(["--ask"]);
    expect(logs).toContain("Ask: 0/15 passed");
    expect(logs.some((l) => l.includes("guardrail: off_topic"))).toBe(true);
  });

  it("exits 1 naming ANTHROPIC_API_KEY when it is missing", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const exit = jest.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("exit");
    }) as never);
    await expect(main(["--ask"])).rejects.toThrow("exit");
    expect(exit).toHaveBeenCalledWith(1);
    expect(console.error).toHaveBeenCalledWith("ANTHROPIC_API_KEY is required");
  });
});
