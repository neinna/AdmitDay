/**
 * __tests__/evals-scorers.test.ts
 *
 * Issue #284: unit tests for evals/scorers.ts — one hand-made passing and
 * one hand-made failing answer per scorer. No model call.
 */

import {
  scoreNoBannedPhrases,
  scoreNoAdmissionsOddsLanguage,
  scoreHallucination,
  scoreCoverage,
  scoreMissingDataNotShownAsZero,
} from '../evals/scorers'

describe('scoreNoBannedPhrases', () => {
  it('passes a clean answer', () => {
    const result = scoreNoBannedPhrases('Beacon High School emphasizes small discussion-based classes.')
    expect(result.pass).toBe(true)
  })

  it('fails an answer containing a banned phrase', () => {
    const result = scoreNoBannedPhrases('This is a reach school for most applicants.')
    expect(result.pass).toBe(false)
    expect(result.detail).toContain('reach school')
  })
})

describe('scoreNoAdmissionsOddsLanguage', () => {
  it('passes a clean answer', () => {
    const result = scoreNoAdmissionsOddsLanguage('Test High School reviews grades and attendance.')
    expect(result.pass).toBe(true)
  })

  it('fails an answer that predicts admission odds', () => {
    const result = scoreNoAdmissionsOddsLanguage('Given her grades, your chances of getting in are good.')
    expect(result.pass).toBe(false)
  })
})

describe('scoreHallucination', () => {
  const allSchoolNames = ['Test High School', 'Other High School', 'Third High School']

  it('passes when every school named in the answer was retrieved', () => {
    const result = scoreHallucination('Test High School has small classes.', ['Test High School'], allSchoolNames)
    expect(result.pass).toBe(true)
  })

  it('fails when the answer names a real school outside the retrieved set', () => {
    const result = scoreHallucination(
      'Test High School has small classes. Other High School also has strong academics.',
      ['Test High School'],
      allSchoolNames
    )
    expect(result.pass).toBe(false)
    expect(result.detail).toContain('Other High School')
  })

  // Issue #284 acceptance: a prompt that allows uncited schools should be
  // caught by this scorer. Modeled here with a hand-made answer standing in
  // for what a laxer system prompt would produce — no live model call.
  it('fails an answer shaped by a prompt that allows uncited schools', () => {
    const uncitedAnswer =
      'Test High School has small classes. You might also consider Third High School, ' +
      'which was not one of the schools retrieved for this question.'
    const result = scoreHallucination(uncitedAnswer, ['Test High School'], allSchoolNames)
    expect(result.pass).toBe(false)
    expect(result.detail).toContain('Third High School')
  })
})

describe('scoreCoverage', () => {
  it('passes when every retrieved school is described', () => {
    const result = scoreCoverage(
      'Test High School has small classes. Other High School has strong academics.',
      ['Test High School', 'Other High School']
    )
    expect(result.pass).toBe(true)
  })

  it('fails when a retrieved school is silently dropped from the answer', () => {
    const result = scoreCoverage('Test High School has small classes.', ['Test High School', 'Other High School'])
    expect(result.pass).toBe(false)
    expect(result.detail).toContain('Other High School')
  })
})

describe('scoreMissingDataNotShownAsZero', () => {
  const retrievedChunks = ['Test High School has 258 students with a graduation rate of 66%.']

  it('passes when the answer states missing data is not listed', () => {
    const result = scoreMissingDataNotShownAsZero(
      'Test High School has 258 students. Its survey score is not listed.',
      retrievedChunks
    )
    expect(result.pass).toBe(true)
  })

  it('fails when the answer states a zero value absent from the retrieved context', () => {
    const result = scoreMissingDataNotShownAsZero(
      'Test High School has a survey score of 0% and 0 students in its arts program.',
      retrievedChunks
    )
    expect(result.pass).toBe(false)
  })
})
