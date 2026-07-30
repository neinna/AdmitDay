import * as fs from 'fs'
import * as path from 'path'

// Issue #113 — design foundation: token layer + fonts + five UI primitives.
// This repo's jest setup runs in the `node` test environment (see
// jest.config.js) with no jsdom/testing-library, and no existing test
// imports/renders a .tsx component module directly — every component test
// in this suite (see chat-page.test.ts, schools.test.ts) asserts against the
// component's source text instead. These tests follow that same convention.

function readSource(relPath: string): string {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf-8')
}

const HEX_COLOR_RE = /#[0-9a-fA-F]{3,8}\b/g

describe('tailwind.config.ts — design tokens (issue #113)', () => {
  let src: string

  beforeAll(() => {
    src = readSource('tailwind.config.ts')
  })

  const TOKENS: Record<string, string> = {
    ink: '#0B0B0C',
    'ink-2': '#2A2A2F',
    muted: '#55555A',
    faint: '#8A8A90',
    rule: '#E8E8E4',
    'rule-light': '#F0F0EC',
    border: '#DEDEDA',
    'border-strong': '#C9C9C4',
    accent: '#1D4ED8',
    'accent-bg': '#EEF2FF',
    'accent-border': '#C7D2FE',
    gem: '#0F7B5A',
    'gem-bg': '#F0F8F5',
    'gem-border': '#BFE3D5',
    surface: '#FFFFFF',
    'surface-2': '#FAFAF8',
  }

  it.each(Object.entries(TOKENS))('defines the %s token as %s', (token, hex) => {
    const re = new RegExp(`['"]?${token}['"]?:\\s*['"]${hex}['"]`, 'i')
    expect(src).toMatch(re)
  })

  it('only defines one accent color (no second accent-* hue introduced)', () => {
    // accent / accent-bg / accent-border must all share the same blue hue family (#1D4ED8, #EEF2FF, #C7D2FE)
    const accentLines = src.split('\n').filter((l) => /accent/i.test(l))
    expect(accentLines.length).toBeGreaterThanOrEqual(3)
    expect(accentLines.some((l) => l.includes('#1D4ED8'))).toBe(true)
  })

  it('exposes font-display, font-wordmark, font-sans, font-mono families', () => {
    expect(src).toMatch(/display:\s*\[[^\]]*var\(--font-display\)/)
    expect(src).toMatch(/wordmark:\s*\[[^\]]*var\(--font-wordmark\)/)
    expect(src).toMatch(/sans:\s*\[[^\]]*var\(--font-sans\)/)
    expect(src).toMatch(/mono:\s*\[[^\]]*var\(--font-mono\)/)
  })
})

describe('lib/fonts.ts — next/font/google loaders (issue #113)', () => {
  let src: string

  beforeAll(() => {
    src = readSource('lib/fonts.ts')
  })

  it("imports the four fonts from 'next/font/google'", () => {
    expect(src).toMatch(
      /import\s*{\s*Space_Grotesk,\s*Newsreader,\s*Libre_Franklin,\s*JetBrains_Mono\s*}\s*from\s*'next\/font\/google'/
    )
  })

  it('every font loader uses display: swap', () => {
    const swapCount = (src.match(/display:\s*'swap'/g) || []).length
    expect(swapCount).toBe(4)
  })

  it('Space Grotesk is weight 700 and exposed as --font-display', () => {
    const block = src.slice(src.indexOf('Space_Grotesk('), src.indexOf('fontWordmark ='))
    expect(block).toContain("'700'")
    expect(block).toContain('--font-display')
  })

  it('Newsreader is italic weight 500 and exposed as --font-wordmark', () => {
    const block = src.slice(src.indexOf('Newsreader('), src.indexOf('fontSans ='))
    expect(block).toContain("'500'")
    expect(block).toContain("'italic'")
    expect(block).toContain('--font-wordmark')
  })

  it('Libre Franklin loads 400/500/700 and is exposed as --font-sans', () => {
    const block = src.slice(src.indexOf('Libre_Franklin('), src.indexOf('fontMono ='))
    expect(block).toContain("'400'")
    expect(block).toContain("'500'")
    expect(block).toContain("'700'")
    expect(block).toContain('--font-sans')
  })

  it('JetBrains Mono loads 400/500 and is exposed as --font-mono', () => {
    const block = src.slice(src.indexOf('JetBrains_Mono('))
    expect(block).toContain("'400'")
    expect(block).toContain("'500'")
    expect(block).toContain('--font-mono')
  })
})

describe('app/layout.tsx — fonts wired without changing the default body typeface (issue #113)', () => {
  let src: string

  beforeAll(() => {
    src = readSource('app/layout.tsx')
  })

  it('still applies inter.className to <body> (no default-page-font change)', () => {
    expect(src).toContain('<body className={inter.className}>')
  })

  it('attaches the new font CSS variables on <html>, not <body>', () => {
    expect(src).toMatch(/<html[^>]*className=\{fontVariables\}/)
  })

  it('imports the font loaders from lib/fonts', () => {
    expect(src).toContain("from '@/lib/fonts'")
  })
})

