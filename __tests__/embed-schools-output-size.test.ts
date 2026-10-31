process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key'

import { roundEmbedding, isWithinSizeLimit } from "../scripts/embed-schools";

const MB = 1024 * 1024;

describe("embed-schools output size", () => {
  it("rounds embedding values to 6 decimals", () => {
    expect(roundEmbedding([0.1234567891, -0.1234567891])).toEqual([0.123457, -0.123457]);
  });

  it("fails a 96 MB file", () => {
    expect(isWithinSizeLimit(96 * MB)).toBe(false);
  });

  it("passes a 50 MB file", () => {
    expect(isWithinSizeLimit(50 * MB)).toBe(true);
  });
});
