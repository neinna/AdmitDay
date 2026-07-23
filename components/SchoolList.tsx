'use client'

import { useEffect, useState } from 'react'
import { usePostHog } from 'posthog-js/react'
import { SectionGroup, SectionType, UserInputs } from '@/types'
import SchoolRow from './SchoolRow'
import { PAGE_SIZE, getVisibleGroups } from '@/lib/school-list-utils'
import FeedbackRow from './FeedbackRow'

// ── Section visual config ────────────────────────────────────────────────────

const SECTION_STYLE: Record<
  SectionType,
  { headerBg: string; headerText: string; countBg: string }
> = {
  shsat: {
    headerBg: 'bg-blue-600',
    headerText: 'text-white',
    countBg: 'bg-blue-500',
  },
  audition: {
    headerBg: 'bg-purple-600',
    headerText: 'text-white',
    countBg: 'bg-purple-500',
  },
  screened: {
    headerBg: 'bg-orange-500',
    headerText: 'text-white',
    countBg: 'bg-orange-400',
  },
  edopt: {
    headerBg: 'bg-amber-400',
    headerText: 'text-gray-900',
    countBg: 'bg-amber-300',
  },
  lottery: {
    headerBg: 'bg-gray-500',
    headerText: 'text-white',
    countBg: 'bg-gray-400',
  },
}

// ── Summary bar ──────────────────────────────────────────────────────────────

function SummaryBar({
  groups,
  totalCount,
}: {
  groups: SectionGroup[]
  totalCount: number
}) {
  const parts = groups.map((g) => {
    const shortLabel = g.label.replace(' Schools', '')
    return `${g.schools.length} ${shortLabel}`
  })

  return (
    <div className="flex items-center px-3 py-2.5 mb-2 bg-gray-50 border border-gray-200 rounded-md text-sm text-gray-700">
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 flex-1 min-w-0">
        <span className="font-medium text-gray-900">Your list:</span>
        {parts.map((part, i) => (
          <span key={i} className="text-gray-600">
            {part}
            {i < parts.length - 1 && <span className="text-gray-400 ml-1.5">&middot;</span>}
          </span>
        ))}
        <span className="text-gray-400">&mdash;</span>
        <span className="font-medium text-gray-900">{totalCount} schools total</span>
      </div>
      <div className="ml-2 flex-shrink-0">
        <FeedbackRow screen="school_list" />
      </div>
    </div>
  )
}

// ── Column header row ─────────────────────────────────────────────────────────

function ColumnHeaders() {
  return (
    <div className="grid grid-cols-[2rem_1fr_6rem_1rem] sm:grid-cols-[2rem_1fr_5rem_2.5rem_6rem_1rem] md:grid-cols-[2rem_1fr_5rem_2.5rem_1fr_6rem_1rem] items-center gap-2 px-3 py-1.5 border-b border-gray-200 bg-white">
      <span className="text-xs text-gray-400 text-right">#</span>
      <span className="text-xs text-gray-400">School</span>
      <span className="hidden sm:block text-xs text-gray-400">Borough</span>
      <span className="hidden sm:block text-xs text-gray-400 text-center">Maps</span>
      <span className="hidden md:block text-xs text-gray-400">Admissions</span>
      <span className="text-xs text-gray-400 text-right">APS</span>
      <span />
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  groups: SectionGroup[]
  userInputs: UserInputs
  totalCount: number
}

export default function SchoolList({ groups, userInputs, totalCount }: Props) {
  const posthog = usePostHog()
  const [collapsed, setCollapsed] = useState<Set<SectionType>>(new Set())
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  useEffect(() => {
    posthog?.capture('list_viewed', {
      total_count: totalCount,
      boroughs: userInputs.boroughs,
      academic_ratings: userInputs.academicRatings,
      shsat: userInputs.shsat,
      auditions: userInputs.auditions,
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function toggleSection(type: SectionType) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(type)) {
        next.delete(type)
      } else {
        next.add(type)
      }
      return next
    })
  }

  const visibleGroups = getVisibleGroups(groups, visibleCount)

  // Build a lookup for original section totals (for the count badge)
  const originalCount: Record<string, number> = {}
  for (const g of groups) originalCount[g.type] = g.schools.length

  return (
    <div>
      <SummaryBar groups={groups} totalCount={totalCount} />

      <div className="border border-gray-200 rounded-md overflow-hidden">
        <ColumnHeaders />

        {visibleGroups.map((group) => {
          const style = SECTION_STYLE[group.type]
          const isCollapsed = collapsed.has(group.type)

          return (
            <div key={group.type}>
              {/* Sticky section header */}
              <button
                onClick={() => toggleSection(group.type)}
                className={`sticky top-0 z-10 w-full flex items-center justify-between px-3 py-2 text-left ${style.headerBg} ${style.headerText} border-b border-opacity-20`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{group.label}</span>
                  <span
                    className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold ${style.countBg} ${style.headerText}`}
                  >
                    {originalCount[group.type]}
                  </span>
                </div>
                <svg
                  className={`w-4 h-4 opacity-80 transition-transform duration-150 ${
                    isCollapsed ? '-rotate-90' : ''
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* School rows */}
              {!isCollapsed && (
                <div>
                  {group.schools.map((school, idx) => (
                    <SchoolRow
                      key={school.dbn}
                      school={school}
                      userInputs={userInputs}
                      rowNumber={group.startIndex + idx + 1}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

    </div>
  )
}
