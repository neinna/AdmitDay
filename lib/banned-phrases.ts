/**
 * lib/banned-phrases.ts
 *
 * Issue #127, rule 3: no admissions-odds language anywhere in user-facing
 * copy or answer-shaping prompt text. AdmitDay shows published DOE numbers
 * and lets families judge for themselves — even the DOE's own prediction
 * tool is historical and unreliable, and implying a prediction is both a
 * trust and a liability problem.
 *
 * This is the one place the banned list lives, so extending it (or granting
 * a reviewed exemption) is a one-line change here rather than a hunt through
 * every component. If a legitimate use ever needs an exemption, add the
 * exact approved string to ADMISSIONS_ODDS_ALLOWLIST — never loosen a
 * pattern above to make an exemption fit.
 */

export const BANNED_ADMISSIONS_ODDS_PHRASES: string[] = [
  'chance of',
  'chances of',
  'your odds',
  'odds of',
  'likely to get in',
  'likelihood of admission',
  'reach school',
  'target school',
  'safety school',
  'probability of admission',
]

// Exact, lowercase substrings that are explicitly permitted even though they
// contain a banned phrase above (e.g. copy that explicitly disclaims doing
// odds prediction).
//
// Reviewed exemptions only. Each entry must be copy that *refuses* to predict —
// never copy that predicts. Adding a phrase here is a deliberate decision; if a
// new string nearly matches an entry, write the copy to match the entry rather
// than adding a near-duplicate.
export const ADMISSIONS_ODDS_ALLOWLIST: string[] = [
  // Landing page (app/page.tsx), "And what it will never do" — the product's
  // refusal to predict, which necessarily names what it won't produce.
  'no chance of admission. no reach, target or likely. no score or rating of any kind.',
]

/**
 * Returns every banned phrase found in `text` (case-insensitive), after
 * scrubbing out any allowlisted strings first. Empty array means the text
 * is clean.
 */
export function findBannedPhrases(
  text: string,
  allowlist: string[] = ADMISSIONS_ODDS_ALLOWLIST,
): string[] {
  let scrubbed = text.toLowerCase()
  for (const exempt of allowlist) {
    scrubbed = scrubbed.split(exempt.toLowerCase()).join('')
  }
  return BANNED_ADMISSIONS_ODDS_PHRASES.filter((phrase) => scrubbed.includes(phrase))
}
