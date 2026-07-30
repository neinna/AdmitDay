import { ReactNode } from 'react'

interface Props {
  children: ReactNode
  className?: string
}

// Section eyebrow used throughout /school/[dbn] (issue #116) — mono, 11px,
// uppercase, wide tracking, faint. Same job as the eyebrow rows already
// hand-rolled in app/find/FindRail.tsx, just factored into a primitive since
// this screen reuses it for every section label.
export default function Eyebrow({ children, className = '' }: Props) {
  return (
    <div className={`font-mono text-[11px] tracking-[0.12em] uppercase text-faint ${className}`}>
      {children}
    </div>
  )
}
