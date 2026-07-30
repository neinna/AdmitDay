'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { School } from '@/types'
import { ADDED_SCHOOLS_KEY, trackLabel } from '@/lib/school-list-utils'
import { StatCell, ActivityGroup, ProgramRow, RequirementBlock, chipIsMatched } from '@/lib/school-detail-utils'
import { Eyebrow, DefinitionRow, NotReportedLine, StatGrid } from '@/components/ui'
import SiteHeader from './SiteHeader'

const PROGRAMS_CAP = 6
const CHIPS_CAP = 7

interface AlsoOnListEntry {
  dbn: string
  name: string
}

interface Props {
  school: School
  name: string
  neighborhood: string
  tracks: string[]
  statCells: StatCell[]
  notReportedStatsSentence: string | null
  programs: ProgramRow[]
  requirementBlocks: RequirementBlock[]
  activityGroups: ActivityGroup[]
  notOfferedActivitiesSentence: string | null
  matchedSignals: string[]
  matchedDisplayLabels: string[]
  subwayLines: string[]
  busRoutes: string[]
  notReportedTransitLabel: string | null
  provenanceSource: string
  provenanceCycle: string | null
  sourceUrl: string
  myschoolsUrl: string
  backHref: string
  backLabel: string
  positionLabel: string | null
  alsoOnYourListIndex: AlsoOnListEntry[]
}

