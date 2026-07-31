import * as Sentry from '@sentry/nextjs'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import PHProvider from '@/components/PosthogProvider'
import { fontDisplay, fontWordmark, fontSans, fontMono } from '@/lib/fonts'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

// Design foundation (issue #113): only defines the --font-* CSS variables
// used by the new font-display/font-wordmark/font-sans/font-mono Tailwind
// utilities. Body keeps inter.className below, so no existing page's
// default typeface changes.
const fontVariables = `${fontDisplay.variable} ${fontWordmark.variable} ${fontSans.variable} ${fontMono.variable}`

export function generateMetadata(): Metadata {
  return {
    title: 'AdmitDay',
    description: "Find NYC public high schools that match your student's profile.",
    other: {
      ...Sentry.getTraceData()
    }
  }
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={fontVariables}>
      <body className={inter.className}>
        <PHProvider>
          {children}
        </PHProvider>
      </body>
    </html>
  )
}
