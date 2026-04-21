'use client'

import { useEffect, useRef, useState } from 'react'
import { usePostHog } from 'posthog-js/react'
import { School, UserInputs } from '@/types'

// ── Badge config (same as SchoolCard) ───────────────────────────────────────

const BADGE_LABEL: Record<string, string> = { Open: 'Lottery', 'Educational Option': 'Ed Opt' }

const BADGE_CLASSES: Record<string, string> = {
  SHSAT: 'bg-blue-100 text-blue-800',
  Audition: 'bg-purple-100 text-purple-800',
  Screened: 'bg-orange-100 text-orange-800',
  'Screened with Assessment': 'bg-orange-100 text-orange-800',
  'Educational Option': 'bg-gray-100 text-gray-600',
  Open: 'bg-gray-100 text-gray-600',
  Zoned: 'bg-gray-100 text-gray-600',
}

const BADGE_TOOLTIPS: Record<string, string> = {
  Open: 'Selected by random lottery. No academic requirements.',
  'Educational Option':
    'Seats reserved for every academic level. Low, middle, and high performers each get one-third of offers.',
}

// ── Competition helpers ──────────────────────────────────────────────────────

function getCompetitionShort(school: School): { text: string; color: string } {
  if (school.flags.has_shsat) return { text: 'SHSAT only', color: 'text-blue-600' }
  if (school.flags.has_audition) return { text: 'Audition', color: 'text-purple-600' }
  if (school.flags.has_screened) return { text: 'Grade Tiers', color: 'text-orange-600' }

  const aps = school.applicants_per_seat
  if (aps == null) return { text: 'N/A', color: 'text-gray-400' }

  if (aps < 2.0) return { text: `${aps.toFixed(1)}/seat`, color: 'text-green-600' }
  if (aps <= 5.0) return { text: `${aps.toFixed(1)}/seat`, color: 'text-yellow-600' }
  return { text: `${aps.toFixed(1)}/seat`, color: 'text-red-600' }
}

function getCompetitionFull(school: School): { text: string; color: string } {
  if (school.flags.has_shsat)
    return { text: 'Admission by SHSAT score only — lottery does not apply', color: 'text-blue-700' }
  if (school.flags.has_audition)
    return { text: 'Admission by audition — lottery does not apply', color: 'text-purple-700' }
  if (school.flags.has_screened)
    return {
      text: 'Admission by grades and assessment — lottery does not apply',
      color: 'text-orange-700',
    }

  const aps = school.applicants_per_seat
  if (aps == null) return { text: 'Competition: Data unavailable', color: 'text-gray-400' }

  if (aps < 2.0)
    return { text: `${aps.toFixed(1)} applicants per seat`, color: 'text-green-700' }
  if (aps <= 5.0)
    return { text: `${aps.toFixed(1)} applicants per seat`, color: 'text-yellow-700' }
  return { text: `${aps.toFixed(1)} applicants per seat`, color: 'text-red-700' }
}

function formatSchoolName(name: string): string {
  if (name.endsWith(', The')) {
    return 'The ' + name.slice(0, -5)
  }
  return name
}

// ── Component ────────────────────────────────────────────────────────────────

interface RationaleData {
  title: string
  rationale: string
}

interface Props {
  school: School
  userInputs: UserInputs
  rowNumber: number
}