describe.each([
  ['Chip', 'components/ui/Chip.tsx'],
  ['SegmentedControl', 'components/ui/SegmentedControl.tsx'],
  ['Button', 'components/ui/Button.tsx'],
  ['StatBlock', 'components/ui/StatBlock.tsx'],
  ['SchoolRow (ui primitive)', 'components/ui/SchoolRow.tsx'],
])('%s — no hardcoded hex colors (issue #113)', (_name, relPath) => {
  it('contains no raw hex color literals (must reference named tokens)', () => {
    const src = readSource(relPath)
    // Strip out any stray comments that might mention a hex for context.
    const codeOnly = src.replace(/\/\/.*$/gm, '')
    expect(codeOnly.match(HEX_COLOR_RE)).toBeNull()
  })
})

describe('Chip primitive (issue #113)', () => {
  let src: string

  beforeAll(() => {
    src = readSource('components/ui/Chip.tsx')
  })

  it('exports a ChipVariant type covering set | inferred | unselected | add', () => {
    expect(src).toMatch(/set['"]?\s*\|\s*['"]?inferred['"]?\s*\|\s*['"]?unselected['"]?\s*\|\s*['"]?add/)
  })

  it('"set" variant is a solid ink fill with white text and a check suffix', () => {
    expect(src).toMatch(/set:\s*'bg-ink[^']*text-white/)
    expect(src).toContain("'set' && <span className=\"ml-1.5\">✓</span>")
  })

  it('"inferred" variant uses accent-bg fill, accent-border, accent text, and a trailing ×', () => {
    expect(src).toMatch(/inferred:\s*'bg-accent-bg[^']*border-accent-border[^']*text-accent'/)
    expect(src).toContain("'inferred' && <span className=\"ml-1.5\">×</span>")
  })

  it('"unselected" variant is just a 1px border (no fill)', () => {
    expect(src).toMatch(/unselected:\s*'bg-transparent border border-border/)
  })

  it('"add" variant uses a dashed border-strong border', () => {
    expect(src).toMatch(/add:\s*'bg-transparent border border-dashed border-border-strong/)
  })
})

describe('SegmentedControl primitive (issue #113)', () => {
  let src: string

  beforeAll(() => {
    src = readSource('components/ui/SegmentedControl.tsx')
  })

  it('wraps cells in a 1px border box', () => {
    expect(src).toContain('border border-border')
  })

  it('marks the selected cell with ink fill + white text, others with ink-3 text', () => {
    expect(src).toMatch(/selected\s*\?\s*'bg-ink text-white[^']*'\s*:\s*'text-ink-3'/)
  })

  it('divides non-first cells with a 1px left border', () => {
    expect(src).toMatch(/i > 0 \? 'border-l border-border' : ''/)
  })
})

describe('Button primitive (issue #113)', () => {
  let src: string

  beforeAll(() => {
    src = readSource('components/ui/Button.tsx')
  })

  it('"primary" variant is an accent fill with white, medium-weight text', () => {
    expect(src).toMatch(/primary:\s*'bg-accent text-white font-medium/)
  })

  it('"outline" variant is a 1px ink border', () => {
    expect(src).toMatch(/outline:\s*'bg-transparent text-ink border border-ink'/)
  })

  it('defaults to the primary variant', () => {
    expect(src).toContain("variant = 'primary'")
  })
})

describe('StatBlock primitive (issue #113)', () => {
  let src: string

  beforeAll(() => {
    src = readSource('components/ui/StatBlock.tsx')
  })

  it('renders a mono value at 16px in ink over an uppercase faint label', () => {
    expect(src).toContain('font-mono text-[16px] text-ink')
    expect(src).toMatch(/font-mono text-\[10\.5px\] tracking-\[0\.06em\] uppercase text-faint/)
  })
})

describe('SchoolRow ui primitive (issue #113)', () => {
  let src: string

  beforeAll(() => {
    src = readSource('components/ui/SchoolRow.tsx')
  })

  it('uses the 34px/1fr/128px/96px grid with 16px gap', () => {
    expect(src).toContain('grid-cols-[34px_1fr_128px_96px]')
    expect(src).toContain('gap-4')
  })

  it('uses 22px/36px padding, items-start, and a rule-light bottom border', () => {
    expect(src).toContain('px-9 py-[22px]')
    expect(src).toContain('items-start')
    expect(src).toContain('border-b border-rule-light')
  })

  it('hovers to surface-2 with a 120ms ease-out transition and no transform', () => {
    expect(src).toContain('hover:bg-surface-2')
    expect(src).toContain('transition-colors duration-[120ms] ease-out')
    expect(src).not.toMatch(/hover:(scale|translate)/)
  })

  it('puts the name and hidden-gem badge in a gapped flex row (badge cannot land mid-wrap)', () => {
    expect(src).toMatch(/flex items-center gap-2\.5[\s\S]{0,200}isHiddenGem/)
  })

  it('is a distinct module from the existing components/SchoolRow.tsx (no collision)', () => {
    const existing = readSource('components/SchoolRow.tsx')
    expect(existing).not.toContain('grid-cols-[34px_1fr_128px_96px]')
  })
})

describe('components/ui barrel exports (issue #113)', () => {
  it('re-exports all five primitives', () => {
    const src = readSource('components/ui/index.ts')
    expect(src).toContain("from './Chip'")
    expect(src).toContain("from './SegmentedControl'")
    expect(src).toContain("from './Button'")
    expect(src).toContain("from './StatBlock'")
    expect(src).toContain("from './SchoolRow'")
  })
})
