import * as Sentry from '@sentry/nextjs'
import { ClerkProvider } from '@clerk/nextjs'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import PHProvider from '@/components/PosthogProvider'
import AuthPosthogSync from '@/components/AuthPosthogSync'
import { fontDisplay, fontWordmark, fontSans, fontMono } from '@/lib/fonts'
import './globals.css'

// Clerk's default component styling overridden to the design system: radius
// 0, no shadows, the system's type faces and accent (design/DESIGN-SYSTEM.html).
const clerkAppearance = {
  variables: {
    colorPrimary: '#1D4ED8',
    colorText: '#0B0B0C',
    colorTextSecondary: '#55555A',
    colorBackground: '#FFFFFF',
    colorInputBackground: '#FFFFFF',
    colorInputText: '#0B0B0C',
    borderRadius: '0px',
    fontFamily: 'var(--font-sans), Libre Franklin, system-ui, sans-serif',
  },
  elements: {
    card: 'rounded-none shadow-none border border-rule',
    modalContent: 'rounded-none shadow-none',
    formButtonPrimary: 'rounded-none shadow-none normal-case',
    formFieldInput: 'rounded-none shadow-none',
    footerActionLink: 'text-accent',
    socialButtonsBlockButton: 'rounded-none shadow-none',
    avatarBox: 'rounded-none',
  },
}

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
    <ClerkProvider appearance={clerkAppearance}>
      <html lang="en" className={fontVariables}>
        <body className={inter.className}>
          <PHProvider>
            <AuthPosthogSync />
            {children}
          </PHProvider>
        </body>
      </html>
    </ClerkProvider>
  )
}
