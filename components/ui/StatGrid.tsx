import { StatCell } from '@/lib/school-detail-utils'

interface Props {
  stats: StatCell[]
  noteText?: string
}

const DEFAULT_NOTE = 'DOE reported figures. We publish them as given and do not score or rank them.'

// StatGrid renders exactly the cells it's given (StatGrid itself never
// decides what's missing — lib/school-detail-utils.ts's buildStatCells does
// that) plus a fixed note cell that always occupies the final slot.
export default function StatGrid({ stats, noteText = DEFAULT_NOTE }: Props) {
  return (
    <div className="grid grid-cols-1 min-[521px]:grid-cols-2 min-[901px]:grid-cols-4 gap-px bg-rule border border-rule">
      {stats.map((stat) => (
        <div key={stat.key} className="bg-surface px-[18px] py-4 flex flex-col gap-1">
          <span className="font-mono text-[22px] min-[901px]:text-[24px] font-medium text-ink tracking-[-0.02em]">
            {stat.value}
          </span>
          <span className="text-[10.5px] tracking-[0.06em] uppercase text-faint">{stat.label}</span>
        </div>
      ))}
      <div className="col-span-full min-[901px]:col-span-1 bg-surface-2 px-[18px] py-4 flex items-end min-[901px]:items-end">
        <span className="text-[12.5px] text-faint leading-[1.45]" style={{ textWrap: 'pretty' }}>
          {noteText}
        </span>
      </div>
    </div>
  )
}
