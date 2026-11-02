interface Props {
  label: string
  title?: string
  className?: string
}

export default function GrowthMark({ label, title, className }: Props) {
  return (
    <span title={title} className={`inline-flex items-center gap-[6px] text-[13px] text-ink-2 whitespace-nowrap ${className ?? ''}`}>
      <span aria-hidden="true" className="inline-block w-[7px] h-[7px] rounded-full bg-gem" />
      <span>{label}</span>
    </span>
  )
}
