'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { usePostHog } from 'posthog-js/react'
import Link from 'next/link'
import Footer from '@/components/Footer'
import FeedbackRow from '@/components/FeedbackRow'

const STORAGE_KEY = 'hs_nav_requirements'

interface ChecklistItem {
  id: string
  text: string
  verifiedDate?: string
}

interface Section {
  id: string
  title: string
  items: ChecklistItem[]
}

function buildSections(shsat: boolean, auditions: boolean, level: string): Section[] {
  const sections: Section[] = []

  if (shsat) {
    sections.push({
      id: 'shsat',
      title: 'SHSAT — Specialized High Schools',
      items: [
        { id: 'shsat_1', text: 'Register for the SHSAT by October 31', verifiedDate: '2026-04-08' },
        {
          id: 'shsat_2',
          text: 'The exam is digital — practice on the same type of devices used at your school',
        },
        {
          id: 'shsat_3',
          text: 'Suggested prep timeline: start in August, take practice tests in September, review weak areas in October',
        },
        {
          id: 'shsat_4',
          text: 'Specialized high school offers are released in March alongside all other high school offers',
        },
      ],
    })
  }

  if (auditions) {
    sections.push({
      id: 'auditions',
      title: 'Audition & Portfolio Schools',
      items: [
        {
          id: 'aud_1',
          text: 'Prepare your portfolio or audition materials well in advance',
        },
        {
          id: 'aud_2',
          text: 'Upload audition materials during the application window: October 7 – December 3',
          verifiedDate: '2026-04-08',
        },
        {
          id: 'aud_3',
          text: "Review each school's specific audition requirements on MySchools (requirements vary by school and discipline)",
        },
        {
          id: 'aud_4',
          text: 'LaGuardia HS of Music & Art and Performing Arts requires live or recorded auditions in specific disciplines',
        },
      ],
    })
  }

  if (level === 'medium' || level === 'high') {
    sections.push({
      id: 'screened',
      title: 'Screened Programs',
      items: [
        {
          id: 'scr_1',
          text: 'Submit required essays and assessments — requirements vary by school, check each one on MySchools',
        },
        {
          id: 'scr_2',
          text: 'New for fall 2026: top academic performers from each individual middle school and top performers citywide are both admitted — a two-track system',
        },
        {
          id: 'scr_3',
          text: 'Maintain strong attendance and grades through the fall semester — screened schools review both',
        },
        {
          id: 'scr_4',
          text: 'Schools review your grades, attendance record, and any assessment scores in your application',
        },
      ],
    })
  }

  // Always shown
  sections.push({
    id: 'all',
    title: 'All Applicants',
    items: [
      { id: 'all_1', text: 'Application window opens October 7 and closes December 3', verifiedDate: '2026-04-08' },
      { id: 'all_2', text: 'High school offers are released March 5', verifiedDate: '2026-04-08' },
      {
        id: 'all_3',
        text: 'Submit your application through MySchools at myschools.nyc',
      },
      {
        id: 'all_4',
        text: 'You can rank more than 12 schools — list every program you would genuinely attend, in your true order of preference. The DOE recommends at least 12 strong options.',
      },
      {
        id: 'all_5',
        text: "Attend school tours and open houses — many are held in October and November. Check each school's calendar on MySchools",
      },
    ],
  })

  return sections
}

