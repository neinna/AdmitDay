'use client'

import { useEffect, useState } from 'react'
import { usePostHog } from 'posthog-js/react'
import Link from 'next/link'
import Footer from '@/components/Footer'
import FeedbackRow from '@/components/FeedbackRow'
import type { ReqSection, ShsatCutoffInfo } from './page'

const STORAGE_KEY = 'hs_nav_requirements'

const SECTION_REQUIREMENTS: Record<string, { id: string; text: string }[]> = {
  shsat: [
    { id: 'shsat_1', text: 'Take and pass the SHSAT exam. This is the sole admissions criterion for specialized high schools.' },
    { id: 'shsat_2', text: 'Register for the SHSAT by October 31.' },
    { id: 'shsat_3', text: 'The exam is administered digitally.' },
    { id: 'shsat_4', text: 'Practice on the same type of device your school uses.' },
    { id: 'shsat_5', text: 'Offers are released in March alongside all other NYC high school offers.' },
  ],
  audition: [
    { id: 'aud_1', text: 'Prepare your audition or portfolio materials before the application window opens.' },
    { id: 'aud_2', text: 'Upload or submit materials during the application window: October 7 to December 3.' },
    { id: 'aud_3', text: 'Requirements vary by school and by discipline (visual art, music, dance, theater, film, etc.).' },
    { id: 'aud_4', text: "Check each school's program page on MySchools for exactly what to prepare." },
  ],
  screened: [
    { id: 'scr_1', text: 'Screened programs review your grades, attendance record, and any submitted essays or assessments.' },
    { id: 'scr_2', text: 'Maintain strong grades and attendance through the fall semester.' },
    { id: 'scr_3', text: 'New for fall 2026: a two-track system admits top academic performers from each individual middle school, as well as top performers citywide.' },
    { id: 'scr_4', text: "Check each school's program page on MySchools for specific essay prompts or additional requirements." },
  ],
  screened_assessment: [
    { id: 'scrass_1', text: 'These programs require you to complete a school-specific assessment in addition to your grades and attendance record.' },
    { id: 'scrass_2', text: 'Assessment format varies by school. It may be a written essay, an interview, a subject-matter test, or a combination.' },
    { id: 'scrass_3', text: "Check each school's program page on MySchools for the specific assessment format and any preparation materials they provide." },
  ],
  edopt: [
    { id: 'edopt_1', text: 'No additional materials required beyond your standard application.' },
    { id: 'edopt_2', text: 'Ed Opt programs are designed to reflect a mix of academic levels.' },
    { id: 'edopt_3', text: 'All students are eligible to apply.' },
    { id: 'edopt_4', text: 'Rank the school on your MySchools application.' },
  ],
  lottery: [
    { id: 'lot_1', text: 'No additional materials required.' },
    { id: 'lot_2', text: 'Admission is by lottery.' },
    { id: 'lot_3', text: 'All applicants who rank the school have an equal chance.' },
    { id: 'lot_4', text: 'Rank the school on your MySchools application.' },
  ],
}

const ALL_APPLICANTS_ITEMS = [
  { id: 'all_1', text: 'Application window opens October 7 and closes December 3.' },
  { id: 'all_2', text: 'Submit your application at myschools.nyc.' },
  {
    id: 'all_3',
    text: 'You can rank more than 12 schools — list every program you would genuinely attend, in your true order of preference. The DOE recommends at least 12 strong options.',
  },
  { id: 'all_4', text: 'High school offers are released March 5.' },
  {
    id: 'all_5',
    text: "Attend open houses and school tours in October and November. Check each school's calendar on MySchools.",
  },
]

interface Props {
  sections: ReqSection[]
  listHref: string
  lockedCount: number
}

export default function RequirementsContent({ sections, listHref, lockedCount }: Props) {
  const posthog = usePostHog()
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [hydrated, setHydrated] = useState(false)

  // Build all items across all sections + all applicants for progress count
  const allItems = [
    ...sections.flatMap((s) => SECTION_REQUIREMENTS[s.key] ?? []),
    ...ALL_APPLICANTS_ITEMS,
  ]
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
    posthog?.capture('requirements_viewed', { sections: sections.map((s) => s.key) })
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

  function renderShsatCutoffs(info: ShsatCutoffInfo) {
    return (
      <div className="mt-4 p-3 bg-blue-50 border border-blue-100 rounded-md">
        <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2">
          Recent cutoff scores ({info.year} cycle — NYC DOE)
        </p>
        <ul className="space-y-1 mb-2">
          {info.schoolCutoffs.map(({ name, score }) => (
            <li key={name} className="flex justify-between text-sm text-blue-900">
              <span>{name}</span>
              <span className="font-medium ml-4">{score}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-blue-700">
          Based on your matched schools, the lowest recent cutoff score was{' '}
          <span className="font-semibold">{info.lowestScore}</span>. Cutoffs change each year —
          verify at{' '}
          <a
            href="https://www.schools.nyc.gov/enrollment/high-school/specialized-high-schools"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            schools.nyc.gov
          </a>
          .
        </p>
      </div>
    )
  }

  function renderItems(items: { id: string; text: string }[]) {
    return (
      <ul className="space-y-3">
        {items.map((item) => (
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
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
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
    )
  }

  function LockBanner() {
    return (
      <div className="flex items-center justify-center gap-2 py-3 px-4 bg-gray-50 border border-gray-200 rounded-md">
        <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        <span className="text-sm text-gray-500">
          {lockedCount} more school{lockedCount !== 1 ? 's' : ''} —{' '}
          <span className="font-medium text-gray-600">Full Access</span>
        </span>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-2xl mx-auto px-4 py-10">
        {/* Lock banner — top */}
        <div className="mb-4">
          <LockBanner />
        </div>

        {/* Header */}
        <div className="mb-6">
          <Link href={listHref} className="text-sm text-gray-500 hover:text-gray-700">
            &larr; Back to your list
          </Link>
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
            Every effort was made to keep this data current. AI can make mistakes and school data
            can change. Even the DOE&apos;s own prediction tool uses randomness as a tiebreaker.{' '}
            No tool can guarantee an offer. Before submitting, confirm deadlines and requirements at{' '}
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

        {/* Per-section requirements */}
        <div className="space-y-8">
          {sections.map((section) => {
            const items = SECTION_REQUIREMENTS[section.key] ?? []
            return (
              <div key={section.key}>
                <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3 pb-2 border-b border-gray-200">
                  {section.title}
                </h2>
                {renderItems(items)}
                {/* Schools in this section */}
                {section.schools.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                      Your matched schools in this category
                    </p>
                    <ul className="space-y-1">
                      {section.schools.map((school) => (
                        <li key={school.name} className="text-sm text-gray-700">
                          {school.name}
                          {school.sectionNotes.length > 0 && (
                            <span className="ml-2 text-xs text-gray-400">
                              {school.sectionNotes.join(' ')}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {/* SHSAT cutoff scores */}
                {section.shsatCutoffInfo && renderShsatCutoffs(section.shsatCutoffInfo)}
              </div>
            )
          })}

          {/* All Applicants — always shown last */}
          <div>
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3 pb-2 border-b border-gray-200">
              All Applicants
            </h2>
            {renderItems(ALL_APPLICANTS_ITEMS)}
          </div>
        </div>
        {/* Lock banner — bottom */}
        <div className="mt-8">
          <LockBanner />
        </div>
      </div>
      <Footer />
    </main>
  )
}
