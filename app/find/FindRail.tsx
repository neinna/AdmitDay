'use client'

import { School } from '@/types'
import { BOROUGH_ORDER } from '@/lib/school-list-utils'
import {
  FindFilters,
  countMatchingTrack,
  splitTrackOptionsForRail,
  trackLabel,
} from '@/lib/school-list-utils'
import { Chip, SegmentedControl } from '@/components/ui'

const BOROUGHS = Object.keys(BOROUGH_ORDER)

const SIZE_OPTIONS = [
  { label: 'Any', value: '' },
  { label: 'Small', value: 'small' },
  { label: 'Medium', value: 'medium' },
  { label: 'Large', value: 'large' },
]

// Within radius options for issue #344 — Any plus the four fixed distances.
const RADIUS_OPTIONS = [
  { label: 'Any', value: '' },
  { label: '1 mi', value: '1' },
  { label: '3 mi', value: '3' },
  { label: '5 mi', value: '5' },
  { label: '10 mi', value: '10' },
]

interface Props {
  schools: School[]
  filters: FindFilters
  trackOptions: string[]
  startingPointInput: string
  startingPointNotFound: boolean
  startingPointSuggestions: string[]
  radiusValue: string
  radiusDisabled: boolean
  onToggleBorough: (borough: string) => void
  onToggleTrack: (track: string) => void
  onSizeChange: (size: string) => void
  onStartingPointInputChange: (value: string) => void
  onRadiusChange: (value: string) => void
  onReset: () => void
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
  startingPointInput,
  startingPointNotFound,
  startingPointSuggestions,
  radiusValue,
  radiusDisabled,
  onToggleBorough,
  onToggleTrack,
  onSizeChange,
  onStartingPointInputChange,
  onRadiusChange,
  onReset,
}: Props) {
  const { main: mainTrackOptions, iep: iepTrackOptions } = splitTrackOptionsForRail(trackOptions)

  return (
    <div className="flex flex-col gap-[30px] px-7 py-8 min-[900px]:border-r min-[900px]:border-rule">
      <div className="flex flex-col gap-3">
        <div className="font-mono text-[11px] tracking-[0.12em] uppercase text-faint">Location</div>
        <input
          type="text"
          list="starting-point-suggestions"
          value={startingPointInput}
          onChange={(e) => onStartingPointInputChange(e.target.value)}
          placeholder="ZIP code or subway station"
          aria-label="Location: ZIP code or subway station"
          className="border border-border-strong px-[13px] py-[9px] text-[14px] text-ink outline-none placeholder:text-faint bg-transparent"
        />
        <datalist id="starting-point-suggestions">
          {startingPointSuggestions.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        {startingPointNotFound && (
          <div className="text-[12.5px] text-faint">Not a NYC ZIP code or subway station</div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <div className="font-mono text-[11px] tracking-[0.12em] uppercase text-faint">Distance</div>
        <SegmentedControl options={RADIUS_OPTIONS} value={radiusValue} onChange={onRadiusChange} disabled={radiusDisabled} />
      </div>

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