function RequirementsContent() {
  const searchParams = useSearchParams()
  const posthog = usePostHog()
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [hydrated, setHydrated] = useState(false)

  const shsat = searchParams.get('shsat') === 'true'
  const auditions = searchParams.get('auditions') === 'true'
  const level = searchParams.get('level') ?? 'medium'
  const listHref = `/list?${searchParams.toString()}`

  const sections = buildSections(shsat, auditions, level)
  const allItems = sections.flatMap((s) => s.items)
  const doneCount = allItems.filter((item) => checked[item.id]).length

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) setChecked(JSON.parse(stored))
    } catch {
      // ignore
    }
    setHydrated(true)
  }, [])

  useEffect(() => {
    posthog?.capture('requirements_viewed', { shsat, auditions, level })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function toggle(id: string) {
    setChecked((prev) => {
      const next = { ...prev, [id]: !prev[id] }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        // ignore
      }
      return next
    })
  }

  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-2xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-start justify-between gap-3">
            <Link href={listHref} className="text-sm text-gray-500 hover:text-gray-700">
              &larr; Back to your list
            </Link>
            {/* Locked save button */}
            <span
              aria-label="Save checklist — Season Pass coming soon"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-400 border border-gray-200 bg-gray-50 rounded-md cursor-not-allowed select-none flex-shrink-0"
            >
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span>Save checklist</span>
              <span className="text-xs text-gray-400 font-normal">— Season Pass <span className="italic">coming soon</span></span>
            </span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">Your requirements checklist</h1>
          {hydrated && (
            <div className="flex items-center justify-between mt-0.5">
              <p className="text-sm text-gray-500">
                {doneCount} of {allItems.length} completed
              </p>
              <FeedbackRow screen="requirements" />
            </div>
          )}
        </div>

        {/* Disclaimer */}
        <div className="bg-amber-50 border border-amber-200 rounded-md p-3 mb-3">
          <p className="text-sm text-amber-800 leading-relaxed">
            HS Navigator is not affiliated with NYC DOE. All deadlines should be verified at{' '}
            <a
              href="https://www.myschools.nyc"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-medium"
            >
              myschools.nyc
            </a>
            .
          </p>
        </div>

        {/* Deadlines last verified */}
        <p className="text-xs text-gray-400 mb-8">
          Deadlines last verified: April 8, 2026 —{' '}
          <a
            href="https://www.myschools.nyc"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-gray-600"
          >
            myschools.nyc
          </a>
        </p>

        {/* Checklist sections */}
        <div className="space-y-8">
          {sections.map((section) => (
            <div key={section.id}>
              <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3 pb-2 border-b border-gray-200">
                {section.title}
              </h2>
              <ul className="space-y-3">
                {section.items.map((item) => (
                  <li key={item.id} className="flex items-start gap-3">
                    <button
                      onClick={() => toggle(item.id)}
                      aria-label={checked[item.id] ? `Uncheck: ${item.text}` : `Check: ${item.text}`}
                      className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                        checked[item.id]
                          ? 'bg-gray-900 border-gray-900'
                          : 'border-gray-300 hover:border-gray-500'
                      }`}
                    >
                      {checked[item.id] && (
                        <svg
                          className="w-3 h-3 text-white"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={3}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      )}
                    </button>
                    <span
                      className={`text-sm leading-relaxed ${
                        checked[item.id] ? 'text-gray-400 line-through' : 'text-gray-700'
                      }`}
                    >
                      {item.text}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        {/* Locked: Deadline tracking section */}
        <div className="mt-8 rounded-md border border-gray-200 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200">
            <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <span className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Deadline Tracking</span>
            <span className="ml-auto text-xs font-medium text-gray-400">Season Pass — <span className="italic">coming soon</span></span>
          </div>
          <div className="px-4 py-5 bg-white opacity-50 pointer-events-none select-none space-y-3" aria-hidden="true">
            {['SHSAT registration', 'Audition upload window', 'Application close', 'Offer release date'].map((label) => (
              <div key={label} className="flex items-center gap-3">
                <span className="w-5 h-5 rounded border-2 border-gray-200 flex-shrink-0" />
                <span className="flex-1">
                  <span className="block text-sm text-gray-400">{label}</span>
                  <span className="block h-2 mt-1 bg-gray-100 rounded w-32" />
                </span>
                <span className="h-3 bg-gray-100 rounded w-20" />
              </div>
            ))}
          </div>
        </div>
      </div>
      <Footer />
    </main>
  )
}

export default function RequirementsPage() {
  return (
    <Suspense fallback={<div className="p-10 text-sm text-gray-400">Loading…</div>}>
      <RequirementsContent />
    </Suspense>
  )
}
