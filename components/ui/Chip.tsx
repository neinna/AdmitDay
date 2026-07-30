import { ReactNode } from 'react'

export type ChipVariant = 'set' | 'inferred' | 'unselected' | 'add'

interface Props {
  variant: ChipVariant
  children: ReactNode
  onClick?: () => void
  className?: string
}

const BASE = 'inline-flex items-center font-sans text-[13.5px] px-[13px] py-[7px] leading-none'

const VARIANT_CLASSES: Record<ChipVariant, string> = {
  set: 'bg-ink border border-ink text-white',
  inferred: 'bg-accent-bg border border-accent-border text-accent',
  unselected: 'bg-transparent border border-border text-ink-3',
  add: 'bg-transparent border border-dashed border-border-strong text-muted',
}

export default function Chip({ variant, children, onClick, className = '' }: Props) {
  return (
    <span
      onClick={onClick}
      className={`${BASE} ${VARIANT_CLASSES[variant]} ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
      {children}
      {variant === 'set' && <span className="ml-1.5">✓</span>}
      {variant === 'inferred' && <span className="ml-1.5">×</span>}
    </span>
  )
}
