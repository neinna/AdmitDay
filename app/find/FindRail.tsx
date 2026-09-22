'use client'

import { useState } from 'react'
import { School } from '@/types'
import { BOROUGH_ORDER } from '@/lib/school-list-utils'
import {
  FindFilters,
  countMatchingTrack,
  splitTrackOptionsForRail,
  trackLabel,
} from '@/lib/school-list-utils'
import { StartingPoint, WITHIN_MILES_OPTIONS, suggestStationNames } from '@/lib/commute'
import { Chip, SegmentedControl } from '@/components/ui'

const BOROUGHS = Object.keys(BOROUGH_ORDER)

const SIZE_OPTIONS = [
  { label: 'Any', value: '' },
  { label: 'Small', value: 'small' },
  { label: 'Medium', value: 'medium' },
  { label: 'Large', value: 'large' },
]

const WITHIN_OPTIONS = [
  { label: 'Any', value: '' },
  ...WITHIN_MILES_OPTIONS.map((m) => ({ label: `${m} mi`, value: String(m) })),
]

const STATION_DATALIST_ID = 'admitday-subway-stations'

interface Props {
  schools: School[]
  filters: FindFilters
  trackOptions: string[]
  onToggleBorough: (borough: string) => void
  onToggleTrack: (track: string) => void
  onSizeChange: (size: string) => void
  onReset: () => void
  startingPoint: StartingPoint | null
  startingPointError: string
  withinMiles: number | null
  onSetStartingPoint: (input: string) => void
  onClearStartingPoint: () => void
  onWithinMilesChange: (miles: number | null) => void
}

function StartingFromField({
  startingPoint,
  startingPointError,
  withinMiles,
  onSetStartingPoint,
  onClearStartingPoint,
  onWithinMilesChange,
}: Pick<
  Props,
  'startingPoint' | 'startingPointError' | 'withinMiles' | 'onSetStartingPoint' | 'onClearStartingPoint' | 'onWithinMilesChange'
>) {
  const [input, setInput] = useState('')

  return (
    <div className="flex flex-col gap-3">
      <div className="font-mono text-[11px] tracking-[0.12em] uppercase text-faint">Starting from</div>

      {startingPoint ? (
        <div className="flex items-center justify-between gap-2">
          <span className="text-[14px] text-ink">{startingPoint.label}</span>
          <button
            type="button"
            onClick={onClearStartingPoint}
            className="text-[13px] text-accent underline underline-offset-[3px]"
          >
            Clear
          </button>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            onSetStartingPoint(input)
          }}
          className="flex flex-col gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            list={STATION_DATALIST_ID}
            placeholder="ZIP code or subway station"
            aria-label="Starting from: ZIP code or subway station"
            className="border border-border-strong px-[10px] py-[9px] text-[14px] text-ink outline-none placeholder:text-faint"
          />
          <datalist id={STATION_DATALIST_ID}>
            {suggestStationNames(input).map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <button type="submit" className="text-left text-[13px] text-accent underline underline-offset-[3px]">
            Set
          </button>
        </form>
      )}

      {startingPointError && <p className="text-[12.5px] text-red-700">{startingPointError}</p>}

      <p className="text-[12px] text-faint">
        Stays on this device — never sent to AdmitDay.
      </p>

      {startingPoint && (
        <div className="flex flex-col gap-2 pt-1">
          <div className="font-mono text-[11px] tracking-[0.12em] uppercase text-faint">Within</div>
          <SegmentedControl
            options={WITHIN_OPTIONS}
            value={withinMiles ? String(withinMiles) : ''}
            onChange={(v) => onWithinMilesChange(v ? Number(v) : null)}
          />
        </div>
      )}
    </div>
  )
}

function renderTrackButton(
  track: string,
  schools: School[],
  filters: FindFilters,
  onToggleTrack: (track: string) => void
) {
  const selected = filters.tracks.includes(track)
  const count = countMatchingTrack(schools, filters, track)
  return (
    <button
      key={track}
      type="button"
      onClick={() => onToggleTrack(track)}
      className={`flex items-center justify-between py-[9px] border-b border-rule-light text-[14px] text-left transition-colors duration-[120ms] ease-out ${
        selected ? 'text-ink' : 'text-faint'
      }`}
    >
      <span>{trackLabel(track)}</span>
      <span className={`font-mono text-[12px] ${selected ? 'text-accent' : 'text-faint'}`}>
        {selected ? `✓ ${count}` : count}
      </span>
    </button>
  )
}

export default function FindRail({
  schools,
  filters,
  trackOptions,
  onToggleBorough,
  onToggleTrack,
  onSizeChange,
  onReset,
  startingPoint,
  startingPointError,
  withinMiles,
  onSetStartingPoint,
  onClearStartingPoint,
  onWithinMilesChange,
}: Props) {
  const { main: mainTrackOptions, iep: iepTrackOptions } = splitTrackOptionsForRail(trackOptions)

  return (
    <div className="flex flex-col gap-[30px] px-7 py-8 min-[900px]:border-r min-[900px]:border-rule">
      <StartingFromField
        startingPoint={startingPoint}
        startingPointError={startingPointError}
        withinMiles={withinMiles}
        onSetStartingPoint={onSetStartingPoint}
        onClearStartingPoint={onClearStartingPoint}
        onWithinMilesChange={onWithinMilesChange}
      />

      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <div className="font-mono text-[11px] tracking-[0.12em] uppercase text-faint">Borough</div>
          {filters.boroughs.length > 0 && (
            <div className="text-[12px] text-accent">{filters.boroughs.length} selected</div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {BOROUGHS.map((borough) => (
            <Chip
              key={borough}
              variant={filters.boroughs.includes(borough) ? 'set' : 'unselected'}
              onClick={() => onToggleBorough(borough)}
            >
              {borough}
            </Chip>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="font-mono text-[11px] tracking-[0.12em] uppercase text-faint">Admissions track</div>
        <div className="flex flex-col">
          {mainTrackOptions.map((track) => renderTrackButton(track, schools, filters, onToggleTrack))}
        </div>
      </div>

      {iepTrackOptions.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="font-mono text-[11px] tracking-[0.12em] uppercase text-faint">
            Programs for students with IEPs or learning English
          </div>
          <div className="flex flex-col">
            {iepTrackOptions.map((track) => renderTrackButton(track, schools, filters, onToggleTrack))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <div className="font-mono text-[11px] tracking-[0.12em] uppercase text-faint">Size</div>
        <SegmentedControl options={SIZE_OPTIONS} value={filters.size} onChange={onSizeChange} />
      </div>

      <div className="flex flex-col gap-[10px] pt-[6px] border-t border-rule">
        <div className="text-[13px] text-faint">
          Boroughs and tracks are multi-select. Cleared filters return all {schools.length} schools.
        </div>
        <button
          type="button"
          onClick={onReset}
          className="text-left text-[13.5px] text-accent underline underline-offset-[3px]"
        >
          Reset filters
        </button>
      </div>
    </div>
  )
}
