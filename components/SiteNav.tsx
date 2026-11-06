import Link from 'next/link'
import type { ReactNode } from 'react'

export type NavSection = 'schools' | 'list' | 'students'

const ITEMS: { key: NavSection; href: string; label: string }[] = [
  { key: 'schools', href: '/find', label: 'Schools' },
  { key: 'list', href: '/shortlist', label: 'My list' },
  { key: 'students', href: '/students', label: 'Students' },
]

const LINK = 'hover:text-ink transition-colors duration-[120ms] ease-out'
const ACTIVE = 'text-ink font-medium border-b-2 border-accent pb-[3px]'

/**
 * The one site menu: Schools · My list · Students. The account name sits to
 * its right in each header (AuthControls). `active` underlines the current
 * section; `listBadge` renders after "My list" (saved count or load error).
 */
export default function SiteNav({ active, listBadge }: { active?: NavSection; listBadge?: ReactNode }) {
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
          {item.key === 'list' && listBadge}
        </Link>
      ))}
    </nav>
  )
}
