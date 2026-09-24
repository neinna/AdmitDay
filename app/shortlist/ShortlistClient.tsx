'use client'

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePostHog } from 'posthog-js/react'
import { citywidePercentile, trackLabel } from '@/lib/school-list-utils'
import { applicantsPerSeatDotColor } from '@/app/find/FindClient'
import { dedupePrograms } from '@/lib/school-detail-utils'
import { Eyebrow } from '@/components/ui'
import AuthControls from '@/components/AuthControls'
import {
  buildComposition,
  bucketForSchool,
  moveItem,
  resolveSavedSchools,
  type Composition,
  type ListSchool,
  type ListSchoolDetail,
} from '@/lib/saved-list-utils'

/**
 * /shortlist (renamed from /my-schools in issue #283) — issue #137.
 *
 * Rank order is the product: NYC families submit an ordered list of programs in
 * MySchools, and this page is a draft of that submission. So the array order IS
 * the ranking, reorder is a primary control (not a nicety), and rank numerals
 * are positional — recomputed on every render, never stored, so a stale number
 * can't be shown.
 *
 * Reorder uses explicit ↑/↓ rather than drag: the list can run long, the
 * audience skews to phones and shared machines, and a parent needs to see "07"
 * and move it one place with certainty.
 *
 * Composition is counts only. Nothing here scores a list, calls it balanced or
 * risky, or predicts anything.
 */

type Props = {
  /** Slim index of every school — the client resolves saved dbns against it. */
  index: ListSchool[]
  /** The signed-in parent's saved dbns, in rank order, fetched server-side from Postgres (issue #200). Empty when signed out. */
  initialOrder: string[]
  /** Print-only detail (issue #405), keyed by dbn, for schools on the saved list only. */
  details?: Record<string, ListSchoolDetail>
  /** Whether the request that rendered this page had a session (issue #240). Signed out, there is no list — saving a school requires an account. */
  signedIn: boolean
}

/** "0.93" -> "93%". Absent input stays absent — never a fabricated 0%. */
function ratePct(v: number | null | undefined): string | null {
  return v == null ? null : `${Math.round(v * 100)}%`
}

/**
 * The real NYC application has a separate SHSAT ranking from the main ranked
 * list (issue #406), so the Shortlist splits into two sections here. A
 * school's section is determined entirely by its admissions type, never by
 * position, so reordering can never move a school across the split.
 */
export function moveWithinSection(order: string[], sectionDbns: string[], localIndex: number, dir: -1 | 1): string[] {
  const moved = moveItem(sectionDbns, localIndex, dir)
  if (moved === sectionDbns) return order
  const positions: number[] = []
  order.forEach((dbn, idx) => {
    if (sectionDbns.includes(dbn)) positions.push(idx)
  })
  const next = order.slice()
  positions.forEach((idx, k) => {
    next[idx] = moved[k]
  })
  return next
}

/** Issue #408: expanding/collapsing a row is a Set toggle, kept pure so both the row's aria-expanded state and multi-row behavior can be unit tested without simulating a click. */
export function toggleExpandedDbn(expanded: Set<string>, dbn: string): Set<string> {
  const next = new Set(expanded)
  if (next.has(dbn)) next.delete(dbn)
  else next.add(dbn)
  return next
}

type DetailField = { label: string; value: string | null }

/**
 * The field set the print block (#405) renders. Issue #408 reuses this for
 * the in-page expand panel too, rather than a second field list.
 */
function buildDetailFields(school: ListSchool, detail?: ListSchoolDetail): DetailField[] {
  return [
    { label: 'Borough', value: school.borough || null },
    { label: 'Neighborhood', value: school.neighborhood ?? null },
    { label: 'Address', value: detail?.doe_data.address ?? null },
    {
      label: 'Admissions tracks',
      value: (school.admissions_types ?? []).map(trackLabel).join(', ') || null,
    },
    {
      label: 'Applicants per seat',
      value: school.applicants_per_seat != null ? `${school.applicants_per_seat.toFixed(1)} applicants per seat` : null,
    },
    {
      label: 'Performance percentile',
      value: detail?.sqr?.performance_pctl != null ? String(detail.sqr.performance_pctl) : null,
    },
    { label: 'Rating', value: detail?.sqr?.rating ?? null },
    {
      label: 'Impact percentile',
      value: detail?.sqr?.impact_pctl != null ? String(detail.sqr.impact_pctl) : null,
    },
    { label: 'Graduation rate', value: ratePct(detail?.doe_data.graduation_rate) },
    { label: 'College and career rate', value: ratePct(detail?.doe_data.college_career_rate) },
    { label: 'Attendance rate', value: ratePct(detail?.doe_data.attendance_rate) },
    {
      label: 'Total students',
      value: detail?.total_students != null ? String(detail.total_students) : null,
    },
    { label: 'Subway', value: detail?.doe_data.subway ?? null },
    { label: 'Bus', value: detail?.doe_data.bus ?? null },
    { label: 'Website', value: detail?.school_website || detail?.doe_data.website || null },
  ].filter((f) => f.value != null && f.value !== '')
}

