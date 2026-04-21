'use client'

import { useEffect, useState } from 'react'
import { usePostHog } from 'posthog-js/react'
import Link from 'next/link'
import Footer from '@/components/Footer'
import FeedbackRow from '@/components/FeedbackRow'
import type { ReqSection } from './page'

const STORAGE_KEY = 'hs_nav_requirements'

const PER_SCHOOL_KEYS = new Set(['audition', 'screened', 'screened_assessment'])

const SECTION_STYLE: Record<string, { bg: string; text: string; countBg: string }> = {
  shsat: { bg: 'bg-blue-600', text: 'text-white', countBg: 'bg-blue-500' },
  audition: { bg: 'bg-purple-600', text: 'text-white', countBg: 'bg-purple-500' },
  screened: { bg: 'bg-orange-500', text: 'text-white', countBg: 'bg-orange-400' },
  screened_assessment: { bg: 'bg-orange-400', text: 'text-white', countBg: 'bg-orange-300' },
  edopt: { bg: 'bg-amber-400', text: 'text-gray-900', countBg: 'bg-amber-300' },
  lottery: { bg: 'bg-gray-500', text: 'text-white', countBg: 'bg-gray-400' },
}
const ALL_APPLICANTS_STYLE = { bg: 'bg-gray-700', text: 'text-white' }

const SECTION_DESCRIPTIONS: Record<string, string> = {
  shsat: 'SHSAT score is the sole admissions criterion for these schools.',
  audition: 'Requirements vary by school and by discipline (visual art, music, dance, theater, film, etc.).',
  screened: 'Screened programs review your grades, attendance record, and any submitted essays or assessments.',
  screened_assessment: 'These programs require you to complete a school-specific assessment in addition to your grades and attendance record.',
  edopt: 'Ed Opt programs are designed to reflect a mix of academic levels.',
  lottery: 'Admission is by lottery.',
}

