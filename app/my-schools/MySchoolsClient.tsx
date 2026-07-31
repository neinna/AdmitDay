'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ADDED_SCHOOLS_KEY, trackLabel } from '@/lib/school-list-utils'
import { Eyebrow } from '@/components/ui'
import {
  buildComposition,
  moveItem,
  resolveSavedSchools,
  type Composition,
  type ListSchool,
} from '@/lib/saved-list-utils'

/**
 * /my-schools — issue #137.
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
}

const SAVED_ORDER_KEY = 'admitday_my_schools_order'

export default function MySchoolsClient({ index }: Props) {
  const [order, setOrder] = useState<string[]>([])
  const [hydrated, setHydrated] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  // Saved dbns come from the same key /find writes. A separate key holds the
  // family's ranking, so adding on /find never disturbs an order set here.
  useEffect(() => {
    try {
      const added: string[] = JSON.parse(localStorage.getItem(ADDED_SCHOOLS_KEY) ?? '[]')
      const stored: string[] = JSON.parse(localStorage.getItem(SAVED_ORDER_KEY) ?? '[]')
      const ranked = stored.filter((dbn) => added.includes(dbn))
      const unranked = added.filter((dbn) => !ranked.includes(dbn))
      setOrder([...ranked, ...unranked])
    } catch {
      setOrder([])
    }
    setHydrated(true)
  }, [])

  const persist = (next: string[]) => {
    setOrder(next)
    try {
      localStorage.setItem(SAVED_ORDER_KEY, JSON.stringify(next))
    } catch {
      setNotice('Could not save that change on this device.')
    }
  }

  const saved = useMemo(() => resolveSavedSchools(index, order), [index, order])
  const composition: Composition = useMemo(() => buildComposition(saved), [saved])

  const move = (i: number, dir: -1 | 1) => {
    const next = moveItem(order, i, dir)
    if (next !== order) {
      persist(next)
      setNotice(null)
    }
  }

  const remove = (dbn: string) => {
    persist(order.filter((d) => d !== dbn))
    try {
      const added: string[] = JSON.parse(localStorage.getItem(ADDED_SCHOOLS_KEY) ?? '[]')
      localStorage.setItem(ADDED_SCHOOLS_KEY, JSON.stringify(added.filter((d) => d !== dbn)))
    } catch {
      /* the ranking already updated; storage failure is surfaced below */
    }
    const school = index.find((s) => s.dbn === dbn)
    setNotice(school ? `Removed ${school.name}.` : 'Removed.')
  }

  if (!hydrated) {
    // The list lives in localStorage, so render nothing rather than flashing an
    // empty state at a family who has schools saved.
    return <div className="min-h-[40vh]" aria-busy="true" />
  }

  if (saved.length === 0) {
    // Deliberately one line and one door. An onboarding panel was designed for
    // this state and cut.
    return (
      <div className="px-5 min-[900px]:px-9 py-14">
        <h1 className="font-display font-bold text-[40px] leading-[1.04] tracking-[-0.038em] text-ink">
          My Schools
        </h1>
        <p className="mt-5 text-[15px] text-muted">
          Nothing saved yet.{' '}
          <Link href="/find" className="text-accent underline underline-offset-[3px]">
            Find schools
          </Link>{' '}
          and add the ones you want to compare.
        </p>
      </div>
    )
  }

  const wide = saved.length >= 7

  return (
    <div>
      <div className="flex items-end justify-between gap-5 px-5 min-[900px]:px-9 pt-[30px] pb-6 border-b border-rule">
        <h1 className="font-display font-bold text-[30px] min-[700px]:text-[40px] leading-[1.04] tracking-[-0.038em] text-ink">
          My Schools
        </h1>
        <button
          type="button"
          onClick={() => window.print()}
          className="bg-ink text-white text-[14px] font-medium px-5 py-[11px] hover:opacity-90 transition-opacity duration-[120ms] ease-out"
        >
          Export
        </button>
      </div>

      <div className={wide ? 'grid grid-cols-1 min-[900px]:grid-cols-[1fr_316px]' : ''}>
        <section
          className={`px-5 min-[900px]:px-9 pt-[26px] pb-[30px] ${wide ? 'min-[900px]:border-r border-rule' : ''}`}
        >
          <div className="flex items-baseline justify-between gap-4 mb-3">
            <Eyebrow>Your ranking</Eyebrow>
            <span className="text-[12.5px] text-faint">
              Use ↑ ↓ — this order is the one you&rsquo;ll enter in MySchools
            </span>
          </div>

          <div className="grid grid-cols-[46px_1fr_auto] min-[700px]:grid-cols-[46px_1fr_132px_62px_84px] gap-3 pb-2 border-b border-rule font-mono text-[10px] uppercase tracking-[0.1em] text-faint">
            <span>Rank</span>
            <span>School</span>
            <span className="hidden min-[700px]:block">Track</span>
            <span className="hidden min-[700px]:block">A/Seat</span>
            <span />
          </div>

          {saved.map((school, i) => {
            const ratio = school.applicants_per_seat
            return (
              <div
                key={school.dbn}
                className="grid grid-cols-[46px_1fr_auto] min-[700px]:grid-cols-[46px_1fr_132px_62px_84px] gap-3 items-start py-[11px] border-b border-rule-light hover:bg-surface-2 transition-colors duration-[120ms] ease-out"
              >
                <span className="font-mono text-[16px] font-medium text-ink">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div className="min-w-0">
                  <Link
                    href={`/school/${school.dbn}`}
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
                    {ratio != null && <span className="font-mono ml-2">{ratio} / seat</span>}
                  </p>
                </div>
                <span className="hidden min-[700px]:block text-[13.5px] text-ink-2">
                  {(school.admissions_types ?? []).map(trackLabel).join(', ')}
                </span>
                <span className="hidden min-[700px]:block font-mono text-[14px] text-ink">
                  {ratio != null ? (
                    ratio
                  ) : (
                    <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-faint">
                      Not reported
                    </span>
                  )}
                </span>
                <div className="flex items-center gap-1 justify-end">
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    aria-label={`Move ${school.name} up`}
                    className="w-[23px] h-[23px] border border-border text-[12px] text-ink disabled:text-border disabled:cursor-default hover:border-muted"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={i === saved.length - 1}
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

      <div className="flex flex-col min-[900px]:flex-row justify-between gap-1 px-5 min-[900px]:px-9 py-4 bg-surface-2 border-t border-rule">
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
