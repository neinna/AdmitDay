import { StatCell } from '@/lib/school-detail-utils'
import MissingMark from './MissingMark'

interface Props {
  stats: StatCell[]
}

// StatGrid renders exactly the cells it's given (StatGrid itself never
// decides what's missing — lib/school-detail-utils.ts's buildStatCells does
// that).
export default function StatGrid({ stats }: Props) {
  return (
    <div className="grid grid-cols-2 min-[521px]:grid-cols-4 min-[901px]:grid-cols-7 gap-px bg-rule border border-rule">
      {stats.map((stat) => (
        <div key={stat.key} className="bg-surface px-[14px] py-3 flex flex-col gap-1">
          {stat.missing ? (
            <MissingMark kind="not_reported" className="text-[20px]" />
          ) : (
            <span
              className="font-mono text-[20px] font-medium text-ink tracking-[-0.02em]"
              title={stat.title}
              aria-label={stat.title}
            >
              {stat.value}
            </span>
          )}
          <span className="text-[10.5px] tracking-[0.06em] uppercase text-faint">{stat.label}</span>
        </div>
      ))}
    </div>
  )
}
