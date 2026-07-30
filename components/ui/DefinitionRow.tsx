interface Props {
  label: string
  value: string
  mono?: boolean
  /** 152px in the main-column requirements blocks (default), 92px in the narrower rail sections. */
  labelWidth?: 92 | 152
  className?: string
}

const GRID_COLS: Record<92 | 152, string> = {
  92: 'min-[900px]:grid-cols-[92px_1fr]',
  152: 'min-[900px]:grid-cols-[152px_1fr]',
}

// 152px (or 92px in the rail) / 1fr label-value pair used by "What's required
// to apply", Getting there, and Provenance. Collapses to stacked
// label-over-value on mobile per the handoff's responsive rules.
export default function DefinitionRow({ label, value, mono = false, labelWidth = 152, className = '' }: Props) {
  return (
    <div
      className={`grid grid-cols-1 ${GRID_COLS[labelWidth]} gap-[2px] min-[900px]:gap-[14px] text-[14.5px] ${className}`}
    >
      <span className="text-faint">{label}</span>
      <span className={`text-ink-2 ${mono ? 'font-mono text-[13.5px]' : ''}`} style={{ textWrap: 'pretty' }}>
        {value}
      </span>
    </div>
  )
}
