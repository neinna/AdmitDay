'use client'

import { useEffect, useState } from 'react'
import { School, UserInputs } from '@/types'

// ── Badge config ─────────────────────────────────────────────────────────────

// Display label overrides (type stored in JSON → label shown in UI)
const BADGE_LABEL: Record<string, string> = {
  Open: 'Lottery',
}

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

// ── Competition indicator ────────────────────────────────────────────────────

function getCompetitionText(school: School): string {
  // Priority: SHSAT > Audition > Screened > Open / EdOpt
  if (school.flags.has_shsat) return 'Admission by SHSAT score only — lottery does not apply'
  if (school.flags.has_audition) return 'Admission by audition — lottery does not apply'
  if (school.flags.has_screened) return 'Admission by grades and assessment — lottery does not apply'

  // Lottery schools: show applicants/seat + label
  const aps = school.applicants_per_seat
  if (aps == null) return 'Competition: Data unavailable'

  let label: string
  if (aps < 2.0) label = 'Low'
  else if (aps <= 5.0) label = 'Medium'
  else label = 'High'

  return `Competition: ${label} (${aps.toFixed(1)} applicants/seat)`
}

function getCompetitionColor(school: School): string {
  if (school.flags.has_shsat || school.flags.has_audition || school.flags.has_screened) {
    return 'text-gray-500'
  }
  const aps = school.applicants_per_seat
  if (aps == null) return 'text-gray-400'
  if (aps < 2.0) return 'text-green-700'
  if (aps <= 5.0) return 'text-yellow-700'
  return 'text-red-700'
}

// ── Misc helpers ─────────────────────────────────────────────────────────────

function getSizeLabel(size: string): string {
  if (size === 'small') return 'Small (<400)'
  if (size === 'large') return 'Large (1,200+)'
  return 'Medium (400–1,200)'
}

// ── Component ────────────────────────────────────────────────────────────────

interface RationaleData {
  title: string
  rationale: string
}

interface Props {
  school: School
  userInputs: UserInputs
}

export default function SchoolCard({ school, userInputs }: Props) {
  const [rationaleData, setRationaleData] = useState<RationaleData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function fetchRationale() {
      try {
        const res = await fetch('/api/rationale', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ school, userInputs }),
        })
        if (!res.ok) {
          if (!cancelled) setError(true)
          return
        }
        const data: RationaleData = await res.json()
        if (!cancelled) setRationaleData(data)
      } catch {
        if (!cancelled) setError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchRationale()
    return () => {
      cancelled = true
    }
  }, [school.dbn]) // eslint-disable-line react-hooks/exhaustive-deps

  const showIepNote = userInputs.iep && school.flags.has_open
  const competitionText = getCompetitionText(school)
  const competitionColor = getCompetitionColor(school)

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center flex-wrap gap-2">
            <a
              href={school.sift_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-base font-semibold text-gray-900 hover:underline leading-snug"
            >
              {school.name}
            </a>
            {school.flags.is_hidden_gem && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                Hidden gem
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-0.5">
            {school.borough} &middot; {getSizeLabel(school.size)}
          </p>
        </div>
      </div>

      {/* Admissions type badges */}
      {school.admissions_types.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {school.admissions_types.map((type) => {
            const label = BADGE_LABEL[type] ?? type
            const tooltip = BADGE_TOOLTIPS[type]
            return (
              <span
                key={type}
                title={tooltip}
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  BADGE_CLASSES[type] ?? 'bg-gray-100 text-gray-600'
                } ${tooltip ? 'cursor-help' : ''}`}
              >
                {label}
                {tooltip && (
                  <span className="ml-1 opacity-50 text-xs">ⓘ</span>
                )}
              </span>
            )
          })}
        </div>
      )}

      {/* Competition indicator */}
      <p className={`mt-2 text-xs font-medium ${competitionColor}`}>{competitionText}</p>

      {/* IEP note */}
      {showIepNote && (
        <p className="mt-2 text-xs text-green-700 bg-green-50 border border-green-100 rounded px-2.5 py-1">
          Open enrollment — generally accessible for students with IEPs
        </p>
      )}

      {/* AI rationale */}
      <div className="mt-3 min-h-[2.5rem]">
        {loading && (
          <p className="text-sm text-gray-400 animate-pulse">Generating match summary…</p>
        )}
        {!loading && rationaleData && (
          <div>
            {rationaleData.title && (
              <p className="text-sm font-semibold text-gray-900 mb-1">{rationaleData.title}</p>
            )}
            {rationaleData.rationale && (
              <p className="text-sm text-gray-600 leading-relaxed">{rationaleData.rationale}</p>
            )}
          </div>
        )}
        {!loading && error && (
          <p className="text-sm text-gray-400 italic">Match summary unavailable.</p>
        )}
      </div>

      {/* Source */}
      <p className="mt-3 text-xs text-gray-400">
        Source: NYC-SIFT + NYC DOE Open Data &middot;{' '}
        <a
          href={school.sift_url}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-gray-600"
        >
          View on NYC-SIFT
        </a>
      </p>
    </div>
  )
}
