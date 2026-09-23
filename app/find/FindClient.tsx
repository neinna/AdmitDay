'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { usePostHog } from 'posthog-js/react'
import { useAuth, useClerk } from '@clerk/nextjs'
import AuthControls from '@/components/AuthControls'
import { PENDING_SAVE_KEY } from '@/components/PendingSaveSync'
import { School } from '@/types'
import {
  FindFilters,
  EMPTY_FIND_FILTERS,
  INITIAL_COUNT,
  PAGE_SIZE,
  ADDED_SCHOOLS_KEY,
  START_ZIP_KEY,
  applyFindFilters,
  countActiveFindFilters,
  describeFindFilters,
  findFilterToLoosen,
  findFiltersToQueryString,
  trackLabel,
  citywidePercentile,
  admissionMethods,
  admissionMethodCopy,
  lookupZipCentroid,
  distanceMiles,
} from '@/lib/school-list-utils'
import { extractFilters, QueryFilters, appliedSignals, removeSignal } from '@/lib/query-filters'
import { getUnmetCriteria } from '@/lib/soft-match'
import { MAX_QUESTION_LENGTH } from '@/lib/ask-guardrails'
import { buildFindRowSummary, MYSCHOOLS_URL } from '@/lib/school-detail-utils'
import { Chip, Button, SchoolRow } from '@/components/ui'
import FeedbackRow from '@/components/FeedbackRow'
import FindRail from './FindRail'

interface AskSource {
  name: string
  dbn: string
  borough: string
  score: number
}

interface AskReason {
  dbn: string
  reason: string
}

interface AnnotatedRow {
  school: School
  missing: string[]
}

interface RankedRow {
  school: School
  missing: string[]
  reason?: string
}

// Issue #329: when the ask has returned per-school reasons, the row list is
// the reasons' own order, restricted to DBNs the rail filters still allow
// (hardFiltered) — the ask can annotate and reorder, but the rail is the hard
// floor (issue #114/#231) so a school outside it must never surface here. With
// no reasons yet (or the ask box cleared), fall back to the existing
// missing-criteria fit ordering.
export function rankFindRows(
  hardFiltered: School[],
  annotated: AnnotatedRow[],
  askReasons: AskReason[]
): RankedRow[] {
  if (askReasons.length === 0) {
    return [...annotated].sort((a, b) => a.missing.length - b.missing.length)
  }
  const allowedDbns = new Set(hardFiltered.map((s) => s.dbn))
  const schoolByDbn = new Map(hardFiltered.map((s) => [s.dbn, s]))
  return askReasons
    .filter((r) => allowedDbns.has(r.dbn))
    .map((r) => ({ school: schoolByDbn.get(r.dbn) as School, missing: [], reason: r.reason }))
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b))
}

