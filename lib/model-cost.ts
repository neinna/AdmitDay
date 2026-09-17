/**
 * lib/model-cost.ts
 *
 * Best-effort USD cost for a completion, computed from published per-model
 * token pricing. Used only for the Langfuse trace (lib/trace.ts) — never
 * shown to users, never affects a request. Unknown models return undefined
 * rather than guessing.
 */

const PRICE_PER_MILLION_TOKENS_USD: Record<string, { input: number; output: number }> = {
  "claude-sonnet-5": { input: 3, output: 15 },
};

export function estimateCostUsd(
  model: string | undefined,
  inputTokens: number | undefined,
  outputTokens: number | undefined
): number | undefined {
  if (!model || inputTokens == null || outputTokens == null) return undefined;
  const price = PRICE_PER_MILLION_TOKENS_USD[model];
  if (!price) return undefined;
  return (inputTokens / 1_000_000) * price.input + (outputTokens / 1_000_000) * price.output;
}
