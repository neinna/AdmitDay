import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Design foundation tokens (issue #113) — components must reference
        // these names, never hardcode a hex.
        ink: '#0B0B0C',
        'ink-2': '#2A2A2F',
        // Not in the original token table, but the approved reference
        // (design/find-screen.html) uses this exact shade for unselected
        // chip / segmented-control text, so it's named rather than hardcoded.
        'ink-3': '#3A3A3F',
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
        // Also not in the original table: the approved reference uses this
        // exact shade for the SchoolRow mono row numeral (e.g. "01").
        'row-index': '#B8B8B4',
      },
      fontFamily: {
        // Libre Franklin is the workhorse for all reading text.
        sans: ['var(--font-sans)', 'Libre Franklin', 'system-ui', 'sans-serif'],
        // Space Grotesk 700 — page titles + "Admit" in the wordmark only.
        display: ['var(--font-display)', 'Space Grotesk', 'sans-serif'],
        // Newsreader italic 500 — "Day" in the wordmark only.
        wordmark: ['var(--font-wordmark)', 'Newsreader', 'serif'],
        // JetBrains Mono — numbers/codes only (stat values, counts, DBNs, eyebrows).
        mono: [
          'var(--font-mono)',
          'JetBrains Mono',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'monospace',
        ],
      },
    },
  },
  plugins: [],
}
export default config
