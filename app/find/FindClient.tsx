'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { School } from '@/types'
import {
  FindFilters,
  EMPTY_FIND_FILTERS,
  PAGE_SIZE,
  ADDED_SCHOOLS_KEY,
  applyFindFilters,
  describeFindFilters,
  findFilterToLoosen,
  findFiltersToQueryString,
} from '@/lib/school-list-utils'
import { extractFilters, QueryFilters, appliedSignals, removeSignal } from '@/lib/query-filters'
import { getUnmetCriteria } from '@/lib/soft-match'
import { Chip, Button, SchoolRow } from '@/components/ui'
import FindRail, { trackLabel } from './FindRail'

interface AskSource {
  name: string
  dbn: string
  borough: string
  score: number
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b))
}

function toggleValue(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

// Same fix applied by the existing components/SchoolRow.tsx.
function formatSchoolName(name: string): string {
  if (name.endsWith(', The')) return 'The ' + name.slice(0, -5)
  return name
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  const cut = text.slice(0, maxLen)
  const lastSpace = cut.lastIndexOf(' ')
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : maxLen)}…`
}

interface Props {
  schools: School[]
  initialFilters: FindFilters
}

export default function FindClient({ schools, initialFilters }: Props) {
  const router = useRouter()
  const pathname = usePathname()

  const [filters, setFilters] = useState<FindFilters>(initialFilters)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  const [askText, setAskText] = useState('')
  const [askFilters, setAskFilters] = useState<QueryFilters | null>(null)
  const [askAnswer, setAskAnswer] = useState('')
  const [askSources, setAskSources] = useState<AskSource[]>([])
  const [askLoading, setAskLoading] = useState(false)
  const [askAnswerError, setAskAnswerError] = useState('')

  const [addedDbns, setAddedDbns] = useState<Set<string>>(new Set())
  const [hydrated, setHydrated] = useState(false)

  // Rail filters are a hard floor and live in the URL so a filtered /find
  // view is linkable — reloading the URL restores them (parsed server-side
  // in page.tsx and passed in as initialFilters).
  useEffect(() => {
    const qs = findFiltersToQueryString(filters)
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [filters, pathname, router])

  useEffect(() => {
    try {
      const stored = localStorage.getItem(ADDED_SCHOOLS_KEY)
      if (stored) setAddedDbns(new Set(JSON.parse(stored)))
    } catch {
      // ignore
    }
    setHydrated(true)
  }, [])

  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [filters])

  const trackOptions = useMemo(
    () => uniqueSorted(schools.flatMap((s) => s.admissions_types ?? [])),
    [schools]
  )

  // Hard filter — the rail excludes schools. This is the hard floor.
  const hardFiltered = useMemo(() => applyFindFilters(schools, filters), [schools, filters])

  // Soft annotation pass from the ask box — never removes a school from
  // hardFiltered, only ranks it. Schools satisfying more (or all) of the ask
  // criteria float up.
  const annotated = useMemo(
    () =>
      hardFiltered.map((school) => ({
        school,
        missing: askFilters ? getUnmetCriteria(school, askFilters) : [],
      })),
    [hardFiltered, askFilters]
  )
  const ranked = useMemo(
    () => [...annotated].sort((a, b) => a.missing.length - b.missing.length),
    [annotated]
  )

  const visible = ranked.slice(0, visibleCount)
  const remaining = ranked.length - visible.length

  const signals = useMemo(() => (askFilters ? appliedSignals(askFilters) : []), [askFilters])

  function toggleBorough(borough: string) {
    setFilters((f) => ({ ...f, boroughs: toggleValue(f.boroughs, borough) }))
  }

  function toggleTrack(track: string) {
    setFilters((f) => ({ ...f, tracks: toggleValue(f.tracks, track) }))
  }

  function setSize(size: string) {
    setFilters((f) => ({ ...f, size }))
  }

  function resetFilters() {
    setFilters(EMPTY_FIND_FILTERS)
  }

  function toggleAdded(dbn: string) {
    setAddedDbns((prev) => {
      const next = new Set(prev)
      if (next.has(dbn)) next.delete(dbn)
      else next.add(dbn)
      try {
        localStorage.setItem(ADDED_SCHOOLS_KEY, JSON.stringify(Array.from(next)))
      } catch {
        // ignore
      }
      return next
    })
  }

  function removeChip(kind: 'borough' | 'sport' | 'interest', value: string) {
    // Pure edit of the already-extracted filters — re-ranks without ever
    // calling the model again. Only a new ask (handleAskSubmit) does that.
    setAskFilters((prev) => (prev ? removeSignal(prev, kind, value) : prev))
  }

  async function handleAskSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = askText.trim()

    // Soft annotation pass — deterministic, unchanged from #108.
    setAskFilters(extractFilters(askText))

    if (!trimmed) return

    setAskLoading(true)
    setAskAnswerError('')
    setAskAnswer('')
    setAskSources([])

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: trimmed }),
      })

      if (res.status === 429) {
        const data = await res.json().catch(() => null)
        setAskAnswerError(
          data?.error ?? "You're sending requests too quickly — please wait a moment and try again."
        )
        return
      }

      if (!res.ok) {
        throw new Error(`Request failed (${res.status})`)
      }

      const data = await res.json()
      setAskAnswer(typeof data.answer === 'string' ? data.answer : '')
      setAskSources(Array.isArray(data.sources) ? data.sources : [])
    } catch {
      setAskAnswerError('Something went wrong getting an answer. Please try again.')
    } finally {
      setAskLoading(false)
    }
  }

  const addedCount = hydrated ? addedDbns.size : 0

  return (
    <div className="max-w-[1120px] mx-auto bg-surface">
      <header className="flex items-center justify-between px-9 py-[18px] border-b border-rule">
        <div className="flex items-center gap-[9px]">
          <span className="w-[9px] h-[9px] bg-accent" />
          <div className="flex items-baseline">
            <span className="font-display font-bold text-[21px] text-ink tracking-[-0.035em]">
              Admit
            </span>
            <span className="font-wordmark italic text-[24px] text-accent ml-[3px] tracking-[-0.01em]">
              Day
            </span>
          </div>
        </div>
        <nav className="flex items-center gap-[28px] text-[14.5px] text-muted">
          <span className="text-ink font-medium border-b-2 border-accent pb-[3px]">Find</span>
          <Link href="/list" className="hover:text-ink transition-colors duration-[120ms] ease-out">
            My Schools
            {addedCount > 0 && <span className="font-mono text-accent ml-1">{addedCount}</span>}
          </Link>
          <Link
            href="/requirements"
            className="hover:text-ink transition-colors duration-[120ms] ease-out"
          >
            Readiness
          </Link>
        </nav>
      </header>

      <div className="grid grid-cols-1 min-[900px]:grid-cols-[316px_1fr]">
        <div>
          <button
            type="button"
            onClick={() => setFiltersOpen((o) => !o)}
            className="min-[900px]:hidden w-full text-left px-9 py-4 border-b border-rule font-mono text-[11px] tracking-[0.12em] uppercase text-faint"
          >
            Filters {filtersOpen ? '▴' : '▾'}
          </button>
          <div className={`${filtersOpen ? 'block' : 'hidden'} min-[900px]:block`}>
            <FindRail
              schools={schools}
              filters={filters}
              trackOptions={trackOptions}
              onToggleBorough={toggleBorough}
              onToggleTrack={toggleTrack}
              onSizeChange={setSize}
              onReset={resetFilters}
            />
          </div>
        </div>

        <div className="flex flex-col">
          <div className="flex flex-col gap-[18px] px-9 pt-[34px] pb-[26px] border-b border-rule">
            <div className="flex flex-col gap-2">
              <h1 className="font-display font-bold text-[44px] leading-[1.02] tracking-[-0.038em] text-ink">
                Find schools
              </h1>
              <p className="text-[15.5px] text-muted max-w-[560px]" style={{ textWrap: 'pretty' }}>
                Filters set the floor. The ask box adds what a filter can&rsquo;t — &ldquo;strong CS,
                a real soccer team, walkable from Sunset Park.&rdquo;
              </p>
            </div>

            <form onSubmit={handleAskSubmit} className="flex gap-[10px]">
              <div className="flex-1 flex items-center gap-[10px] border border-border-strong px-[15px] py-[13px]">
                <span className="font-mono text-[13px] text-accent">›</span>
                <input
                  type="text"
                  value={askText}
                  onChange={(e) => setAskText(e.target.value)}
                  placeholder="strong CS and a soccer team, small classes"
                  disabled={askLoading}
                  className="flex-1 text-[15px] text-ink outline-none placeholder:text-faint bg-transparent"
                />
              </div>
              <Button type="submit" disabled={askLoading}>
                Ask
              </Button>
            </form>
            {askLoading && (
              <p className="font-mono text-[12px] text-faint">Searching schools and generating an answer…</p>
            )}

            {signals.length > 0 && (
              <div className="flex flex-wrap gap-2 items-center">
                <span className="font-mono text-[11px] tracking-[0.1em] uppercase text-faint">
                  Applied
                </span>
                {signals.map((signal) => (
                  <Chip
                    key={`${signal.kind}:${signal.value}`}
                    variant="inferred"
                    onClick={() => removeChip(signal.kind, signal.value)}
                  >
                    {signal.label}
                  </Chip>
                ))}
              </div>
            )}

            {(askAnswerError || askAnswer) && !askLoading && (
              <div className="border border-rule px-4 py-3 flex flex-col gap-2">
                {askAnswerError && (
                  <p role="alert" className="text-[13.5px] text-red-700">
                    {askAnswerError}
                  </p>
                )}
                {!askAnswerError && askAnswer && (
                  <div>
                    <p className="text-[14px] text-ink-2 whitespace-pre-wrap leading-relaxed">
                      {askAnswer}
                    </p>
                    {askSources.length > 0 && (
                      <div className="mt-3">
                        <h2 className="font-mono text-[11px] tracking-[0.1em] uppercase text-faint mb-1.5">
                          Sources
                        </h2>
                        <ul className="flex flex-wrap gap-2">
                          {askSources.map((s) => (
                            <li
                              key={s.dbn}
                              className="text-[12px] px-2 py-1 bg-surface-2 text-ink-2 border border-rule"
                            >
                              {s.name} &middot; {s.borough}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-baseline justify-between px-9 py-4 bg-surface-2 border-b border-rule">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-[22px] font-medium text-ink tracking-[-0.02em]">
                {ranked.length}
              </span>
              <span className="text-[14px] text-muted">
                match{ranked.length === 1 ? '' : 'es'} {describeFindFilters(filters)}
              </span>
            </div>
            <div className="font-mono text-[11.5px] tracking-[0.1em] uppercase text-faint">
              Sorted by fit
            </div>
          </div>

          <div className="flex flex-col">
            {hardFiltered.length === 0 ? (
              <div className="px-9 py-10 text-[14px] text-muted">
                No schools match the current filters — try loosening{' '}
                {findFilterToLoosen(filters) ?? 'a filter'}.
              </div>
            ) : (
              visible.map(({ school }, i) => {
                const added = addedDbns.has(school.dbn)
                const neighborhood = school.doe_data?.neighborhood || school.borough
                const tracks = (school.admissions_types ?? []).map(trackLabel).join(', ') || '—'
                const students =
                  school.total_students != null ? school.total_students.toLocaleString() : '—'

                // Carries the active rail filters + this row's rank + the
                // ask-derived signals through to /school/[dbn] via the URL —
                // the detail page must never re-call the LLM, so whatever it
                // needs to know has to arrive as a query param.
                const detailQuery = new URLSearchParams(findFiltersToQueryString(filters))
                detailQuery.set('pos', String(i + 1))
                detailQuery.set('total', String(ranked.length))
                const matchedValues = signals.filter((s) => s.kind !== 'borough').map((s) => s.value)
                if (matchedValues.length > 0) detailQuery.set('matched', matchedValues.join(','))
                const detailHref = `/school/${school.dbn}?${detailQuery.toString()}`

                return (
                  <SchoolRow
                    key={school.dbn}
                    rowNumber={i + 1}
                    name={
                      <Link href={detailHref} className="hover:underline underline-offset-2">
                        {formatSchoolName(school.name)}
                      </Link>
                    }
                    isHiddenGem={school.flags.is_hidden_gem}
                    metadata={`${neighborhood} · ${tracks} · ${students} students`}
                    rationale={truncate(school.doe_data?.overview ?? '', 140)}
                    statValue={
                      school.applicants_per_seat != null ? school.applicants_per_seat.toFixed(1) : '—'
                    }
                    statLabel="Apps / seat"
                    action={
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => toggleAdded(school.dbn)}
                        className={`w-24 max-[899px]:w-full text-center hover:bg-ink hover:text-white ${
                          added ? 'bg-ink text-white' : ''
                        }`}
                      >
                        {added ? 'Remove' : 'Add'}
                      </Button>
                    }
                  />
                )
              })
            )}
          </div>

          <div className="flex items-center justify-between px-9 py-4 bg-surface-2 border-t border-rule">
            <div className="text-[14px] text-ink">
              {remaining > 0 && (
                <button
                  type="button"
                  onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                  className="text-accent underline underline-offset-[3px]"
                >
                  {remaining} more match{remaining === 1 ? '' : 'es'}
                </button>
              )}
            </div>
            <div className="text-[13px] text-faint">
              Requirements and deadlines from DOE data · confirm at MySchools before you submit.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
