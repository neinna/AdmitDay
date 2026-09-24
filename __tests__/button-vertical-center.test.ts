import * as fs from 'fs'
import * as path from 'path'

/**
 * Issue #420 — the shared Button component's BASE classes set padding but no
 * line-box control, so labels sat on their text baseline instead of being
 * optically centered. This repo's jest config has no jsdom/testing-library
 * (see ui-primitives.test.ts), so these are source-text assertions against
 * components/ui/Button.tsx.
 */

function readSource(relPath: string): string {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf-8')
}

const src = readSource('components/ui/Button.tsx')

describe('Button base classes vertically center the label (issue #420)', () => {
  it('BASE includes inline-flex, items-center, justify-center, and leading-none', () => {
    const match = src.match(/const BASE =\s*\n?\s*'([^']+)'/)
    expect(match).not.toBeNull()
    const base = match![1]
    expect(base).toContain('inline-flex')
    expect(base).toContain('items-center')
    expect(base).toContain('justify-center')
    expect(base).toContain('leading-none')
  })

  it('BASE keeps the existing padding, type size, border-relevant transition classes unchanged', () => {
    const match = src.match(/const BASE =\s*\n?\s*'([^']+)'/)
    expect(match).not.toBeNull()
    const base = match![1]
    expect(base).toContain('font-sans')
    expect(base).toContain('text-[15px]')
    expect(base).toContain('px-[26px]')
    expect(base).toContain('py-[13px]')
    expect(base).toContain('transition-colors')
    expect(base).toContain('duration-[120ms]')
    expect(base).toContain('ease-out')
  })
})

describe('Button "selected" prop (issue #420)', () => {
  it('declares an optional selected?: boolean prop', () => {
    expect(src).toMatch(/selected\?:\s*boolean/)
  })

  it('applies bg-ink text-white border-ink with no !important when selected', () => {
    expect(src).toMatch(/SELECTED_CLASSES\s*=\s*'bg-ink text-white border-ink'/)
    expect(src).not.toMatch(/!bg-ink/)
    expect(src).not.toMatch(/!text-white/)
  })

  it('selected classes replace the variant classes rather than being appended after them', () => {
    expect(src).toMatch(/selected\s*\?\s*SELECTED_CLASSES\s*:\s*VARIANT_CLASSES\[variant\]/)
  })
})
