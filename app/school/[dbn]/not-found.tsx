'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ADDED_SCHOOLS_KEY } from '@/lib/school-list-utils'
import { EXPECTED_SCHOOL_COUNT } from '@/lib/validate-school-data'
import { Button } from '@/components/ui'
import SiteHeader from './SiteHeader'

// Unknown or retired DBN (issue #116). Next renders this segment boundary
// (via notFound() in page.tsx) with a real HTTP 404 — header and back band
// stay, so the parent never lands on a dead-end generic error page.
export default function SchoolNotFound() {
  const [addedCount, setAddedCount] = useState(0)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(ADDED_SCHOOLS_KEY)
      if (stored) setAddedCount((JSON.parse(stored) as string[]).length)
    } catch {
      // ignore
    }
  }, [])

  return (
    <main className="max-w-[1120px] mx-auto bg-surface min-h-screen">
      <SiteHeader addedCount={addedCount} />

      <div className="flex items-center justify-between gap-5 px-5 min-[900px]:px-9 py-[11px] bg-surface-2 border-b border-rule">
        <Link href="/find" className="text-[13.5px] text-accent">
          ‹ Back to results
        </Link>
      </div>

      <div className="flex flex-col items-center text-center gap-4 px-5 py-24">
        <h1 className="font-display font-bold text-[28px] text-ink tracking-[-0.03em]">
          We don&rsquo;t have a record for this school
        </h1>
        <p className="text-[15px] text-muted max-w-[440px]">
          The DBN in this link may be retired or mistyped — school codes change when programs
          merge or close.
        </p>
        <div className="flex gap-3 pt-2">
          <Link href="/find">
            <Button type="button">Back to results</Button>
          </Link>
          <Link href="/find">
            <Button type="button" variant="outline">
              Search all {EXPECTED_SCHOOL_COUNT} schools
            </Button>
          </Link>
        </div>
      </div>
    </main>
  )
}
