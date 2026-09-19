/**
 * evals/scorers.ts
 *
 * Issue #284: programmatic scorers for the ask-box eval runner
 * (evals/run-ask-eval.ts). Each scorer is a plain, synchronous function over
 * an answer and (where needed) the retrieval for that question — no model
 * call, no I/O — so each can be unit tested with hand-made answers. The
 * banned-phrase and admissions-odds scorers reuse the production rules the
 * app already enforces (lib/banned-phrases.ts, lib/ask-guardrails.ts)
 * rather than re-implementing them.
 */

import { findBannedPhrases } from '../lib/banned-phrases'
import { guardAnswer } from '../lib/ask-guardrails'

export interface ScorerResult {
  pass: boolean
  detail?: string
}

/** Same rule the rest of the app uses for banned copy (lib/banned-phrases.ts). */
export function scoreNoBannedPhrases(answer: string): ScorerResult {
  const hits = findBannedPhrases(answer)
  return {
    pass: hits.length === 0,
    detail: hits.length ? `banned phrase(s) found: ${hits.join(', ')}` : undefined,
  }
}

/**
 * The same admissions-odds guardrail every ask-box answer already runs
 * through (lib/ask-guardrails.ts guardAnswer, the rule
 * __tests__/rule-no-admissions-odds-language.test.ts enforces statically) —
 * re-run here as a regression check over the eval set rather than
 * duplicating the phrase list.
 */
export function scoreNoAdmissionsOddsLanguage(answer: string): ScorerResult {
  const guarded = guardAnswer(answer)
  return {
    pass: !guarded.blocked,
    detail: guarded.blocked ? 'answer contains admissions-odds language' : undefined,
  }
}

/**
 * Every school named in the answer must be one of the schools retrieval
 * actually returned for this question. `allSchoolNames` is the full universe
 * of names the data can produce — without it, a fabricated name and a real
 * but unretrieved school would look identical.
 */
export function scoreHallucination(
  answer: string,
  retrievedNames: string[],
  allSchoolNames: string[]
): ScorerResult {
  const retrieved = new Set(retrievedNames)
  const named = allSchoolNames.filter((name) => answer.includes(name))
  const hallucinated = named.filter((name) => !retrieved.has(name))
  return {
    pass: hallucinated.length === 0,
    detail: hallucinated.length ? `named but not retrieved: ${hallucinated.join(', ')}` : undefined,
  }
}

/** No school retrieval returned may be silently missing from the answer. */
export function scoreCoverage(answer: string, retrievedNames: string[]): ScorerResult {
  const dropped = retrievedNames.filter((name) => !answer.includes(name))
  return {
    pass: dropped.length === 0,
    detail: dropped.length ? `dropped from answer: ${dropped.join(', ')}` : undefined,
  }
}

// A genuine DOE-reported 0 essentially never appears in retrieved chunk text
// for these stats (see __tests__/rule-missing-data-never-zero.test.ts for the
// school-detail-page version of the same rule). This is the ask-box
// equivalent: if the answer states a zero-valued stat that the retrieved
// context never actually provided, the model most likely turned a missing
// value into a "0" instead of saying it isn't listed.
const ZERO_AS_MISSING_PATTERN = /\b0(?:\.0+)?\s?(?:%|percent|students|seats)\b/gi

export function scoreMissingDataNotShownAsZero(
  answer: string,
  retrievedChunks: string[]
): ScorerResult {
  const matches = answer.match(ZERO_AS_MISSING_PATTERN) ?? []
  const ungrounded = Array.from(new Set(matches)).filter(
    (m) => !retrievedChunks.some((chunk) => chunk.toLowerCase().includes(m.toLowerCase()))
  )
  return {
    pass: ungrounded.length === 0,
    detail: ungrounded.length
      ? `states ${ungrounded.join(', ')}, not present in retrieved context — likely missing data shown as zero`
      : undefined,
  }
}
