/**
 * __tests__/model-cost.test.ts
 *
 * Issue #450: the Anthropic Batch API is 50% off every token, so
 * evals/run-ask-eval.ts's batch path must report half the cost a synchronous
 * call with the same usage would report — otherwise the weekly log and
 * Langfuse cost history read 2x too high, and the $6 cost guard (evals/gate.ts)
 * ends up stricter than intended.
 */

import { estimateCostUsd } from '../lib/model-cost'

describe('estimateCostUsd (issue #450 batch discount)', () => {
  it('defaults to full list price when isBatch is not passed', () => {
    const cost = estimateCostUsd('claude-sonnet-5', 1_000_000, 1_000_000)
    expect(cost).toBe(2 + 10)
  })

  it('prices claude-haiku-5-5 at $0.10 / $0.50 per million tokens', () => {
    expect(estimateCostUsd('claude-haiku-5-5', 1_000_000, 1_000_000)).toBeCloseTo(0.6, 10)
  })

  it('halves the cost when isBatch is true', () => {
    const syncCost = estimateCostUsd('claude-sonnet-5', 1_000_000, 1_000_000, false)
    const batchCost = estimateCostUsd('claude-sonnet-5', 1_000_000, 1_000_000, true)

    expect(batchCost).toBe((syncCost as number) / 2)
    expect(batchCost).toBe(6)
  })

  it('still returns undefined for an unknown model regardless of isBatch', () => {
    expect(estimateCostUsd('some-other-model', 100, 100, true)).toBeUndefined()
  })
})
