interface Props {
  value: string | number
  label: string
  className?: string
}

export default function StatBlock({ value, label, className = '' }: Props) {
  return (
    <div className={`flex flex-col gap-[3px] ${className}`}>
      <div className="font-mono text-[16px] text-ink">{value}</div>
      <div className="font-mono text-[10.5px] tracking-[0.06em] uppercase text-faint">{label}</div>
    </div>
  )
}
