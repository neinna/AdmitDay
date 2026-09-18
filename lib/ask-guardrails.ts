/**
 * lib/ask-guardrails.ts
 *
 * Issue #218: the no-odds rule (lib/banned-phrases.ts) only ever ran
 * against static, authored source files — the answer Claude generates in
 * app/api/find/ask/route.ts went out unchecked. This module holds the
 * guardrails applied to every ask-box answer before it reaches a parent:
 * a question length cap, prediction-request detection, and a check of the
 * model's own output against the same banned-phrase list.
 */

import { findBannedPhrases } from "./banned-phrases";

export const MAX_QUESTION_LENGTH = 500;

export const TOO_LONG = "Please keep your question under 500 characters.";

export const PREDICTION_PREFACE =
  "AdmitDay doesn't predict admission. Here's what each of these schools looks at when it makes offers:";

export const OFF_TOPIC =
  "AdmitDay answers questions about NYC public high schools and admissions. Try asking about a borough, a program, or an activity.";

export const BLOCKED_FALLBACK =
  "We held this answer back because it started to predict admission, which AdmitDay doesn't do. The schools below matched your question. Open any of them to see how each one admits students.";

export type Guardrail = "none" | "prediction_preface" | "blocked" | "off_topic" | "too_long";

// Signals a parent is asking for an odds/prediction-style answer.
// Deliberately not the bare words reach, safety, or target — NYC parents
// use those for commutes ("schools I can reach by subway") and school
// safety, not admissions odds.
const PREDICTION_PHRASES = [
  "chance",
  "odds",
  "likely",
  "likelihood",
  "probability",
  "get in",
  "get into",
  "get accepted",
  "be accepted",
  "be admitted",
  "shot at",
  "reach school",
  "safety school",
  "target school",
];

export function isPredictionRequest(question: string): boolean {
  const lowered = question.toLowerCase();
  return PREDICTION_PHRASES.some((phrase) => lowered.includes(phrase));
}

export interface GuardedAnswer {
  text: string;
  blocked: boolean;
}

// Runs the same no-odds check lib/banned-phrases.ts applies to authored
// copy against generated model output. A hit means the answer never
// reaches the parent — the caller still returns the retrieved sources
// alongside BLOCKED_FALLBACK so the parent isn't left with nothing.
export function guardAnswer(answer: string): GuardedAnswer {
  const hits = findBannedPhrases(answer);
  if (hits.length > 0) {
    return { text: BLOCKED_FALLBACK, blocked: true };
  }
  return { text: answer, blocked: false };
}
