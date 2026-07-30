import { Space_Grotesk, Newsreader, Libre_Franklin, JetBrains_Mono } from 'next/font/google'

// Design foundation (issue #113) — one font per Tailwind family, each exposed
// as a CSS variable so tailwind.config.ts can map font-display/font-wordmark/
// font-sans/font-mono to them. Attached on <html> in app/layout.tsx.

export const fontDisplay = Space_Grotesk({
  subsets: ['latin'],
  weight: ['700'],
  display: 'swap',
  variable: '--font-display',
})

export const fontWordmark = Newsreader({
  subsets: ['latin'],
  weight: ['500'],
  style: ['italic'],
  display: 'swap',
  variable: '--font-wordmark',
})

export const fontSans = Libre_Franklin({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  display: 'swap',
  variable: '--font-sans',
})

export const fontMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
  variable: '--font-mono',
})
