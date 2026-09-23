import * as fs from 'fs'
import * as path from 'path'

/**
 * __tests__/find-saved-button-contrast.test.ts
 *
 * Issue #392 — on /find, a saved school's Add/Remove button rendered as an
 * empty box: the button used <Button variant="outline">, whose VARIANT_CLASSES
 * already set `bg-transparent text-ink`, and the saved-state override
 * (`bg-ink text-white`) was appended after it in the className string. Because
 * Tailwind's generated stylesheet orders same-specificity utility rules by its
 * own internal plugin order (not by position in the className string), the
 * outline variant's `bg-transparent` could still win over `bg-ink`, leaving
 * "Remove" rendered in white text on a transparent background. This repo's
 * jest config has no jsdom/testing-library (see auth-header.test.ts and
 * find-save-failure-handling.test.ts), so these are source-text assertions
 * against app/find/FindClient.tsx rather than a rendered interaction test.
 */

function readSource(relPath: string): string {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf-8')
}

const src = readSource('app/find/FindClient.tsx')

describe('the /find Add/Remove button is visible in the saved state (issue #392)', () => {
  it('still renders "Remove" for a saved school and "Add" otherwise', () => {
    expect(src).toContain("{added ? 'Remove' : 'Add'}")
  })

  it('uses variant="outline", whose base classes include a transparent background', () => {
    const buttonIdx = src.indexOf('variant="outline"')
    expect(buttonIdx).toBeGreaterThan(-1)

    const buttonSrc = fs.readFileSync(
      path.join(__dirname, '..', 'components/ui/Button.tsx'),
      'utf-8'
    )
    expect(buttonSrc).toMatch(/outline:\s*'[^']*bg-transparent[^']*'/)
  })

  it('forces a non-transparent background on the saved state with an !important modifier, so it cannot lose to the outline variant\'s bg-transparent', () => {
    const actionIdx = src.indexOf("added ? 'Remove' : 'Add'")
    expect(actionIdx).toBeGreaterThan(-1)

    const before = src.slice(Math.max(0, actionIdx - 400), actionIdx)
    const savedStateClassMatch = before.match(/added\s*\?\s*'([^']+)'\s*:\s*''/)
    expect(savedStateClassMatch).not.toBeNull()

    const savedStateClasses = savedStateClassMatch![1]
    expect(savedStateClasses).toContain('!bg-ink')
    expect(savedStateClasses).toContain('!text-white')
    // A plain (non-important) `bg-ink` here would be no more specific than
    // the outline variant's `bg-transparent` and could still lose to it.
    expect(savedStateClasses).not.toMatch(/(?<!!)\bbg-ink\b/)
  })
})
