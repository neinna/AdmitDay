'use client'

import { useMemo, useState } from 'react'
import { School } from '@/types'
import { BOROUGH_ORDER } from '@/lib/school-list-utils'
import { extractFilters, QueryFilters } from '@/lib/query-filters'
import { getUnmetCriteria } from '@/lib/soft-match'

const BOROUGHS = Object.keys(BOROUGH_ORDER)
const SIZES: { value: School['size']; label: string }[] = [
  { value: 'small', label: 'Small (<400)' },
  { value: 'medium', label: 'Medium (400–1,200)' },
  { value: 'large', label: 'Large (1,200+)' },
]

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b))
}

interface Props {
  schools: School[]
}

export default function FindClient({ schools }: Props) {
  const [boroughs, setBoroughs] = useState<string[]>([])
  const [admissionsTracks, setAdmissionsTracks] = useState<string[]>([])
  const [size, setSize] = useState<string>('')
  const [interests, setInterests] = useState<string[]>([])

  const [askText, setAskText] = useState('')
  const [askFilters, setAskFilters] = useState<QueryFilters | null>(null)

  const admissionsTrackOptions = useMemo(
    () => uniqueSorted(schools.flatMap((s) => s.admissions_types ?? [])),
    [schools]
  )
  const interestOptions = useMemo(
    () => uniqueSorted(schools.flatMap((s) => s.doe_data?.interests ?? [])),
    [schools]
  )

  const hardFiltered = useMemo(() => {
    return schools.filter((school) => {
      if (boroughs.length > 0 && !boroughs.includes(school.borough)) return false
      if (
        admissionsTracks.length > 0 &&
        !(school.admissions_types ?? []).some((t) => admissionsTracks.includes(t))
      )
        return false
      if (size && school.size !== size) return false
      if (interests.length > 0) {
        const schoolInterests = school.doe_data?.interests ?? []
        if (!interests.some((i) => schoolInterests.includes(i))) return false
      }
      return true
    })
  }, [schools, boroughs, admissionsTracks, size, interests])

  const annotated = useMemo(() => {
    const rows = hardFiltered.map((school) => ({
      school,
      missing: askFilters ? getUnmetCriteria(school, askFilters) : [],
    }))
    // Ranked: schools satisfying more (or all) of the ask criteria float up.
    return rows.sort((a, b) => a.missing.length - b.missing.length)
  }, [hardFiltered, askFilters])

  function handleAskSubmit(e: React.FormEvent) {
    e.preventDefault()
    setAskFilters(extractFilters(askText))
  }

  return (
    <div>
      {/* Hard filter controls */}
      <div className="border border-gray-200 rounded-md p-4 mb-5 space-y-5">
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium text-gray-700">Borough</span>
            {boroughs.length > 0 && (
              <button
                type="button"
                onClick={() => setBoroughs([])}
                className="text-xs text-blue-600 hover:underline"
              >
                Clear
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {BOROUGHS.map((b) => (
              <label key={b} className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={boroughs.includes(b)}
                  onChange={() => setBoroughs(toggle(boroughs, b))}
                />
                {b}
              </label>
            ))}
          </div>
        </div>

        <div>
          <span className="text-sm font-medium text-gray-700 mb-1 block">Admissions track</span>
          <div className="flex flex-wrap gap-2">
            {admissionsTrackOptions.map((track) => (
              <button
                key={track}
                type="button"
                onClick={() => setAdmissionsTracks(toggle(admissionsTracks, track))}
                className={`px-3 py-1.5 rounded-full border text-sm transition-colors ${
                  admissionsTracks.includes(track)
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-gray-500'
                }`}
              >
                {track}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="text-sm font-medium text-gray-700 mb-1 block">Size</span>
          <div className="flex gap-5">
            <label className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
              <input type="radio" name="size" checked={size === ''} onChange={() => setSize('')} />
              Any
            </label>
            {SIZES.map((s) => (
              <label key={s.value} className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
                <input
                  type="radio"
                  name="size"
                  checked={size === s.value}
                  onChange={() => setSize(s.value)}
                />
                {s.label}
              </label>
            ))}
          </div>
        </div>

        <div>
          <span className="text-sm font-medium text-gray-700 mb-1 block">Interests</span>
          <div className="flex flex-wrap gap-2">
            {interestOptions.map((interest) => (
              <button
                key={interest}
                type="button"
                onClick={() => setInterests(toggle(interests, interest))}
                className={`px-3 py-1.5 rounded-full border text-sm transition-colors ${
                  interests.includes(interest)
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-gray-500'
                }`}
              >
                {interest}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Soft "ask" box */}
      <form onSubmit={handleAskSubmit} className="mb-5 flex gap-2">
        <input
          type="text"
          value={askText}
          onChange={(e) => setAskText(e.target.value)}
          placeholder='e.g. "soccer in Brooklyn"'
          className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="bg-gray-900 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-700 transition-colors"
        >
          Ask
        </button>
      </form>

      {/* One shared, ranked results list */}
      <div>
        <p className="text-sm text-gray-500 mb-2">
          {annotated.length} school{annotated.length !== 1 ? 's' : ''}
        </p>
        {annotated.length === 0 ? (
          <p className="text-gray-400 text-sm py-8 text-center">No schools match the current filters.</p>
        ) : (
          <ul className="border border-gray-200 rounded-md divide-y divide-gray-200">
            {annotated.map(({ school, missing }) => (
              <li key={school.dbn} className="px-3 py-2.5 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{school.name}</p>
                  <p className="text-xs text-gray-500">
                    {school.borough} &middot; {(school.admissions_types ?? []).join(', ')}
                  </p>
                </div>
                {missing.length > 0 && (
                  <span className="flex-shrink-0 text-xs px-2 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                    missing: {missing.join(', ')}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
