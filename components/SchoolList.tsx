'use client'

import { useState } from 'react'
import { SectionGroup, SectionType, UserInputs } from '@/types'
import SchoolRow from './SchoolRow'

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
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 px-3 py-2.5 mb-2 bg-gray-50 border border-gray-200 rounded-md text-sm text-gray-700">
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
  )
}

// ── Column header row ─────────────────────────────────────────────────────────

function ColumnHeaders() {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-200 bg-white">
      <span className="text-xs text-gray-400 w-7 text-right shrink-0">#</span>
      <span className="flex-1 text-xs text-gray-400">School</span>
      <span className="hidden sm:block text-xs text-gray-400 w-20 shrink-0">Borough</span>
      <span className="hidden sm:block text-xs text-gray-400 w-12 shrink-0">Commute</span>
      <span className="hidden md:block text-xs text-gray-400 w-44 shrink-0">Admissions</span>
      <span className="text-xs text-gray-400 w-24 text-right shrink-0">Competition</span>
      <span className="w-4 shrink-0" />
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
  const [collapsed, setCollapsed] = useState<Set<SectionType>>(new Set())

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

  return (
    <div>
      <SummaryBar groups={groups} totalCount={totalCount} />

      <div className="border border-gray-200 rounded-md overflow-hidden">
        <ColumnHeaders />

        {groups.map((group) => {
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
                    {group.schools.length}
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
