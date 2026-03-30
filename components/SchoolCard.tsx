'use client'

import { useEffect, useState } from 'react'
import { School, UserInputs } from '@/types'

const BADGE_CLASSES: Record<string, string> = {
  SHSAT: 'bg-blue-100 text-blue-800',
  Audition: 'bg-purple-100 text-purple-800',
  Screened: 'bg-orange-100 text-orange-800',
  'Screened with Assessment': 'bg-orange-100 text-orange-800',
  'Educational Option': 'bg-gray-100 text-gray-600',
  Open: 'bg-gray-100 text-gray-600',
  Zoned: 'bg-gray-100 text-gray-600',
}

function getSizeLabel(size: string): string {
  if (size === 'small') return 'Small (<400)'
  if (size === 'large') return 'Large (1,200+)'
  return 'Medium (400–1,200)'
}

interface Props {
  school: School
  userInputs: UserInputs
}

export default function SchoolCard({ school, userInputs }: Props) {
  const [rationale, setRationale] = useState('')
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

        if (!res.ok || !res.body) {
          if (!cancelled) setError(true)
          return
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()

        while (true) {
          const { done, value } = await reader.read()
          if (done || cancelled) break
          setRationale((prev) => prev + decoder.decode(value, { stream: true }))
        }
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

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm hover:shadow-md transition-shadow">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
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
            {school.applicants_per_seat != null && (
              <> &middot; {school.applicants_per_seat.toFixed(1)} applicants/seat</>
            )}
          </p>
        </div>
      </div>

      {/* Admissions type badges */}
      {school.admissions_types.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {school.admissions_types.map((type) => (
            <span
              key={type}
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                BADGE_CLASSES[type] ?? 'bg-gray-100 text-gray-600'
              }`}
            >
              {type}
            </span>
          ))}
        </div>
      )}

      {/* IEP note */}
      {showIepNote && (
        <p className="mt-2 text-xs text-green-700 bg-green-50 border border-green-100 rounded px-2.5 py-1">
          Open enrollment — generally accessible for students with IEPs
        </p>
      )}

      {/* AI rationale */}
      <div className="mt-3 min-h-[2rem]">
        {loading && !rationale && (
          <p className="text-sm text-gray-400 animate-pulse">Generating match summary…</p>
        )}
        {rationale && (
          <p className="text-sm text-gray-600 leading-relaxed">{rationale}</p>
        )}
        {error && !rationale && (
          <p className="text-sm text-gray-400 italic">Match summary unavailable.</p>
        )}
      </div>

      {/* Source attribution */}
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
