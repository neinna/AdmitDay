import { ReactNode } from 'react'

export type NotReportedVariant = 'reported' | 'offered'

interface Props {
  variant: NotReportedVariant
  children: ReactNode
  className?: string
}

const EYEBROW_TEXT: Record<NotReportedVariant, string> = {
  reported: 'Not reported',
  offered: 'Not offered',
}

// The "absence is never an empty slot" primitive (issue #116): a mono
// eyebrow plus one sentence. `reported` is a DOE data gap ("...that is a gap
// in the DOE data, not a low result"); `offered` is a fact about the school
// (it genuinely doesn't run the thing). Never blur the two.
export default function NotReportedLine({ variant, children, className = '' }: Props) {
  return (
    <div className={`flex gap-[10px] items-baseline ${className}`}>
      <span className="font-mono text-[10.5px] tracking-[0.1em] uppercase text-faint whitespace-nowrap">
        {EYEBROW_TEXT[variant]}
      </span>
      <span className="text-[13.5px] text-muted" style={{ textWrap: 'pretty' }}>
        {children}
      </span>
    </div>
  )
}
