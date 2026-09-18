/**
 * __tests__/ask-guardrails.test.ts
 *
 * Issue #218: lib/ask-guardrails.ts exports the pure, deterministic pieces
 * of the ask-box guardrails — no model call needed to test any of them.
 */

import {
  MAX_QUESTION_LENGTH,
  TOO_LONG,
  PREDICTION_PREFACE,
  OFF_TOPIC,
  BLOCKED_FALLBACK,
  isPredictionRequest,
  guardAnswer,
} from '@/lib/ask-guardrails'
import { findBannedPhrases } from '@/lib/banned-phrases'

describe('MAX_QUESTION_LENGTH', () => {
  it('is 500', () => {
    expect(MAX_QUESTION_LENGTH).toBe(500)
  })
})

describe('isPredictionRequest', () => {
  it.each([
    'What are my chances of getting in?',
    'What are the odds for Brooklyn Tech?',
    'Is it likely my kid gets accepted?',
    'What is the likelihood of admission?',
    'What is the probability my daughter gets in?',
    'Can she get in to Beacon?',
    'How do I get into Stuyvesant?',
    'Will he get accepted at Millennium?',
    'What are the chances she will be accepted?',
    'Is my son going to be admitted?',
    'What is my shot at Townsend Harris?',
    'Is this a reach school for my daughter?',
    'Is this a safety school for us?',
    'Is this a target school given her grades?',
  ])('flags a prediction request: %s', (question) => {
    expect(isPredictionRequest(question)).toBe(true)
  })

  it.each([
    'Which schools have strong CS and a soccer team?',
    'Schools I can reach by subway from Sunset Park',
    'Is this school considered safe for a first grader walking alone?',
    'What is a good target for improving my writing skills?',
    'Small classes in Brooklyn with a real theater program',
  ])('does not flag an ordinary question: %s', (question) => {
    expect(isPredictionRequest(question)).toBe(false)
  })

  it('matches case-insensitively', () => {
    expect(isPredictionRequest('WHAT ARE MY ODDS?')).toBe(true)
  })
})

describe('guardAnswer', () => {
  it('blocks an answer containing admissions-odds language and returns the fallback', () => {
    const result = guardAnswer('Given her grades, your chances of getting in are good.')
    expect(result.blocked).toBe(true)
    expect(result.text).toBe(BLOCKED_FALLBACK)
  })

  it('passes through a clean answer unchanged', () => {
    const clean = 'Beacon High School emphasizes small discussion-based classes.'
    const result = guardAnswer(clean)
    expect(result.blocked).toBe(false)
    expect(result.text).toBe(clean)
  })
})

describe('copy constants never contain a banned admissions-odds phrase', () => {
  it.each([
    ['TOO_LONG', TOO_LONG],
    ['PREDICTION_PREFACE', PREDICTION_PREFACE],
    ['OFF_TOPIC', OFF_TOPIC],
    ['BLOCKED_FALLBACK', BLOCKED_FALLBACK],
  ])('%s is clean', (_name, copy) => {
    expect(findBannedPhrases(copy)).toEqual([])
  })
})
