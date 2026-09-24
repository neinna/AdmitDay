/**
 * __tests__/evals-gate-baseline-tolerance.test.ts
 *
 * Issue #455: pickLatestWeeklyBaseline must tolerate a missing or empty run
 * list instead of throwing. fetchWeeklyBaselineSummary (evals/langfuse-run.ts)
 * hands it whatever a failed Langfuse fetch produced — that used to include
 * `undefined` — and it must come back with "no baseline" rather than
 * crashing the whole eval run.
 */

import { pickLatestWeeklyBaseline } from '../evals/gate'

describe('pickLatestWeeklyBaseline: tolerates a failed or empty Langfuse fetch', () => {
  it('returns null, not a throw, when runs is undefined', () => {
    expect(() => pickLatestWeeklyBaseline(undefined)).not.toThrow()
    expect(pickLatestWeeklyBaseline(undefined)).toBeNull()
  })

  it('returns null, not a throw, when runs is null', () => {
    expect(() => pickLatestWeeklyBaseline(null)).not.toThrow()
    expect(pickLatestWeeklyBaseline(null)).toBeNull()
  })

  it('returns null when runs is an empty array', () => {
    expect(pickLatestWeeklyBaseline([])).toBeNull()
  })
})
