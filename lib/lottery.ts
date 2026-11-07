/**
 * Lottery number decoding (P1.2). Pure functions, no I/O: the decoder page
 * runs this in the browser and never sends the number anywhere.
 *
 * Checked 2026-11-07 against the DOE page (DOE_RANDOM_NUMBERS_URL): MySchools
 * generates the number as a Python uuid4, shown like
 * B51920AF-F1C6-40EC-8E9A-3E1E50CB13BB, and sorts it 0-9 then A-F, so lower
 * goes first. A uuid4's first 8 bits are random, so the first two characters
 * are spread evenly from 00 to FF: read as 0-255 they place the number among
 * all numbers to within 1/256 (about 0.4%).
 *
 * This explains where the number sits. It does not predict an offer; the DOE
 * says so itself: "Random numbers, on their own, cannot determine your chances
 * of getting into a specific program."
 */

export const LOTTERY_MAX = 255

export type LotteryParse =
  | { ok: true; value: number; prefix: string }
  | { ok: false; error: string }

/** Strips spaces and dashes and lowercases; does not validate. */
export function normalizeLottery(input: string): string {
  return input.replace(/[\s-]/g, '').toLowerCase()
}

/**
 * Accepts the full 32-character number (dashes and spaces allowed) or just its
 * first two characters, and returns the first two as 0-255.
 */
export function parseLottery(input: string): LotteryParse {
  const s = normalizeLottery(input)
  if (s === '') return { ok: false, error: 'Enter your lottery number.' }
  if (!/^[0-9a-f]+$/.test(s)) return { ok: false, error: 'Use only 0-9 and a-f.' }
  if (s.length !== 2 && s.length !== 32) {
    return { ok: false, error: `Enter all 32 characters or just the first 2 (you entered ${s.length}).` }
  }
  const prefix = s.slice(0, 2)
  return { ok: true, value: parseInt(prefix, 16), prefix }
}

/** Share of all numbers that start lower (better) than this one, in whole percent, rounded down. 00 → 0, 80 → 50, ff → 99. */
export function percentLower(value: number): number {
  if (!isLotteryValue(value)) throw new RangeError('value must be 0-255')
  return Math.floor((value / 256) * 100)
}

/** Validates a stored 0-255 value. */
export function isLotteryValue(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= LOTTERY_MAX
}

/** DOE page that explains random numbers in admissions. */
export const DOE_RANDOM_NUMBERS_URL =
  'https://www.schools.nyc.gov/enrollment/enroll-grade-by-grade/how-students-get-offers-to-doe-public-schools/random-numbers-in-admissions'