/** The full record: same field set and program list as the print block (#405), shared by both. */
function SchoolDetailFields({ school, detail }: { school: ListSchool; detail?: ListSchoolDetail }) {
  const fields = buildDetailFields(school, detail)
  const programs = dedupePrograms(detail?.programs ?? [])
  return (
    <>
      <dl>
        {fields.map((f) => (
          <div key={f.label} className="flex gap-3 py-1 text-[13px] border-b border-rule-light">
            <dt className="w-[180px] shrink-0 text-faint">{f.label}</dt>
            <dd className="text-ink-2">{f.value}</dd>
          </div>
        ))}
      </dl>
      {programs.length > 0 && (
        <div className="mt-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-faint mb-1">Programs</p>
          <ul>
            {programs.map((p, idx) => (
              <li key={idx} className="text-[13px] text-ink-2 py-[2px]">
                {p.name} — {p.method}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}

// Issue #199: /shortlist had no header at all before this — the sign-in /
// sign-up buttons are required on every page, so this adds the same header
// pattern already duplicated across page.tsx, FindClient.tsx, and SiteHeader.tsx.
function Header() {
  return (
    <header className="print-hide flex items-center justify-between px-5 min-[900px]:px-9 py-[18px] border-b border-rule">
      <Link href="/" aria-label="AdmitDay home" className="flex items-center gap-[9px]">
        <span className="w-[9px] h-[9px] bg-accent inline-block" />
        <div className="flex items-baseline">
          <span className="font-display font-bold text-[21px] text-ink tracking-[-0.035em]">Admit</span>
          <span className="font-wordmark italic text-[24px] text-accent ml-[3px] tracking-[-0.01em]">Day</span>
        </div>
      </Link>
      <div className="flex items-center gap-7">
        <nav className="flex items-center gap-7 text-[14.5px] text-muted">
          <Link href="/find" className="hover:text-ink transition-colors duration-[120ms] ease-out">Find</Link>
          <span className="text-ink font-medium border-b-2 border-accent pb-[3px]">Shortlist</span>
        </nav>
        <AuthControls />
      </div>
    </header>
  )
}

export default function ShortlistClient({ index, initialOrder, details = {}, signedIn }: Props) {
  const posthog = usePostHog()
  const [order, setOrder] = useState<string[]>(initialOrder)
  const [notice, setNotice] = useState<string | null>(null)
  // Issue #408: which rows have their detail panel open. Component state
  // only — not persisted, and toggling it never touches `order`.
  const [expandedDbns, setExpandedDbns] = useState<Set<string>>(new Set())
  const viewFiredRef = useRef(false)
  // Computed client-side only, after mount: computing it during SSR would
  // bake the server's date/locale into the markup and risk a hydration
  // mismatch against the browser's.
  const [printDate, setPrintDate] = useState('')

  useEffect(() => {
    setPrintDate(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }))
  }, [])

  // The order arrives from the server (Postgres, issue #200) as a prop, so
  // there is no client-side fetch/hydration step here — only the view-fired
  // analytics guard, which still needs the Strict Mode double-invoke guard
  // (issue #196).
  useEffect(() => {
    const resolvedOrder = initialOrder
    if (!viewFiredRef.current) {
      viewFiredRef.current = true
      posthog?.capture('shortlist_viewed', { list_size: resolvedOrder.length })
    }
  }, [initialOrder.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const persist = async (next: string[]) => {
    setOrder(next)
    try {
      const res = await fetch('/api/saved-schools', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: next }),
      })
      if (!res.ok) throw new Error('save failed')
    } catch {
      setNotice('Could not save that change.')
    }
  }

  const saved = useMemo(() => resolveSavedSchools(index, order), [index, order])
  const composition: Composition = useMemo(() => buildComposition(saved), [saved])

  const sections = useMemo(() => {
    const shsat = saved.filter((s) => bucketForSchool(s) === 'shsat')
    const main = saved.filter((s) => bucketForSchool(s) !== 'shsat')
    return [
      { label: 'SHSAT', schools: shsat },
      { label: 'Main List', schools: main },
    ].filter((section) => section.schools.length > 0)
  }, [saved])

  const move = (sectionDbns: string[], localIndex: number, dir: -1 | 1) => {
    const next = moveWithinSection(order, sectionDbns, localIndex, dir)
    if (next !== order) {
      persist(next)
      setNotice(null)
    }
  }

  const remove = async (dbn: string) => {
    const next = order.filter((d) => d !== dbn)
    setOrder(next)
    try {
      const res = await fetch('/api/saved-schools', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dbn }),
      })
      if (!res.ok) throw new Error('remove failed')
    } catch {
      /* the ranking already updated locally; storage failure is surfaced below */
    }
    const school = index.find((s) => s.dbn === dbn)
    setNotice(school ? `Removed ${school.name}.` : 'Removed.')
    posthog?.capture('school_removed', { dbn, list_size_after: next.length })
  }

  const toggleExpanded = (dbn: string) => {
    setExpandedDbns((prev) => toggleExpandedDbn(prev, dbn))
  }

  if (!signedIn) {
    // Issue #240: saving a school requires an account, so a signed-out visit
    // has nothing to show — just the door in, via AuthControls in Header.
    return (
      <div>
        <Header />
        <div className="px-5 min-[900px]:px-9 py-14">
          <h1 className="font-display font-bold text-[40px] leading-[1.04] tracking-[-0.038em] text-ink">
            Shortlist
          </h1>
          <p className="mt-5 text-[15px] text-muted">Sign in to see your saved schools.</p>
        </div>
      </div>
    )
  }

  if (saved.length === 0) {
    // Deliberately one line and one door. An onboarding panel was designed for
    // this state and cut.
    return (
      <div>
        <Header />
        <div className="px-5 min-[900px]:px-9 py-14">
          <h1 className="font-display font-bold text-[40px] leading-[1.04] tracking-[-0.038em] text-ink">
            Shortlist
          </h1>
          <p className="mt-5 text-[15px] text-muted">
            Nothing saved yet.{' '}
            <Link href="/find" className="text-accent underline underline-offset-[3px]">
              Find schools
            </Link>{' '}
            and add the ones you want to compare.
          </p>
        </div>
      </div>
    )
  }

  const wide = saved.length >= 7

  return (
    <div>
      <Header />
      <div className="print-hide flex items-end justify-between gap-5 px-5 min-[900px]:px-9 pt-[30px] pb-6 border-b border-rule">
        <h1 className="font-display font-bold text-[30px] min-[700px]:text-[40px] leading-[1.04] tracking-[-0.038em] text-ink">
          Shortlist
        </h1>
        <button
          type="button"
          onClick={() => window.print()}
          className="bg-ink text-white text-[14px] font-medium px-5 py-[11px] hover:opacity-90 transition-opacity duration-[120ms] ease-out"
        >
          Print
        </button>
      </div>

      <div className="hidden print:block px-5 py-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-faint">
          Printed {printDate}
        </p>
        <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-faint">
          {saved.length} school{saved.length === 1 ? '' : 's'}
        </p>
      </div>

      {saved.map((school, i) => (
        <div
          key={school.dbn}
          className={`hidden print:block break-inside-avoid px-5 py-6${i > 0 ? ' break-before-page' : ''}`}
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-faint border-b border-rule pb-2 mb-4">
            Shortlist
          </p>
          <h2 className="font-display font-bold text-[22px] tracking-[-0.02em] text-ink">
            {String(i + 1).padStart(2, '0')} — {school.name}
          </h2>
          <p className="font-mono text-[13px] text-faint mb-3">{school.dbn}</p>
          <SchoolDetailFields school={school} detail={details[school.dbn]} />
        </div>
      ))}

      <div className={`print-hide ${wide ? 'grid grid-cols-1 min-[900px]:grid-cols-[1fr_316px]' : ''}`}>
        <section
          className={`px-5 min-[900px]:px-9 pt-[26px] pb-[30px] ${wide ? 'min-[900px]:border-r border-rule' : ''}`}
        >
          <div className="flex items-baseline justify-between gap-4 mb-3">
            <Eyebrow>Your ranking</Eyebrow>
            <span className="text-[12.5px] text-faint">
              Use ↑ ↓ — this order is the one you&rsquo;ll enter in MySchools
            </span>
          </div>

          <div className="grid grid-cols-[46px_1fr_auto] min-[700px]:grid-cols-[46px_minmax(0,24rem)_132px_90px_76px_84px] gap-3 pb-2 border-b border-rule font-mono text-[10px] uppercase tracking-[0.1em] text-faint">
            <span>Rank</span>
            <span>School</span>
            <span className="hidden min-[700px]:block">Track</span>
            <span className="hidden min-[700px]:block">Results</span>
            <span className="hidden min-[700px]:block">Apps/seat</span>
            <span />
          </div>

          {sections.map((section) => {
            const sectionDbns = section.schools.map((s) => s.dbn)
            return (
              <div key={section.label}>
                <Eyebrow className="pt-4 pb-[7px]">{section.label}</Eyebrow>
                {section.schools.map((school, i) => {
                  const ratio = school.applicants_per_seat
                  const resultsPctl = details[school.dbn]?.sqr?.performance_pctl
                  const competitionPctl = ratio != null ? citywidePercentile(ratio, index) : null
                  const isExpanded = expandedDbns.has(school.dbn)
                  const detailPanelId = `shortlist-detail-${school.dbn}`
                  return (
                    <Fragment key={school.dbn}>
                    <div className="grid grid-cols-[46px_1fr_auto] min-[700px]:grid-cols-[46px_minmax(0,24rem)_132px_90px_76px_84px] gap-3 items-start py-[11px] border-b border-rule-light hover:bg-surface-2 transition-colors duration-[120ms] ease-out">
                      <span className="font-mono text-[16px] font-medium text-ink">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <div className="min-w-0">
                        <Link
                          href={`/school/${school.dbn}`}
                          onClick={() =>
                            posthog?.capture('school_detail_viewed', { dbn: school.dbn, from: 'my_schools' })
                          }
                          className="text-[15px] font-semibold text-ink hover:text-accent"
                        >
                          {school.name}
                        </Link>
                        <p className="text-[12.5px] text-muted mt-[2px]">
                          {[school.neighborhood, school.borough].filter(Boolean).join(', ')}
                          <span className="font-mono ml-2 text-faint">{school.dbn}</span>
                        </p>
                        <p className="min-[700px]:hidden text-[13px] text-ink-2 mt-1">
                          {(school.admissions_types ?? []).map(trackLabel).join(', ') || '—'}
                          {ratio != null && (
                            <span className="inline-flex items-center gap-1.5 ml-2">
                              <span className="font-mono">{ratio.toFixed(1)} / seat</span>
                              {competitionPctl != null && (
                                <span
                                  className={`inline-block h-2 w-2 rounded-full ${applicantsPerSeatDotColor(competitionPctl)}`}
                                  title={`More applicants per seat than ${competitionPctl}% of NYC high schools`}
                                  aria-label={`More applicants per seat than ${competitionPctl}% of NYC high schools`}
                                />
                              )}
                            </span>
                          )}
                          {resultsPctl != null && <span className="ml-2">Results {resultsPctl}%</span>}
                        </p>
                      </div>
                      <span className="hidden min-[700px]:block text-[13.5px] text-ink-2">
                        {(school.admissions_types ?? []).map(trackLabel).join(', ')}
                      </span>
                      <span className="hidden min-[700px]:block font-mono text-[13px] text-ink">
                        {resultsPctl != null ? `${resultsPctl}%` : null}
                      </span>
                      <span className="hidden min-[700px]:block font-mono text-[14px] text-ink">
                        {ratio != null ? (
                          <span className="inline-flex items-center gap-1.5">
                            {ratio.toFixed(1)}
                            {competitionPctl != null && (
                              <span
                                className={`inline-block h-2 w-2 rounded-full ${applicantsPerSeatDotColor(competitionPctl)}`}
                                title={`More applicants per seat than ${competitionPctl}% of NYC high schools`}
                                aria-label={`More applicants per seat than ${competitionPctl}% of NYC high schools`}
                              />
                            )}
                          </span>
                        ) : (
                          <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-faint">
                            Not reported
                          </span>
                        )}
                      </span>
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          type="button"
                          onClick={() => toggleExpanded(school.dbn)}
                          aria-expanded={isExpanded}
                          aria-controls={detailPanelId}
                          aria-label={isExpanded ? `Collapse ${school.name}` : `Expand ${school.name}`}
                          className="w-[23px] h-[23px] border border-border text-[12px] text-ink hover:border-muted"
                        >
                          {isExpanded ? '−' : '+'}
                        </button>
                        <button
                          type="button"
                          onClick={() => move(sectionDbns, i, -1)}
                          disabled={i === 0}
                          aria-label={`Move ${school.name} up`}
                          className="w-[23px] h-[23px] border border-border text-[12px] text-ink disabled:text-border disabled:cursor-default hover:border-muted"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => move(sectionDbns, i, 1)}
                          disabled={i === section.schools.length - 1}
                          aria-label={`Move ${school.name} down`}
                          className="w-[23px] h-[23px] border border-border text-[12px] text-ink disabled:text-border disabled:cursor-default hover:border-muted"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(school.dbn)}
                          aria-label={`Remove ${school.name}`}
                          className="w-[23px] h-[23px] text-[13px] text-faint hover:text-ink"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                    {isExpanded && (
                      <div
                        id={detailPanelId}
                        className="px-3 py-4 border-b border-rule-light bg-surface-2"
                      >
                        <SchoolDetailFields school={school} detail={details[school.dbn]} />
                      </div>
                    )}
                    </Fragment>
                  )
                })}
              </div>
            )
          })}

          {composition.ratioMissing > 0 && (
            <div className="pt-3">
              <Eyebrow>Data gap</Eyebrow>
              <p className="text-[13px] text-muted mt-1">
                The DOE doesn&rsquo;t publish an applicants-per-seat figure for every school on this
                list. That&rsquo;s a gap in the source data, not a low number.
              </p>
            </div>
          )}

          {notice && <p className="text-[13px] text-muted pt-3">{notice}</p>}
        </section>

        <aside className={wide ? '' : 'border-t border-rule'}>
          <section className="px-5 min-[900px]:px-7 py-[26px]">
            <div className="flex items-baseline justify-between gap-3 mb-3">
              <Eyebrow>Composition</Eyebrow>
              <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-faint">
                {composition.total} saved
              </span>
            </div>

            <div className="flex h-3 w-full mb-3">
              {composition.buckets.map((b, i) => (
                <div
                  key={b.key}
                  style={{ flex: b.count }}
                  className={['bg-ink', 'bg-ink-2', 'bg-muted', 'bg-faint'][i]}
                />
              ))}
            </div>

            <div className="flex flex-col gap-[7px]">
              {composition.buckets.map((b, i) => (
                <div key={b.key} className="flex items-center gap-2">
                  <span
                    className={`w-[10px] h-[10px] ${
                      b.count === 0
                        ? 'border border-border bg-surface'
                        : ['bg-ink', 'bg-ink-2', 'bg-muted', 'bg-faint'][i]
                    }`}
                  />
                  <span
                    className={`flex-1 text-[13.5px] ${b.count === 0 ? 'text-faint' : 'text-ink-2'}`}
                  >
                    {b.label}
                  </span>
                  <span className="font-mono text-[13px] text-ink">{b.count}</span>
                </div>
              ))}
            </div>

            <div className="pt-[14px] mt-[14px] border-t border-rule-light">
              <Eyebrow>Reading the shape</Eyebrow>
              <p className="text-[13px] text-muted mt-1">{composition.shapeSentence}</p>
            </div>

            {composition.byBorough.length > 0 && (
              <div className="pt-[14px] mt-[14px] border-t border-rule-light">
                <Eyebrow>Boroughs</Eyebrow>
                <div className="grid grid-cols-3 gap-[1px] bg-rule border border-rule mt-2">
                  {composition.byBorough.slice(0, 6).map((cell) => (
                    <div key={cell.label} className="bg-surface px-3 py-2">
                      <div className="font-mono text-[18px] font-medium tracking-[-0.02em] text-ink">
                        {cell.count}
                      </div>
                      <div className="text-[11px] uppercase tracking-[0.04em] text-faint">
                        {cell.label}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </aside>
      </div>

      <div className="print-hide flex flex-col min-[900px]:flex-row justify-between gap-1 px-5 min-[900px]:px-9 py-4 bg-surface-2 border-t border-rule">
        <span className="text-[13px] text-faint">
          Confirm each program on the official listing before you apply.
        </span>
        <span className="text-[13px] text-faint">
          Counts only — we don&rsquo;t score a list or predict an outcome.
        </span>
      </div>
    </div>
  )
}