const SECTION_REQUIREMENTS: Record<string, { id: string; text: string }[]> = {
  shsat: [
    { id: 'shsat_1', text: 'Register for the SHSAT by October 31, 2026. The exam is digital and adaptive. This is the first year the SHSAT is adaptive.' },
    { id: 'shsat_2', text: 'Start prep in August using official DOE practice materials. The DOE provides a free Student Readiness Tool (SRT) that replicates the exact exam interface.' },
    { id: 'shsat_3', text: 'Take 2-3 practice tests before October, then review weak areas in the final weeks.' },
  ],
  audition: [
    { id: 'aud_1', text: 'Prepare your audition or portfolio materials before the application window opens.' },
    { id: 'aud_2', text: 'Upload or submit materials during the application window: October 7 to December 3.' },
    { id: 'aud_4', text: "Check each school's program page on MySchools for exactly what to prepare." },
  ],
  screened: [
    { id: 'scr_2', text: 'Maintain strong grades and attendance through the fall semester.' },
    { id: 'scr_3', text: 'New for fall 2026: a two-track system admits top academic performers from each individual middle school, as well as top performers citywide.' },
    { id: 'scr_4', text: "Check each school's program page on MySchools for specific essay prompts or additional requirements." },
  ],
  screened_assessment: [
    { id: 'scrass_2', text: 'Assessment format varies by school. It may be a written essay, an interview, a subject-matter test, or a combination.' },
    { id: 'scrass_3', text: "Check each school's program page on MySchools for the specific assessment format and any preparation materials they provide." },
  ],
  edopt: [
    { id: 'edopt_1', text: 'No additional materials required beyond your standard application.' },
    { id: 'edopt_3', text: 'All students are eligible to apply.' },
    { id: 'edopt_4', text: 'Rank the school on your MySchools application.' },
  ],
  lottery: [
    { id: 'lot_1', text: 'No additional materials required.' },
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

  // Build all items across all sections + all applicants for progress count.
  // Per-school sections (audition, screened) show requirements as info text, not checkboxes.
  const allItems = [
    ...sections
      .filter((s) => !PER_SCHOOL_KEYS.has(s.key))
      .flatMap((s) => SECTION_REQUIREMENTS[s.key] ?? []),
    ...ALL_APPLICANTS_ITEMS,
  ]
  // Only use localStorage-backed checked state after hydration to prevent hydration mismatch.
  // Server and initial client render must produce identical HTML (both see empty checked state).
  const displayChecked = hydrated ? checked : {}
  const doneCount = allItems.filter((item) => displayChecked[item.id]).length

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

  function firstSentence(text: string): string {
    const idx = text.indexOf('. ')
    if (idx !== -1) return text.slice(0, idx + 1)
    return text.length > 150 ? text.slice(0, 147) + '…' : text
  }

  function renderScreenedRequirements(requirements: Record<string, string>) {
    const programs: Record<string, string[]> = {}
    for (const [key, value] of Object.entries(requirements)) {
      const match = key.match(/^requirement\d+_(\d+)$/)
      if (match && value) {
        const prog = match[1]
        if (!programs[prog]) programs[prog] = []
        programs[prog].push(value)
      }
    }
    const entries = Object.entries(programs).sort((a, b) => Number(a[0]) - Number(b[0]))
    const multi = entries.length > 1
    return entries.map(([, reqs], i) => (
      <div key={i} className="bg-gray-50 rounded p-2 mt-1">
        {multi && <div className="font-medium text-gray-700 mb-0.5">Program {i + 1}</div>}
        <ul className="space-y-0.5">
          {reqs.map((req, j) => <li key={j}>{req}</li>)}
        </ul>
      </div>
    ))
  }

  function renderItems(items: { id: string; text: string }[]) {
    return (
      <ul className="space-y-3">
        {items.map((item) => (
          <li key={item.id} className="flex items-start gap-3">
            <button
              onClick={() => toggle(item.id)}
              aria-label={displayChecked[item.id] ? `Uncheck: ${item.text}` : `Check: ${item.text}`}
              className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                displayChecked[item.id]
                  ? 'bg-gray-900 border-gray-900'
                  : 'border-gray-300 hover:border-gray-500'
              }`}
            >
              {displayChecked[item.id] && (
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
                displayChecked[item.id] ? 'text-gray-400 line-through' : 'text-gray-700'
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

        {/* Per-section requirements */}
        <div className="space-y-8">
          {sections.map((section) => {
            const items = SECTION_REQUIREMENTS[section.key] ?? []
            const sStyle = SECTION_STYLE[section.key] ?? { bg: 'bg-gray-600', text: 'text-white', countBg: 'bg-gray-500' }
            const cutoffMap = section.key === 'shsat' && section.shsatCutoffInfo
              ? new Map(section.shsatCutoffInfo.schoolCutoffs.map(({ name, score }) => [name, score]))
              : null
            return (
              <div key={section.key}>
                <h2 className={`text-sm font-semibold px-3 py-2 mb-3 rounded-md flex items-center gap-2 ${sStyle.bg} ${sStyle.text}`}>
                  <span>{section.title}</span>
                  <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold ${sStyle.countBg} ${sStyle.text}`}>
                    {section.schools.length}
                  </span>
                </h2>
                {/* Description */}
                {SECTION_DESCRIPTIONS[section.key] && (
                  <p className="text-sm text-gray-600 mb-4">{SECTION_DESCRIPTIONS[section.key]}</p>
                )}
                {/* Schools in this section */}
                {section.schools.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                      Your matched schools in this category
                    </p>
                    <ul className="space-y-4">
                      {section.schools.map((school) => (
                        <li key={school.name} className="text-sm text-gray-700">
                          <span className="font-semibold text-gray-900">
                            {school.name}{cutoffMap?.has(school.name) ? ` — ${cutoffMap.get(school.name)}` : ''}
                          </span>
                          {school.sectionNotes.length > 0 && (
                            <span className="ml-2 text-xs text-gray-400">
                              {school.sectionNotes.join(' ')}
                            </span>
                          )}
                          {!cutoffMap && school.prgdesc && (
                            <p className="text-xs text-gray-500 mt-0.5 italic">{firstSentence(school.prgdesc)}</p>
                          )}
                          {school.auditionInformation && school.auditionInformation.length > 0 && (
                            <div className="mt-2 space-y-2">
                              {school.auditionInformation.slice(0, 3).map((info, i) => (
                                <div key={i} className="text-xs text-gray-600 bg-gray-50 rounded p-2">
                                  {school.auditionInformation!.length > 1 && (
                                    <div className="font-medium text-gray-700 mb-0.5">Program {i + 1}</div>
                                  )}
                                  <div>{info}</div>
                                </div>
                              ))}
                            </div>
                          )}
                          {school.requirements && Object.keys(school.requirements).length > 0 && (
                            <div className="mt-1 text-xs text-gray-600">
                              {renderScreenedRequirements(school.requirements)}
                            </div>
                          )}
                          {PER_SCHOOL_KEYS.has(section.key) && !school.auditionInformation?.length && !school.requirements && (
                            <ul className="mt-1.5 space-y-1">
                              {(SECTION_REQUIREMENTS[section.key] ?? []).map((item) => (
                                <li key={item.id} className="text-xs text-gray-500">• {item.text}</li>
                              ))}
                            </ul>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {!PER_SCHOOL_KEYS.has(section.key) && renderItems(items)}
              </div>
            )
          })}

          {/* All Applicants — always shown last */}
          <div>
            <h2 className={`text-sm font-semibold px-3 py-2 mb-3 rounded-md ${ALL_APPLICANTS_STYLE.bg} ${ALL_APPLICANTS_STYLE.text}`}>
              All Applicants
            </h2>
            {renderItems(ALL_APPLICANTS_ITEMS)}
          </div>
        </div>
        {/* Disclaimer */}
        <div className="bg-amber-50 border border-amber-200 rounded-md p-3 mt-8 mb-3">
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
        <p className="text-xs text-gray-400 mb-6">
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

        {/* Lock banner — bottom */}
        <div className="mt-2">
          <LockBanner />
        </div>
      </div>
      <Footer />
    </main>
  )
}
