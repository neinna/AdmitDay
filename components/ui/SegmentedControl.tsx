export interface SegmentedControlOption {
  label: string
  value: string
}

interface Props {
  options: SegmentedControlOption[]
  value: string
  onChange?: (value: string) => void
  className?: string
}

export default function SegmentedControl({ options, value, onChange, className = '' }: Props) {
  return (
    <div className={`flex border border-border font-sans ${className}`}>
      {options.map((option, i) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange?.(option.value)}
            aria-pressed={selected}
            className={`flex-1 text-center text-[13px] py-2 transition-colors duration-[120ms] ease-out ${
              i > 0 ? 'border-l border-border' : ''
            } ${selected ? 'bg-ink text-white border-ink' : 'text-ink-3'}`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