export default function SchoolDetailClient({
  school,
  name,
  neighborhood,
  tracks,
  statCells,
  notReportedStatsSentence,
  programs,
  requirementBlocks,
  activityGroups,
  notOfferedActivitiesSentence,
  matchedSignals,
  matchedDisplayLabels,
  subwayLines,
  busRoutes,
  notReportedTransitLabel,
  provenanceSource,
  provenanceCycle,
  sourceUrl,
  myschoolsUrl,
  backHref,
  backLabel,
  positionLabel,
  alsoOnYourListIndex,
}: Props) {
  const [addedDbns, setAddedDbns] = useState<Set<string>>(new Set())
  const [hydrated, setHydrated] = useState(false)
  const [programsExpanded, setProgramsExpanded] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})

  useEffect(() => {
    try {
      const stored = localStorage.getItem(ADDED_SCHOOLS_KEY)
      if (stored) setAddedDbns(new Set(JSON.parse(stored)))
    } catch {
      // ignore
    }
    setHydrated(true)
  }, [])

  function toggleAdded() {
    setAddedDbns((prev) => {
      const next = new Set(prev)
      if (next.has(school.dbn)) next.delete(school.dbn)
      else next.add(school.dbn)
      try {
        localStorage.setItem(ADDED_SCHOOLS_KEY, JSON.stringify(Array.from(next)))
      } catch {
        // ignore
      }
      return next
    })
  }

  const addedCount = hydrated ? addedDbns.size : 0
  const added = hydrated && addedDbns.has(school.dbn)
  const alsoOnYourList = alsoOnYourListIndex.filter((s) => hydrated && addedDbns.has(s.dbn)).slice(0, 4)

  const visiblePrograms = programsExpanded ? programs : programs.slice(0, PROGRAMS_CAP)

  const address = school.doe_data?.address
    ? `${school.doe_data.address}, ${school.borough}${school.doe_data.zip ? ' NY ' + school.doe_data.zip : ''}`
    : null

  return (
    <div className="max-w-[1120px] mx-auto bg-surface">
      <SiteHeader addedCount={addedCount} />

      <div className="flex flex-col min-[900px]:flex-row items-start min-[900px]:items-center justify-between gap-2 min-[900px]:gap-5 px-5 min-[900px]:px-9 py-[11px] bg-surface-2 border-b border-rule">
        <Link href={backHref} className="text-[13.5px] text-accent">
          ‹ {backLabel}
        </Link>
        {positionLabel && (
          <span className="font-mono text-[11px] tracking-[0.12em] uppercase text-faint">
            {positionLabel}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 min-[900px]:grid-cols-[1fr_200px] gap-7 items-start px-5 min-[900px]:px-9 pt-[30px] pb-[26px] border-b border-rule">
        <div className="flex flex-col gap-3">
          <h1
            className="font-display font-bold text-[26px] min-[521px]:text-[30px] min-[701px]:text-[40px] leading-[1.04] tracking-[-0.038em] text-ink max-w-[700px]"
            style={{ textWrap: 'pretty' }}
          >
            {name}
          </h1>
          <div className="font-mono text-[13px] text-faint tracking-[0.02em]">
            {school.dbn} · {neighborhood} · {school.borough}
          </div>
          <div className="flex flex-wrap gap-2 pt-[2px]">
            {tracks.map((t) => (
              <span key={t} className="text-[13px] px-[11px] py-[5px] border border-ink text-ink">
                {t}
              </span>
            ))}
            {school.flags.is_hidden_gem && (
              <span className="font-mono text-[10.5px] tracking-[0.08em] uppercase text-gem bg-gem-bg border border-gem-border px-2 py-1">
                Hidden gem
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-row min-[900px]:flex-col gap-2">
          <button
            type="button"
            onClick={toggleAdded}
            className={`flex-1 text-center text-[14px] font-medium py-[11px] transition-colors duration-[120ms] ease-out hover:bg-ink hover:text-white ${
              added ? 'border border-ink text-ink' : 'bg-ink text-white'
            }`}
          >
            {added ? 'On your list · Remove' : 'Add to list'}
          </button>
          <a
            href={myschoolsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 text-center border border-border text-[13.5px] text-accent py-[10px] hover:bg-surface-2 transition-colors duration-[120ms] ease-out"
          >
            MySchools page ↗
          </a>
        </div>
      </div>

      <div className="px-5 min-[900px]:px-9 pt-[26px] pb-7 border-b border-rule">
        <Eyebrow className="pb-[14px]">The numbers</Eyebrow>
        <StatGrid stats={statCells} />
        {notReportedStatsSentence && (
          <NotReportedLine variant="reported" className="pt-3">
            {notReportedStatsSentence}
          </NotReportedLine>
        )}
      </div>

      <div className="grid grid-cols-1 min-[900px]:grid-cols-[1fr_316px]">
        <div className="flex flex-col min-[900px]:border-r border-rule">
          {programs.length > 0 && (
            <div className="px-5 min-[900px]:px-9 pt-[26px] pb-7 border-b border-rule flex flex-col gap-[14px]">
              <div className="flex items-baseline justify-between">
                <Eyebrow>Programs</Eyebrow>
                <span className="font-mono text-[12px] text-faint">{programs.length}</span>
              </div>
              <div className="flex flex-col">
                {visiblePrograms.map((p, i) => (
                  <div
                    key={`${p.name}-${i}`}
                    className={`grid grid-cols-1 min-[900px]:grid-cols-[1fr_190px] gap-4 py-[11px] px-2 -mx-2 hover:bg-surface-2 transition-colors duration-[120ms] ease-out ${
                      i < visiblePrograms.length - 1 ? 'border-b border-rule-light' : ''
                    }`}
                  >
                    <span className="text-[15px] font-medium text-ink">{p.name}</span>
                    <span className="text-[13.5px] text-muted">{p.method}</span>
                  </div>
                ))}
              </div>
              {!programsExpanded && programs.length > PROGRAMS_CAP && (
                <button
                  type="button"
                  onClick={() => setProgramsExpanded(true)}
                  className="text-left text-[13.5px] text-accent"
                >
                  Show all {programs.length} programs
                </button>
              )}
            </div>
          )}

          <div className="px-5 min-[900px]:px-9 pt-[26px] pb-7 border-b border-rule flex flex-col gap-4">
            <Eyebrow>What&rsquo;s required to apply</Eyebrow>
            {requirementBlocks.map((block) => (
              <div
                key={block.track}
                className={`pl-4 py-[2px] flex flex-col gap-[9px] border-l-2 ${
                  block.isPrimary ? 'border-accent' : 'border-border'
                }`}
              >
                <div className="text-[15px] font-bold text-ink">{trackLabel(block.track)}</div>
                {block.fields.length > 0 && (
                  <div className="flex flex-col gap-[6px]">
                    {block.fields.map((f, i) => (
                      <DefinitionRow key={i} label={f.label} value={f.value} />
                    ))}
                  </div>
                )}
              </div>
            ))}
            <div className="flex flex-col min-[521px]:flex-row items-start min-[521px]:items-center gap-[14px] px-4 py-[13px] bg-surface-2 border border-rule">
              <span className="text-[14px] text-ink-2 flex-1" style={{ textWrap: 'pretty' }}>
                Requirements change year to year. Confirm on the official listing before you apply.
              </span>
              <a
                href={myschoolsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[13.5px] font-medium border border-accent px-[14px] py-2 whitespace-nowrap text-accent hover:bg-accent hover:text-white transition-colors duration-[120ms] ease-out"
              >
                Open in MySchools ↗
              </a>
            </div>
          </div>

          {(activityGroups.length > 0 || notOfferedActivitiesSentence) && (
            <div className="px-5 min-[900px]:px-9 pt-[26px] pb-[30px] flex flex-col gap-[18px]">
              <div className="flex items-baseline justify-between gap-4 flex-wrap">
                <Eyebrow>Activities</Eyebrow>
                {matchedDisplayLabels.length > 0 && (
                  <div className="flex items-center gap-[7px] flex-wrap">
                    <span className="font-mono text-[10.5px] tracking-[0.1em] uppercase text-faint">
                      Matched your ask
                    </span>
                    {matchedDisplayLabels.map((label) => (
                      <span
                        key={label}
                        className="text-[12.5px] px-[9px] py-1 bg-accent-bg border border-accent-border text-accent"
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-[14px]">
                {activityGroups.map((group, i) => {
                  const expanded = expandedGroups[group.key] ?? false
                  const visibleItems = expanded ? group.items : group.items.slice(0, CHIPS_CAP)
                  const hiddenCount = group.items.length - visibleItems.length
                  return (
                    <div
                      key={group.key}
                      className={`grid grid-cols-1 min-[900px]:grid-cols-[152px_1fr] gap-4 items-start ${
                        i > 0 ? 'pt-[14px] border-t border-rule-light' : ''
                      }`}
                    >
                      <div className="flex items-baseline gap-[7px]">
                        <span className="text-[14px] font-medium text-ink">{group.label}</span>
                        <span className="font-mono text-[12px] text-faint">{group.items.length}</span>
                      </div>
                      <div className="flex flex-wrap gap-[7px]">
                        {visibleItems.map((item) => {
                          const matched = chipIsMatched(item, matchedSignals)
                          return (
                            <span
                              key={item}
                              className={`text-[13px] px-[10px] py-[5px] border ${
                                matched ? 'border-accent bg-accent-bg text-accent' : 'border-border text-ink-2'
                              }`}
                            >
                              {item}
                            </span>
                          )
                        })}
                        {hiddenCount > 0 && (
                          <button
                            type="button"
                            onClick={() => setExpandedGroups((g) => ({ ...g, [group.key]: true }))}
                            className="text-[13px] px-[10px] py-[5px] border border-dashed border-border text-faint"
                          >
                            +{hiddenCount} more
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
                {notOfferedActivitiesSentence && (
                  <NotReportedLine
                    variant="offered"
                    className={activityGroups.length > 0 ? 'pt-[14px] border-t border-rule-light' : ''}
                  >
                    {notOfferedActivitiesSentence}
                  </NotReportedLine>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col">
          <div className="px-[22px] min-[900px]:px-7 py-[26px] border-b border-rule flex flex-col gap-[14px]">
            <Eyebrow>Getting there</Eyebrow>
            <div className="flex flex-col gap-[11px]">
              {subwayLines.length > 0 && (
                <div className="flex flex-col gap-[6px]">
                  <span className="text-[12.5px] text-faint">Subway</span>
                  <div className="flex flex-wrap gap-[6px]">
                    {subwayLines.map((l) => (
                      <span
                        key={l}
                        className="font-mono text-[13px] px-[9px] py-1 border border-border text-ink"
                      >
                        {l}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {busRoutes.length > 0 && (
                <div className="flex flex-col gap-[6px]">
                  <span className="text-[12.5px] text-faint">Bus</span>
                  <div className="flex flex-wrap gap-[6px]">
                    {busRoutes.map((r) => (
                      <span
                        key={r}
                        className="font-mono text-[13px] px-[9px] py-1 border border-border text-ink"
                      >
                        {r}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {address && <DefinitionRow labelWidth={92} label="Address" value={address} className="pt-[3px]" />}
              {notReportedTransitLabel && (
                <NotReportedLine variant="reported">{notReportedTransitLabel}</NotReportedLine>
              )}
            </div>
          </div>

          {alsoOnYourList.length > 0 && (
            <div className="px-[22px] min-[900px]:px-7 py-[26px] border-b border-rule flex flex-col gap-3">
              <Eyebrow>Also on your list</Eyebrow>
              <div className="flex flex-col">
                {alsoOnYourList.map((s, i) => (
                  <Link
                    key={s.dbn}
                    href={`/school/${s.dbn}`}
                    className={`text-[14px] text-ink py-[9px] px-2 -mx-2 hover:bg-surface-2 transition-colors duration-[120ms] ease-out ${
                      i < alsoOnYourList.length - 1 ? 'border-b border-rule-light' : ''
                    }`}
                  >
                    {s.name}
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div className="px-[22px] min-[900px]:px-7 py-[26px] flex flex-col gap-[11px]">
            <Eyebrow>Provenance</Eyebrow>
            <div className="flex flex-col gap-[10px]">
              <DefinitionRow labelWidth={92} label="Source" value={provenanceSource} />
              {provenanceCycle && <DefinitionRow labelWidth={92} label="Cycle" value={provenanceCycle} />}
            </div>
            <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="text-[13.5px] text-accent">
              View source record ↗
            </a>
          </div>
        </div>
      </div>

      <div className="flex flex-col min-[900px]:flex-row items-start min-[900px]:items-center justify-between gap-2 min-[900px]:gap-5 px-5 min-[900px]:px-9 py-4 bg-surface-2 border-t border-rule">
        <Link href={backHref} className="text-[13.5px] text-accent">
          ‹ Back to results
        </Link>
        <span className="text-[13px] text-faint">
          Admit Day publishes DOE data as reported · we do not estimate admissions chances.
        </span>
      </div>
    </div>
  )
}
