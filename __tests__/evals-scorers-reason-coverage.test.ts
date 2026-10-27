/**
 * __tests__/evals-scorers-reason-coverage.test.ts
 *
 * Coverage compares retrieved DBNs with the DBNs that got a reason; the
 * answer the parent sees is built from those reasons (lib/ask.ts).
 */

import { scoreReasonCoverage } from '../evals/scorers'

const retrieved = [
  { dbn: '01M292', name: 'Park East High School' },
  { dbn: '04M495', name: 'Central Park East High School' },
]

describe('scoreReasonCoverage', () => {
  it('passes when every retrieved school has a reason', () => {
    const result = scoreReasonCoverage(retrieved, [{ dbn: '01M292' }, { dbn: '04M495' }])
    expect(result.pass).toBe(true)
  })

  it('fails and names the school with no reason', () => {
    const result = scoreReasonCoverage(retrieved, [{ dbn: '04M495' }])
    expect(result.pass).toBe(false)
    expect(result.detail).toBe('no reason for: Park East High School')
  })
})