function toggleValue(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

function formatSchoolName(name: string): string {
  if (name.endsWith(', The')) return 'The ' + name.slice(0, -5)
  return name
}

// Carries which plain-language ask_failed reason (issue #196) a failed
// /api/find/ask call should report, without re-deriving it (or re-firing the
// event) in the catch block.
class AskRequestError extends Error {
  constructor(public reason: 'bad_request' | 'provider_error') {
    super(`ask request failed: ${reason}`)
  }
}

interface Props {
  schools: School[]
  initialFilters: FindFilters
}

export default function FindClient({ schools, initialFilters }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const posthog = usePostHog()
  const { isSignedIn, isLoaded } = useAuth()
  const { openSignUp } = useClerk()

  const [filters, setFilters] = useState<FindFilters>(initialFilters)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [visibleCount, setVisibleCount] = useState(INITIAL_COUNT)

  const [askText, setAskText] = useState('')
  // Set only when a paste is clipped to MAX_QUESTION_LENGTH (issue #325);
  // cleared on the next real edit so the notice doesn't linger forever.
  const [pasteWasTrimmed, setPasteWasTrimmed] = useState(false)
  const askTextareaRef = useRef<HTMLTextAreaElement>(null)
  const [askFilters, setAskFilters] = useState<QueryFilters | null>(null)
  const [askAnswer, setAskAnswer] = useState('')
  const [askSources, setAskSources] = useState<AskSource[]>([])
  const [askReasons, setAskReasons] = useState<AskReason[]>([])
  const [askLoading, setAskLoading] = useState(false)
  const [askAnswerError, setAskAnswerError] = useState('')
  // Trace id of the answer currently on screen (issue #195) — cleared the
  // moment a new ask starts so a rating can never attach to a stale trace.
  const [askTraceId, setAskTraceId] = useState<string | null>(null)

  const [addedDbns, setAddedDbns] = useState<Set<string>>(new Set())
  const [hydrated, setHydrated] = useState(false)
  const [shortlistLoadFailed, setShortlistLoadFailed] = useState(false)
  const [saveErrorDbns, setSaveErrorDbns] = useState<Set<string>>(new Set())

  // "Starting from" ZIP (issue #343) — a client-only convenience for reading
  // distance on each row. Persisted to localStorage so it survives a reload;
  // it must never leave the browser (no fetch body, no analytics event).
  const [startZip, setStartZip] = useState('')

  useEffect(() => {
    try {
      const saved = localStorage.getItem(START_ZIP_KEY)
      if (saved) setStartZip(saved)
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    try {
      if (startZip) localStorage.setItem(START_ZIP_KEY, startZip)
      else localStorage.removeItem(START_ZIP_KEY)
    } catch {
      // ignore
    }
  }, [startZip])

  const startCoords = useMemo(
    () => (startZip.length === 5 ? lookupZipCentroid(startZip) : null),
    [startZip]
  )
  const zipNotFound = startZip.length === 5 && startCoords == null

  function handleStartZipChange(value: string) {
    setStartZip(value.replace(/\D/g, '').slice(0, 5))
  }

  // Rail filters are a hard floor and live in the URL so a filtered /find
  // view is linkable — reloading the URL restores them (parsed server-side
  // in page.tsx and passed in as initialFilters).
  useEffect(() => {
    const qs = findFiltersToQueryString(filters)
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [filters, pathname, router])

  // Issue #200/#240: saving a school requires an account, so the only saved
  // list is Postgres via /api/saved-schools. Waits for Clerk to finish
  // loading (isLoaded) so a signed-in family's first render never briefly
  // shows an empty list. Signed out, there is no list — any list left over
  // from before accounts existed is discarded by clearing the old key.
  useEffect(() => {
    if (!isLoaded) return
    if (isSignedIn) {
      fetch('/api/saved-schools')
        .then((res) => {
          if (!res.ok) throw new Error('failed to load saved schools')
          return res.json()
        })
        .then((data) => {
          setAddedDbns(new Set(Array.isArray(data.dbns) ? data.dbns : []))
          setShortlistLoadFailed(false)
        })
        .catch(() => {
          // A failed load must never look like a parent who has saved
          // nothing — keep the set empty but flag it as a load failure so
          // the nav can say so instead of showing "0 saved".
          setAddedDbns(new Set())
          setShortlistLoadFailed(true)
        })
        .finally(() => setHydrated(true))
      return
    }
    try {
      localStorage.removeItem(ADDED_SCHOOLS_KEY)
    } catch {
      // ignore
    }
    setHydrated(true)
  }, [isLoaded, isSignedIn])

  useEffect(() => {
    setVisibleCount(INITIAL_COUNT)
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
    () => rankFindRows(hardFiltered, annotated, askReasons),
    [hardFiltered, annotated, askReasons]
  )

  const visible = ranked.slice(0, visibleCount)
  const remaining = ranked.length - visible.length

  const signals = useMemo(() => (askFilters ? appliedSignals(askFilters) : []), [askFilters])

  // Filter changes are computed from the current `filters` closure (not a
  // setState updater) so the posthog.capture call below runs exactly once per
  // click — React 18 Strict Mode double-invokes updater functions in dev,
  // which would otherwise double-fire the analytics event (issue #196).
  function toggleBorough(borough: string) {
    const boroughs = toggleValue(filters.boroughs, borough)
    const next = { ...filters, boroughs }
    setFilters(next)
    if (boroughs.length === 0) {
      posthog?.capture('filter_cleared', { filter_type: 'borough' })
    } else {
      posthog?.capture('filter_applied', {
        filter_type: 'borough',
        value_count: boroughs.length,
        results_after: applyFindFilters(schools, next).length,
      })
    }
  }

  function toggleTrack(track: string) {
    const tracks = toggleValue(filters.tracks, track)
    const next = { ...filters, tracks }
    setFilters(next)
    if (tracks.length === 0) {
      posthog?.capture('filter_cleared', { filter_type: 'track' })
    } else {
      posthog?.capture('filter_applied', {
        filter_type: 'track',
        value_count: tracks.length,
        results_after: applyFindFilters(schools, next).length,
      })
    }
  }

  function setSize(size: string) {
    if (size === filters.size) return
    const next = { ...filters, size }
    setFilters(next)
    if (size === '') {
      posthog?.capture('filter_cleared', { filter_type: 'size' })
    } else {
      posthog?.capture('filter_applied', {
        filter_type: 'size',
        value_count: 1,
        results_after: applyFindFilters(schools, next).length,
      })
    }
  }

  function resetFilters() {
    if (filters.boroughs.length > 0) posthog?.capture('filter_cleared', { filter_type: 'borough' })
    if (filters.tracks.length > 0) posthog?.capture('filter_cleared', { filter_type: 'track' })
    if (filters.size) posthog?.capture('filter_cleared', { filter_type: 'size' })
    setFilters(EMPTY_FIND_FILTERS)
  }

  async function toggleAdded(dbn: string) {
    // Issue #240: saving a school requires an account. Signed out, stash the
    // clicked DBN and open sign-up — PendingSaveSync saves it once the
    // account exists.
    if (!isSignedIn) {
      try {
        sessionStorage.setItem(PENDING_SAVE_KEY, dbn)
      } catch {
        // ignore
      }
      openSignUp()
      return
    }

    const previous = addedDbns
    const adding = !previous.has(dbn)
    const next = new Set(previous)
    if (adding) next.add(dbn)
    else next.delete(dbn)
    setAddedDbns(next)

    let ok: boolean
    try {
      const res = await fetch('/api/saved-schools', {
        method: adding ? 'POST' : 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dbn }),
      })
      ok = res.ok
    } catch {
      ok = false
    }

    if (!ok) {
      // Roll back the optimistic update — a failed save must never be
      // shown to the parent as added (or a failed remove as gone).
      setAddedDbns(previous)
      setSaveErrorDbns((prev) => new Set(prev).add(dbn))
      return
    }

    setSaveErrorDbns((prev) => {
      if (!prev.has(dbn)) return prev
      const next = new Set(prev)
      next.delete(dbn)
      return next
    })
    // Issue #363: which ordering produced this row, and where in it —
    // evidence for whether #361's deferred sort-picker question needs
    // answering. A boolean only (#295) — never the ZIP or coordinates
    // themselves, computed outside the capture call so no commute value
    // ever appears in its source text.
    const commuteStartIsSet = startCoords != null
    const rowPosition = visible.findIndex((row) => row.school.dbn === dbn) + 1
    posthog?.capture(adding ? 'school_saved' : 'school_removed', {
      dbn,
      list_size_after: next.size,
      ...(adding && {
        sort_basis: askReasons.length > 0 ? 'ask' : 'fit',
        row_position: rowPosition,
        has_starting_point: commuteStartIsSet,
      }),
    })
  }

  function removeChip(kind: 'borough' | 'sport' | 'interest', value: string) {
    // Pure edit of the already-extracted filters — re-ranks without ever
    // calling the model again. Only a new ask (handleAskSubmit) does that.
    setAskFilters((prev) => (prev ? removeSignal(prev, kind, value) : prev))
  }

  // Auto-grows the textarea with content (3 rows at rest) up to the
  // max-h-[11rem] cap in its className, where overflow-y-auto takes over.
  useEffect(() => {
    const el = askTextareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [askText])

  function handleAskChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setAskText(e.target.value)
    setPasteWasTrimmed(false)
  }

  // Intercepts paste ourselves instead of letting the browser insert-then-
  // truncate via maxLength: that path fires its own onChange right after,
  // which would immediately clear the trimmed notice before anyone saw it.
  function handleAskPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const pasted = e.clipboardData.getData('text')
    const target = e.currentTarget
    const start = target.selectionStart ?? askText.length
    const end = target.selectionEnd ?? askText.length
    const nextValue = askText.slice(0, start) + pasted + askText.slice(end)

    if (nextValue.length > MAX_QUESTION_LENGTH) {
      e.preventDefault()
      setAskText(nextValue.slice(0, MAX_QUESTION_LENGTH))
      setPasteWasTrimmed(true)
    } else {
      setPasteWasTrimmed(false)
    }
  }

  // Enter submits, Shift+Enter inserts a newline; ignore Enter while an IME
  // composition is still open so confirming a candidate doesn't submit.
  function handleAskKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      e.currentTarget.form?.requestSubmit()
    }
  }

  async function handleAskSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = askText.trim()

    // Soft annotation pass — deterministic, unchanged from #108.
    setAskFilters(extractFilters(askText))
    setAskReasons([])

    if (!trimmed) return

    posthog?.capture('ask_submitted', {
      question_length: trimmed.length,
      filters_active: countActiveFindFilters(filters),
    })

    setAskLoading(true)
    setAskAnswerError('')
    setAskAnswer('')
    setAskSources([])
    setAskTraceId(null)

    const startedAt = Date.now()

    try {
      const res = await fetch('/api/find/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // The rail filters are a hard floor for the school list (issue #114)
        // and must be one for the ask answer too (issue #231) — a school
        // outside them must never be a candidate the model can describe.
        body: JSON.stringify({ question: trimmed, filters }),
      })

      if (res.status === 429) {
        const data = await res.json().catch(() => null)
        setAskAnswerError(
          data?.error ?? "You're sending requests too quickly — please wait a moment and try again."
        )
        posthog?.capture('ask_failed', { reason: 'rate_limited' })
        return
      }

      if (!res.ok) {
        throw new AskRequestError(res.status === 400 ? 'bad_request' : 'provider_error')
      }

      const data = await res.json()
      setAskAnswer(typeof data.answer === 'string' ? data.answer : '')
      const sources = Array.isArray(data.sources) ? data.sources : []
      setAskSources(sources)
      const reasons: AskReason[] = Array.isArray(data.reasons) ? data.reasons : []
      setAskReasons(reasons)
      setAskTraceId(typeof data.traceId === 'string' ? data.traceId : null)
      posthog?.capture('ask_answered', {
        latency_ms: Date.now() - startedAt,
        source_count: sources.length,
        trace_id: typeof data.traceId === 'string' ? data.traceId : '',
        sort_basis: reasons.length > 0 ? 'ask' : 'fit',
      })
    } catch (err) {
      setAskAnswerError('Something went wrong getting an answer. Please try again.')
      posthog?.capture('ask_failed', {
        reason: err instanceof AskRequestError ? err.reason : 'provider_error',
      })
    } finally {
      setAskLoading(false)
    }
  }

  const addedCount = hydrated ? addedDbns.size : 0

  return (
    <div className="max-w-[1120px] mx-auto bg-surface">
      <header className="flex items-center justify-between px-9 py-[18px] border-b border-rule">
        <Link href="/" aria-label="AdmitDay home" className="flex items-center gap-[9px]">
          <span className="w-[9px] h-[9px] bg-accent" />
          <div className="flex items-baseline">
            <span className="font-display font-bold text-[21px] text-ink tracking-[-0.035em]">
              Admit
            </span>
            <span className="font-wordmark italic text-[24px] text-accent ml-[3px] tracking-[-0.01em]">
              Day
            </span>
          </div>
        </Link>
        <div className="flex items-center gap-[28px]">
          <nav className="flex items-center gap-[28px] text-[14.5px] text-muted">
            <span className="text-ink font-medium border-b-2 border-accent pb-[3px]">Find</span>
            <Link href="/shortlist" className="hover:text-ink transition-colors duration-[120ms] ease-out">
              Shortlist
              {hydrated && shortlistLoadFailed ? (
                <span className="text-faint ml-1">Couldn&rsquo;t load your shortlist.</span>
              ) : (
                addedCount > 0 && <span className="font-mono text-accent ml-1">{addedCount}</span>
              )}
            </Link>
          </nav>
          <AuthControls />
        </div>
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
              startZip={startZip}
              zipNotFound={zipNotFound}
              onToggleBorough={toggleBorough}
              onToggleTrack={toggleTrack}
              onSizeChange={setSize}
              onStartZipChange={handleStartZipChange}
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

            <form onSubmit={handleAskSubmit} className="flex gap-[10px] items-start">
              <div className="flex-1 flex items-start gap-[10px] border border-border-strong px-[15px] py-[13px]">
                <span className="font-mono text-[13px] text-accent pt-[2px]">›</span>
                <textarea
                  ref={askTextareaRef}
                  value={askText}
                  onChange={handleAskChange}
                  onPaste={handleAskPaste}
                  onKeyDown={handleAskKeyDown}
                  aria-label="Describe what you're looking for"
                  placeholder="Strong CS, a soccer team, small classes"
                  disabled={askLoading}
                  maxLength={MAX_QUESTION_LENGTH}
                  rows={3}
                  className="flex-1 text-[15px] text-ink outline-none placeholder:text-faint bg-transparent resize-none max-h-[11rem] overflow-y-auto"
                />
              </div>
              <Button type="submit" disabled={askLoading}>
                Ask
              </Button>
            </form>
            <div className="flex items-center gap-3">
              <p
                className={`font-mono text-[12px] ${
                  MAX_QUESTION_LENGTH - askText.length <= 50 ? 'text-red-700' : 'text-faint'
                }`}
                aria-live={MAX_QUESTION_LENGTH - askText.length <= 50 ? 'polite' : undefined}
              >
                {askText.length} / {MAX_QUESTION_LENGTH}
              </p>
              {pasteWasTrimmed && (
                <p role="status" className="font-mono text-[12px] text-faint">
                  Pasted text was trimmed to {MAX_QUESTION_LENGTH} characters.
                </p>
              )}
            </div>
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
                  <FeedbackRow key={askTraceId ?? 'no-trace'} screen="find_ask" traceId={askTraceId ?? undefined} />
                )}
              </div>
            )}
          </div>

          <div className="flex items-baseline justify-between px-9 py-4 bg-surface-2 border-b border-rule">
            <div>
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-[22px] font-medium text-ink tracking-[-0.02em]">
                  {ranked.length}
                </span>
                <span className="text-[14px] text-muted">
                  match{ranked.length === 1 ? '' : 'es'} {describeFindFilters(filters)}
                  {startCoords ? ` · starting from ${startZip}` : ''}
                </span>
              </div>
              <p className="text-[12.5px] text-faint mt-1">
                Schools admitting 9th graders through this year&rsquo;s NYC high school admissions.
              </p>
            </div>
            <div className="font-mono text-[11.5px] tracking-[0.1em] uppercase text-faint">
              Sorted by {askReasons.length > 0 ? 'your ask' : 'fit'}
            </div>
          </div>

          <div className="flex flex-col">
            {hardFiltered.length === 0 ? (
              <div className="px-9 py-10 text-[14px] text-muted">
                No schools match the current filters — try loosening{' '}
                {findFilterToLoosen(filters) ?? 'a filter'}.
              </div>
            ) : (
              visible.map(({ school, reason }, i) => {
                const added = addedDbns.has(school.dbn)
                const neighborhood = school.doe_data?.neighborhood || school.borough
                const tracks = (school.admissions_types ?? []).map(trackLabel).join(', ') || '—'
                const students =
                  school.total_students != null ? school.total_students.toLocaleString() : '—'
                const distance =
                  startCoords && school.location
                    ? `${distanceMiles(school.location, startCoords).toFixed(1)} mi`
                    : null

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

                // Evidence, not a verdict (issue #216) — citywide scale for
                // the Apps/seat stat plus the published method(s) that
                // decide admission. No derived rating, no label.
                const percentile =
                  school.applicants_per_seat != null
                    ? citywidePercentile(school.applicants_per_seat, schools)
                    : null
                const methods = admissionMethods(school)

                return (
                  <SchoolRow
                    key={school.dbn}
                    rowNumber={i + 1}
                    name={formatSchoolName(school.name)}
                    href={detailHref}
                    onNavigate={() =>
                      posthog?.capture('school_detail_viewed', { dbn: school.dbn, from: 'find' })
                    }
                    isHiddenGem={school.flags.high_impact}
                    metadata={`${neighborhood} · ${tracks} · ${students} students${distance ? ` · ${distance}` : ''}`}
                    rationale={buildFindRowSummary(school)}
                    statValue={
                      school.applicants_per_seat != null ? school.applicants_per_seat.toFixed(1) : '—'
                    }
                    statLabel="Apps/seat"
                    evidence={
                      (reason || percentile != null || methods.length > 0) && (
                        <>
                          {reason && <p className="text-[12.5px] text-faint">{reason}</p>}
                          {percentile != null && (
                            <p className="text-[12.5px] text-faint">
                              more applicants per seat than{' '}
                              <span className="font-mono text-ink-2">{percentile}%</span> of NYC high
                              schools
                            </p>
                          )}
                          {methods.length > 0 && (
                            <p className="text-[13px] text-muted" style={{ textWrap: 'pretty' }}>
                              {methods.map((method, methodIndex) => (
                                <span key={method}>
                                  {methodIndex > 0 && ' · '}
                                  <a
                                    href={MYSCHOOLS_URL}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-accent hover:underline"
                                  >
                                    {admissionMethodCopy(method, school)}
                                  </a>
                                </span>
                              ))}
                            </p>
                          )}
                        </>
                      )
                    }
                    action={
                      <div className="flex flex-col gap-1 items-center max-[899px]:items-stretch">
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
                        {saveErrorDbns.has(school.dbn) && (
                          <p className="text-[12.5px] text-faint text-center max-[899px]:text-left">
                            Couldn&rsquo;t save — try again.
                          </p>
                        )}
                      </div>
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
                  Show {remaining} more match{remaining === 1 ? '' : 'es'}
                </button>
              )}
            </div>
            <div className="text-[13px] text-faint">
              Requirements and deadlines from DOE data · Confirm at MySchools before you submit.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
