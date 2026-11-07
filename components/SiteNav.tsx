'use client'

import Link from 'next/link'
import { useEffect, useState, type ReactNode } from 'react'

export type NavSection = 'schools' | 'list' | 'students'

const ITEMS: { key: NavSection; href: string; label: string }[] = [
  { key: 'schools', href: '/find', label: 'Schools' },
  { key: 'list', href: '/shortlist', label: 'My list' },
  { key: 'students', href: '/students', label: 'Students' },
]

const LINK = 'hover:text-ink transition-colors duration-[120ms] ease-out'
const ACTIVE = 'text-ink font-medium border-b-2 border-accent pb-[3px]'

/**
 * How many programs the signed-in parent has saved, or null when it can't be
 * known (signed out: 401; any error). Never throws: a failed count shows no
 * badge rather than breaking the menu.
 */
export async function fetchSavedCount(fetchImpl: typeof fetch = fetch): Promise<number | null> {
  try {
    const res = await fetchImpl('/api/saved-programs')
    if (!res.ok) return null
    const data = await res.json()
    return Array.isArray(data?.programs) ? data.programs.length : null
  } catch {
    return null
  }
}

/**
 * The one site menu: Schools · My list · Students. The account name sits to
 * its right in each header (AuthControls). `active` underlines the current
 * section. `listBadge` renders after "My list": pages that already hold the
 * saved list (Schools, a school page) pass their own live badge. Every other
 * page omits it, and the menu fetches the count itself, so "My list" shows the
 * same number on every page.
 */
export default function SiteNav({ active, listBadge }: { active?: NavSection; listBadge?: ReactNode }) {
  const ownCount = listBadge === undefined
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    if (!ownCount) return
    let cancelled = false
    fetchSavedCount().then((n) => {
      if (!cancelled) setCount(n)
    })
    return () => {
      cancelled = true
    }
  }, [ownCount])

  const badge = ownCount
    ? count !== null && count > 0 && <span className="font-mono text-accent ml-1">{count}</span>
    : listBadge

  return (
    <nav className="flex items-baseline gap-7 text-[14.5px] text-muted">
      {ITEMS.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          aria-current={active === item.key ? 'page' : undefined}
          className={active === item.key ? ACTIVE : LINK}
        >
          {item.label}
          {item.key === 'list' && badge}
        </Link>
      ))}
    </nav>
  )
}
