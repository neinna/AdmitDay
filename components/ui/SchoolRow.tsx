import { ReactNode } from 'react'

interface Props {
  rowNumber: number
  name: string
  isHiddenGem?: boolean
  metadata: string
  rationale: string
  statValue: string | number
  statLabel: string
  action: ReactNode
}

export default function SchoolRow({
  rowNumber,
  name,
  isHiddenGem = false,
  metadata,
  rationale,
  statValue,
  statLabel,
  action,
}: Props) {
  return (
    <div
      className="grid grid-cols-1 min-[900px]:grid-cols-[34px_1fr_128px_96px] gap-4 items-start px-9 py-[22px] border-b border-rule-light hover:bg-surface-2 transition-colors duration-[120ms] ease-out"
    >
      <div className="hidden min-[900px]:block font-mono text-[13px] text-row-index pt-[5px]">
        {String(rowNumber).padStart(2, '0')}
      </div>

      <div className="flex flex-col gap-[5px] order-1 min-[900px]:order-none">
        <div className="flex items-center gap-2.5">
          <div className="font-sans font-bold text-[18px] text-ink">{name}</div>
          {isHiddenGem && (
            <span className="font-mono text-[10.5px] tracking-[0.08em] uppercase text-gem bg-gem-bg border border-gem-border px-[7px] py-[3px]">
              Hidden gem
            </span>
          )}
        </div>
        <div className="font-sans text-[13.5px] text-faint">{metadata}</div>
        <div className="font-sans text-[14.5px] leading-[1.5] text-ink-2 max-w-[430px]" style={{ textWrap: 'pretty' }}>
          {rationale}
        </div>
      </div>

      <div className="flex flex-col gap-[3px] order-2 min-[900px]:order-none">
        <div className="font-mono text-[18px] text-ink">{statValue}</div>
        <div className="font-mono text-[11.5px] tracking-[0.06em] uppercase text-faint">{statLabel}</div>
      </div>

      <div className="order-3 min-[900px]:order-none max-[899px]:w-full">{action}</div>
    </div>
  )
}
