/**
 * Pure parsing helper for e2e/parent-flow.spec.ts — kept out of the spec file
 * so it can be unit-tested directly (see __tests__/e2e-find-count.test.ts),
 * the same split scripts/smoke.ts uses for its own helpers.
 *
 * Parses the "<N> match(es) <suffix>" count /find renders (e.g. "426 matches
 * citywide" or "114 matches in Brooklyn") out of the page's visible text.
 */
export function extractMatchCount(bodyText: string, suffixPattern: string): number | null {
  const match = bodyText.match(new RegExp(`([\\d,]+)\\s*match(?:es)?\\s*${suffixPattern}`))
  return match ? parseInt(match[1].replace(/,/g, ''), 10) : null
}
