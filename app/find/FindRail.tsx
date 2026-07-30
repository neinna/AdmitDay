'use client'

import { School } from '@/types'
import { BOROUGH_ORDER } from '@/lib/school-list-utils'
import { FindFilters, countMatchingTrack, trackLabel } from '@/lib/school-list-utils'
import { Chip, SegmentedControl } from '@/components/ui'

const BOROUGHS = Object.keys(BOROUGH_ORDER)

const SIZE_OPTIONS = [
  { label: 'Any', value: '' },
  { label: 'Small', value: 'small' },
  { label: 'Medium', value: 'medium' },
  { label: 'Large', value: 'large' },
]

interface Props {
  schools: School[]
  filters: FindFilters
  trackOptions: string[]
  onToggleBorough: (borough: string) => void
  onToggleTrack: (track: string) => void
  onSizeChange: (size: string) => void
  onReset: () => void
}

export default function FindRail({
  schools,
  filters,
  trackOptions,
  onToggleBorough,
  onToggleTrack,
  onSizeChange,
  onReset,
}: Props) {
  return (
    <div className="flex flex-col gap-[30px] px-7 py-8 min-[900px]:border-r min-[900px]:border-rule">
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
          {trackOptions.map((track) => {
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
          })}
        </div>
      </div>

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
          Reset
        </button>
      </div>
    </div>
  )
}
