/**
 * __tests__/find-sort-toggle-control.test.ts
 *
 * Issue #435 — the Results / Fewest applicants sort toggle read as static
 * text (text-ink vs text-faint, no border, no background), so it didn't
 * register as an interactive control. This asserts the pair now renders as
 * a segmented control: a shared 1px rule-token border with a divider
 * between the two options, a filled bg-ink/text-white state for whichever
 * option is selected, transparent/text-ink-2 for the other, and a pointer
 * cursor + hover affordance on the unselected option. aria-pressed still
 * tracks sortMode exactly as before (issue #400), and the "Sorted by your
 * ask" branch and both labels are untouched.
 *
 * No jsdom in this repo's jest config, so — following
 * __tests__/find-sort-toggle.test.ts's convention — these are source-text
 * assertions against app/find/FindClient.tsx rather than a rendered DOM.
 */

import * as fs from 'fs'
import * as path from 'path'

function readSource(relPath: string): string {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf-8')
}

const src = readSource('app/find/FindClient.tsx')

// Isolate the toggle block so assertions can't accidentally match unrelated
// bg-ink/text-white usage elsewhere in the file.
function extractToggleBlock(source: string): string {
  const start = source.indexOf("<span>Sort</span>")
  expect(start).toBeGreaterThan(-1)
  const end = source.indexOf('</span>\n              )}', start)
  expect(end).toBeGreaterThan(start)
  return source.slice(start, end)
}

const toggle = extractToggleBlock(src)

describe('the sort toggle segmented control (issue #435)', () => {
  it('gives the pair a shared 1px border in the rule token', () => {
    expect(toggle).toContain('border border-rule')
  })

  it('divides the two options with a rule-token border', () => {
    expect(toggle).toContain('border-l border-rule')
  })

  it('fills the selected option with bg-ink/text-white', () => {
    expect(toggle).toContain("sortMode === 'results' ? 'bg-ink text-white'")
    expect(toggle).toMatch(/sortMode === 'fewest_applicants'\s*\?\s*'bg-ink text-white'/)
  })

  it('keeps the unselected option transparent with text-ink-2, not filled', () => {
    // The selected branch is 'bg-ink text-white'; the alternate (unselected)
    // branch must not also carry those classes.
    const resultsTernary = /sortMode === 'results' \? 'bg-ink text-white' : '([^']*)'/.exec(toggle)
    const fewestTernary = /sortMode === 'fewest_applicants'\s*\?\s*'bg-ink text-white'\s*:\s*'([^']*)'/.exec(
      toggle
    )
    expect(resultsTernary).not.toBeNull()
    expect(fewestTernary).not.toBeNull()
    const unselectedResults = resultsTernary![1]
    const unselectedFewest = fewestTernary![1]
    expect(unselectedResults).toContain('text-ink-2')
    expect(unselectedResults).not.toContain('bg-ink')
    expect(unselectedResults).not.toContain('text-white')
    expect(unselectedFewest).toContain('text-ink-2')
    expect(unselectedFewest).not.toContain('bg-ink')
    expect(unselectedFewest).not.toContain('text-white')
  })

  it('adds cursor-pointer and a visible hover state on the unselected option', () => {
    expect(toggle).toContain('cursor-pointer')
    expect(toggle).toContain('hover:bg-rule-light')
  })

  it('keeps aria-pressed tracking sortMode for both options', () => {
    expect(toggle).toContain("aria-pressed={sortMode === 'results'}")
    expect(toggle).toContain("aria-pressed={sortMode === 'fewest_applicants'}")
  })

  it('keeps both option labels and the SORT label', () => {
    expect(toggle).toContain('Results')
    expect(toggle).toContain('Fewest applicants')
    expect(src).toContain('<span>Sort</span>')
  })

  it('leaves the "Sorted by your ask" branch untouched', () => {
    expect(src).toContain("askReasons.length > 0 ? (\n                'Sorted by your ask'")
  })
})
