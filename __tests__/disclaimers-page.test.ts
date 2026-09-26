import fs from 'fs'
import path from 'path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

jest.mock('@clerk/nextjs', () => {
  const UserButton = () => null
  UserButton.MenuItems = ({ children }: { children: React.ReactNode }) => children
  UserButton.Link = () => null
  return {
    ClerkLoaded: ({ children }: { children: React.ReactNode }) => children,
    SignedIn: () => null,
    SignedOut: ({ children }: { children: React.ReactNode }) => children,
    SignInButton: ({ children }: { children: React.ReactNode }) => children,
    SignUpButton: ({ children }: { children: React.ReactNode }) => children,
    UserButton,
  }
})

import DisclaimersPage from '@/app/disclaimers/page'

const footerSource = fs.readFileSync(path.join(__dirname, '../components/Footer.tsx'), 'utf-8')

describe('/disclaimers (issue #476)', () => {
  it('renders without throwing (route returns 200)', () => {
    const html = renderToStaticMarkup(React.createElement(DisclaimersPage))
    expect(html).toContain('Disclaimers')
    expect(html.length).toBeGreaterThan(0)
  })

  it('states AdmitDay is independent and not affiliated with, or endorsed by, the DOE', () => {
    const html = renderToStaticMarkup(React.createElement(DisclaimersPage))
    expect(html).toMatch(/independent and not affiliated with, or endorsed by, the DOE/)
  })

  it('states no tool can guarantee an offer, citing the DOE tiebreaker', () => {
    const html = renderToStaticMarkup(React.createElement(DisclaimersPage))
    expect(html).toMatch(/We never predict admission/)
    expect(html).toMatch(/No tool can guarantee an offer/)
    expect(html).toMatch(/randomness as a tiebreaker/)
  })

  it('states AI can make mistakes and school data can change', () => {
    const html = renderToStaticMarkup(React.createElement(DisclaimersPage))
    expect(html).toMatch(/AI can make mistakes, and school data can change during the admissions cycle/)
  })

  it('links MySchools to https://www.myschools.nyc, opened in a new tab', () => {
    const html = renderToStaticMarkup(React.createElement(DisclaimersPage))
    expect(html).toContain('href="https://www.myschools.nyc"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).toMatch(/>MySchools</)
  })

  it('is a server component, reachable with JS disabled', () => {
    const src = fs.readFileSync(path.join(__dirname, '../app/disclaimers/page.tsx'), 'utf-8')
    expect(src).not.toMatch(/^['"]use client['"]/m)
  })
})

describe('Footer no longer carries the disclaimer paragraph, and links to /disclaimers instead', () => {
  it('does not contain the old "Every effort was made" paragraph', () => {
    expect(footerSource).not.toMatch(/Every effort was made/)
  })

  it('links to /disclaimers', () => {
    expect(footerSource).toContain('href="/disclaimers"')
  })

  it('renders the /disclaimers link in the footer markup, alongside Privacy and Terms', () => {
    const html = renderToStaticMarkup(React.createElement(require('@/components/Footer').default))
    expect(html).toContain('href="/privacy"')
    expect(html).toContain('href="/disclaimers"')
    expect(html).toContain('href="/terms"')
  })
})
