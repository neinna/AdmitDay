import fs from "fs";
import { main } from "../evals/run-retrieval-eval";

const mockBatchCreate = jest.fn();
const mockResults = jest.fn();

jest.mock("@anthropic-ai/sdk", () =>
  jest.fn().mockImplementation(() => ({
    messages: {
      batches: {
        create: (...a: unknown[]) => mockBatchCreate(...a),
        retrieve: jest.fn(),
        results: (...a: unknown[]) => mockResults(...a),
      },
    },
  }))
);
jest.mock("../lib/ask", () => ({
  ASK_MODEL: "m",
  ASK_RETRIEVAL_COUNT: 20,
  answerQuestion: jest.fn(),
  prepareAskRequest: jest.fn(async (q: string) => ({ results: [], request: { q } })),
  buildAnswerResult: jest.fn(() => ({ guardrail: "none", reasons: [{ dbn: "X" }] })),
}));
jest.mock("../lib/rag", () => ({ searchSchools: jest.fn() }));
jest.mock("../evals/batch", () => ({
  pollBatchUntilEnded: jest.fn(async () => ({ id: "b1" })),
  indexBatchResultsByCustomId: jest.fn((items: { custom_id: string; result: unknown }[]) =>
    Object.fromEntries(items.map((i) => [i.custom_id, i.result]))
  ),
}));

const seed = JSON.parse(fs.readFileSync(require.resolve("../evals/retrieval-seed.json"), "utf-8"));

describe("eval --ask weekly batch path", () => {
  const env = { ...process.env };
  let logs: string[];
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "o";
    process.env.ANTHROPIC_API_KEY = "a";
    process.env.EVAL_TRIGGER = "weekly";
    logs = [];
    jest.spyOn(console, "log").mockImplementation((m) => void logs.push(String(m)));
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(fs, "writeFileSync").mockImplementation(() => {});
    jest.spyOn(fs, "mkdirSync").mockImplementation(() => undefined);
    mockBatchCreate.mockReset().mockResolvedValue({ id: "b1" });
  });
  afterEach(() => {
    process.env = { ...env };
    jest.restoreAllMocks();
  });

  function streamOf(items: unknown[]) {
    mockResults.mockResolvedValue({
      async *[Symbol.asyncIterator]() {
        for (const i of items) yield i;
      },
    });
  }

  it("submits one batch with a request per case id", async () => {
    streamOf([]);
    await main(["--ask"]);
    expect(mockBatchCreate).toHaveBeenCalledTimes(1);
    const { requests } = mockBatchCreate.mock.calls[0][0];
    expect(requests).toHaveLength(15);
    expect(requests.map((r: { custom_id: string }) => r.custom_id)).toEqual(
      seed.cases.map((c: { id: string }) => c.id)
    );
  });

  it("fails a case whose result is not succeeded or is missing", async () => {
    const [first, second] = seed.cases;
    streamOf([
      { custom_id: first.id, result: { type: "errored" } },
      { custom_id: second.id, result: { type: "succeeded", message: {} } },
    ]);
    await main(["--ask"]);
    expect(logs.some((l) => l.startsWith(first.id) && l.includes("batch result errored"))).toBe(true);
    expect(logs.some((l) => l.includes("missing from batch results"))).toBe(true);
  });
});
