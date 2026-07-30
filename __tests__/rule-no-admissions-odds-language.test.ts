/**
 * Issue #127, rule 3: no admissions-odds language anywhere.
 *
 * No user-facing copy may imply a prediction about a student's chances of
 * admission — AdmitDay shows published DOE numbers and lets families judge.
 * This scans every user-facing component's source plus the answer-shaping
 * prompt text sent to the model, for the banned phrases kept in
 * lib/banned-phrases.ts (case-insensitive substring match).
 */

import * as fs from 'fs'
import * as path from 'path'
import { BANNED_ADMISSIONS_ODDS_PHRASES, findBannedPhrases } from '../lib/banned-phrases'

const ROOT = path.join(__dirname, '..')

const ISSUE_BANNED_PHRASES = [
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

function walkTsx(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  let files: string[] = []
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files = files.concat(walkTsx(full))
    } else if (entry.name.endsWith('.tsx')) {
      files.push(full)
    }
  }
  return files
}

// Every component under app/ and components/ is user-facing — that's the
// entire product surface a family reads.
const USER_FACING_FILES = [path.join(ROOT, 'app'), path.join(ROOT, 'components')].flatMap(walkTsx)

// The answer-shaping prompt text sent to the model — a banned phrase here
// would coach the model into producing odds language even if no component
// literally contains the string.
const PROMPT_FILES = [
  path.join(ROOT, 'app/api/chat/route.ts'),
  path.join(ROOT, 'app/api/rationale/route.ts'),
]

function assertClean(file: string, src: string) {
  const hits = findBannedPhrases(src)
  if (hits.length > 0) {
    throw new Error(
      `Rule (issue #127, rule 3): no admissions-odds language anywhere. ` +
        `${path.relative(ROOT, file)} contains banned phrase(s) [${hits.join(', ')}]. ` +
        `Any copy implying a prediction about admission chances is both a trust and a liability ` +
        `problem — AdmitDay shows published DOE numbers and lets families judge for themselves. ` +
        `Reword the copy, or if this is a deliberately reviewed exemption, add the exact approved ` +
        `string to ADMISSIONS_ODDS_ALLOWLIST in lib/banned-phrases.ts (never loosen the pattern itself).`
    )
  }
}

describe('Rule #127.3: no admissions-odds language anywhere', () => {
  it('found user-facing component files to scan (sanity check the walk itself)', () => {
    expect(USER_FACING_FILES.length).toBeGreaterThan(5)
  })

  it('the banned-phrase constant covers every phrase named in the issue', () => {
    for (const phrase of ISSUE_BANNED_PHRASES) {
      expect(BANNED_ADMISSIONS_ODDS_PHRASES.map((p) => p.toLowerCase())).toContain(phrase)
    }
  })

  it.each(USER_FACING_FILES.map((f) => [path.relative(ROOT, f), f] as const))(
    '%s contains no admissions-odds language',
    (_label, file) => {
      assertClean(file, fs.readFileSync(file, 'utf-8'))
    }
  )

  it.each(PROMPT_FILES.map((f) => [path.relative(ROOT, f), f] as const))(
    'the answer-shaping prompt text in %s contains no admissions-odds language',
    (_label, file) => {
      assertClean(file, fs.readFileSync(file, 'utf-8'))
    }
  )

  // ── Confirms the scan actually catches a violation, not just that it's quiet ──

  it.each(ISSUE_BANNED_PHRASES)('detects a deliberately-introduced violation containing "%s"', (phrase) => {
    const hits = findBannedPhrases(`This copy says the family has a ${phrase} something at this school.`)
    expect(hits).toContain(phrase)
  })

  it('matches case-insensitively', () => {
    expect(findBannedPhrases('YOUR ODDS of getting in look strong')).toContain('your odds')
    expect(findBannedPhrases('This is a REACH SCHOOL for most applicants')).toContain('reach school')
  })

  it('an explicit allowlist entry exempts only that exact approved string, not the pattern generally', () => {
    const approved = 'we do not estimate admissions chances of any kind here'
    // The approved sentence itself is clean once allowlisted...
    expect(findBannedPhrases(approved, [approved])).toEqual([])
    // ...but an unrelated sentence using the same banned phrase is still caught.
    expect(findBannedPhrases('the odds of getting in are moderate', [approved])).toContain('odds of')
  })
})
