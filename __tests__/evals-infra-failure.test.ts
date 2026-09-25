/**
 * __tests__/evals-infra-failure.test.ts
 *
 * Issue #465: describeInfraFailure() distinguishes a broken run (every case
 * threw before scoring) from a bad answer, and surfaces the real error
 * message(s) instead of a misleading scorer failure.
 */

import { describeInfraFailure } from '../evals/gate'

describe('describeInfraFailure', () => {
  it('returns one line with the total count when every case errored with the same message', () => {
    const results = Array.from({ length: 30 }, (_, i) => ({
      id: `case-${i}`,
      error: 'Langfuse 401: unauthorized',
    }))

    const message = describeInfraFailure(results)

    expect(message).toBe(
      'EVAL COULD NOT RUN: all 30 cases errored before scoring.\n' + '  30× Langfuse 401: unauthorized'
    )
  })

  it('sorts distinct error messages by count descending', () => {
    const results = [
      { id: 'a', error: 'rate limited' },
      { id: 'b', error: 'rate limited' },
      { id: 'c', error: 'timeout' },
    ]

    const message = describeInfraFailure(results)

    expect(message).toBe(
      'EVAL COULD NOT RUN: all 3 cases errored before scoring.\n' + '  2× rate limited\n' + '  1× timeout'
    )
  })

  it('returns null when at least one case succeeded', () => {
    const results = [
      { id: 'a', error: 'boom' },
      { id: 'b' },
      { id: 'c', error: 'boom' },
    ]

    expect(describeInfraFailure(results)).toBeNull()
  })

  it('returns null for an empty array', () => {
    expect(describeInfraFailure([])).toBeNull()
  })
})
