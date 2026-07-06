'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'

export default function NavBar() {
  const pathname = usePathname()
  const [lastParams, setLastParams] = useState<string | null>(null)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setLastParams(localStorage.getItem('hs_nav_last_params'))
    setHydrated(true)
  }, [])

  // Re-read on every route change so My Schools / Requirements activate
  // as soon as the user submits the form and arrives at /list
  useEffect(() => {
    if (!hydrated) return
    setLastParams(localStorage.getItem('hs_nav_last_params'))
  }, [pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleReset() {
    try {
      localStorage.removeItem('hs_nav_last_params')
      localStorage.removeItem('hs_nav_form')
      localStorage.removeItem('hs_nav_requirements')
    } catch {
      // ignore
    }
    window.location.href = '/'
  }

  const hasSearch = hydrated && Boolean(lastParams)
  const mySchoolsHref = hasSearch ? `/list?${lastParams}` : null
  const requirementsHref = hasSearch ? `/requirements?${lastParams}` : null

  const activeClass = 'text-gray-900 font-semibold text-sm'
  const enabledClass = 'text-gray-500 hover:text-gray-900 text-sm transition-colors'
  const disabledClass = 'text-gray-300 text-sm cursor-not-allowed select-none'

  return (
    <nav className="sticky top-0 z-50 bg-white border-b border-gray-200">
      <div className="max-w-4xl mx-auto px-4 h-12 flex items-center justify-between gap-6">
        {/* Left: logo + links */}
        <div className="flex items-center gap-6">
          <Link href="/" className="text-sm font-bold text-gray-900 tracking-tight shrink-0">
            AdmitDay
          </Link>

          <div className="flex items-center gap-5">
            {/* Home */}
            <Link
              href="/"
              className={pathname === '/' ? activeClass : enabledClass}
            >
              Home
            </Link>

            {/* My Schools */}
            {mySchoolsHref ? (
              <Link
                href={mySchoolsHref}
                className={pathname === '/list' ? activeClass : enabledClass}
              >
                My Schools
              </Link>
            ) : (
              <span className={disabledClass}>My Schools</span>
            )}

            {/* Requirements */}
            {requirementsHref ? (
              <Link
                href={requirementsHref}
                className={pathname === '/requirements' ? activeClass : enabledClass}
              >
                Requirements
              </Link>
            ) : (
              <span className={disabledClass}>Requirements</span>
            )}
          </div>
        </div>

        {/* Right: reset */}
        <button
          onClick={handleReset}
          className="text-xs text-gray-400 hover:text-gray-700 transition-colors shrink-0"
        >
          Reset filters
        </button>
      </div>
    </nav>
  )
}