export default function SchoolRow({ school, userInputs, rowNumber }: Props) {
  const posthog = usePostHog()
  const [isExpanded, setIsExpanded] = useState(false)
  const [rationaleData, setRationaleData] = useState<RationaleData | null>(null)
  const [loadingRationale, setLoadingRationale] = useState(false)
  const [rationaleError, setRationaleError] = useState(false)
  const hasFetched = useRef(false)

  // Fetch rationale only on first expand
  useEffect(() => {
    if (!isExpanded || hasFetched.current) return
    hasFetched.current = true

    let cancelled = false
    setLoadingRationale(true)

    async function fetchRationale() {
      try {
        const res = await fetch('/api/rationale', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ school, userInputs }),
        })
        if (!res.ok) {
          if (!cancelled) setRationaleError(true)
          return
        }
        const data: RationaleData = await res.json()
        if (!cancelled) setRationaleData(data)
      } catch {
        if (!cancelled) setRationaleError(true)
      } finally {
        if (!cancelled) setLoadingRationale(false)
      }
    }

    fetchRationale()
    return () => {
      cancelled = true
    }
  }, [isExpanded]) // eslint-disable-line react-hooks/exhaustive-deps

  const competitionShort = getCompetitionShort(school)
  const competitionFull = getCompetitionFull(school)
  const isLocal = userInputs.boroughs.length > 0 && userInputs.boroughs.includes(school.borough)
  const showIepNote = userInputs.iep && school.flags.has_open

  return (
    <div className="border-b border-gray-100 last:border-b-0">
      {/* ── Collapsed row ── */}
      <div
        onClick={() => setIsExpanded((v) => !v)}
        className="w-full text-left grid grid-cols-[2rem_1fr_6rem_1rem] sm:grid-cols-[2rem_1fr_5rem_2.5rem_6rem_1rem] md:grid-cols-[2rem_1fr_5rem_2.5rem_1fr_6rem_1rem] items-center gap-2 px-3 py-2.5 hover:bg-gray-50 transition-colors group cursor-pointer"
        role="button"
        aria-expanded={isExpanded}
      >
        {/* Row number */}
        <span className="text-xs text-gray-400 font-mono text-right">
          #{rowNumber}
        </span>

        {/* School name */}
        <span className="text-sm font-medium text-gray-900 pr-1">
          {formatSchoolName(school.name)}
          {school.academic_score_pct === null && (
            <span className="ml-1.5 inline-flex items-center px-1.5 py-0 rounded-full text-xs font-medium bg-gray-100 text-gray-400 align-middle">
              No score
            </span>
          )}
          {school.flags.is_hidden_gem && (
            <span className="ml-1.5 inline-flex items-center px-1.5 py-0 rounded-full text-xs font-medium bg-green-100 text-green-700 align-middle">
              gem
            </span>
          )}
          {school.flags.has_consortium && (
            <span className="ml-1.5 inline-flex items-center px-1.5 py-0 rounded-full text-xs font-medium bg-blue-50 text-blue-700 align-middle">
              Consortium
            </span>
          )}
          {school.flags.has_ib && (
            <span className="ml-1.5 inline-flex items-center px-1.5 py-0 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 align-middle">
              IB
            </span>
          )}
        </span>

        {/* Borough — hidden on mobile */}
        <span className="hidden sm:block text-xs text-gray-500 truncate">
          {school.borough}
        </span>

        {/* Maps link — hidden on mobile */}
        <a
          href={(() => {
            const addr = school.doe_data?.address
            const zip = school.doe_data?.zip
            const query = addr
              ? `${school.name} ${addr} ${zip} NYC`
              : `${school.name} NYC`
            return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
          })()}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="hidden sm:flex items-center justify-center text-gray-400 hover:text-gray-700"
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
          </svg>
        </a>

        {/* Admissions type badges — hidden below md */}
        <div className="hidden md:flex gap-1 flex-wrap">
          {school.admissions_types.map((type) => (
            <span
              key={type}
              title={BADGE_TOOLTIPS[type]}
              className={`inline-flex items-center px-1.5 py-0 rounded-full text-xs font-medium ${
                BADGE_CLASSES[type] ?? 'bg-gray-100 text-gray-600'
              } ${BADGE_TOOLTIPS[type] ? 'cursor-help' : ''}`}
            >
              {BADGE_LABEL[type] ?? type}
            </span>
          ))}
        </div>

        {/* Competition (short) */}
        <span className={`text-xs text-right font-medium ${competitionShort.color}`}>
          {competitionShort.text}
        </span>

        {/* Chevron */}
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform duration-150 ${
            isExpanded ? 'rotate-180' : ''
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* ── Expanded panel ── */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-1 bg-gray-50 border-t border-gray-100">
          <div className="max-w-2xl">
            {/* AI rationale */}
            <div className="mb-3 min-h-[2rem]">
              {loadingRationale && (
                <p className="text-sm text-gray-400 animate-pulse">Generating match summary…</p>
              )}
              {!loadingRationale && rationaleData && (
                <div>
                  {rationaleData.title && (
                    <p className="text-sm font-semibold text-gray-900 mb-1">
                      {rationaleData.title}
                    </p>
                  )}
                  {rationaleData.rationale && (
                    <p className="text-sm text-gray-600 leading-relaxed">
                      {rationaleData.rationale}
                    </p>
                  )}
                </div>
              )}
              {!loadingRationale && rationaleError && !rationaleData && (
                <p className="text-sm text-gray-400 italic">Match summary unavailable.</p>
              )}
            </div>

            {/* Admissions badges (always shown in expanded) */}
            <div className="flex flex-wrap gap-1.5 mb-2 md:hidden">
              {school.admissions_types.map((type) => (
                <span
                  key={type}
                  title={BADGE_TOOLTIPS[type]}
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                    BADGE_CLASSES[type] ?? 'bg-gray-100 text-gray-600'
                  } ${BADGE_TOOLTIPS[type] ? 'cursor-help' : ''}`}
                >
                  {BADGE_LABEL[type] ?? type}
                  {BADGE_TOOLTIPS[type] && <span className="ml-0.5 opacity-40 text-xs">ⓘ</span>}
                </span>
              ))}
            </div>

            {/* Full competition text — not shown for SHSAT (redundant with admissions badge) */}
            {!school.flags.has_shsat && (
              <p className={`text-xs font-medium mb-2 ${competitionFull.color}`}>
                {competitionFull.text}
              </p>
            )}

            {/* IEP note */}
            {showIepNote && (
              <p className="text-xs text-green-700 bg-green-50 border border-green-100 rounded px-2.5 py-1 mb-2">
                Open enrollment — generally accessible for students with IEPs
              </p>
            )}

            {/* Size detail */}
            <p className="text-xs text-gray-500 mb-2">
              {school.size === 'small'
                ? 'Small school (<400 students)'
                : school.size === 'large'
                  ? 'Large school (1,200+ students)'
                  : 'Medium school (400–1,200 students)'}
              {school.applicants_per_seat != null && (
                <> · {school.applicants_per_seat.toFixed(1)} applicants/seat</>
              )}
            </p>

          </div>
        </div>
      )}
    </div>
  )
}
