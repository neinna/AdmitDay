export type MissingKind = 'not_reported' | 'not_offered'

const TEXT: Record<MissingKind, string> = {
  not_reported: 'n/a',
  not_offered: 'none',
}

const CLASS_NAME: Record<MissingKind, string> = {
  not_reported: 'font-mono text-faint',
  not_offered: 'font-mono text-muted',
}

const TOOLTIP: Record<MissingKind, string> = {
  not_reported: "The DOE didn't publish this.",
  not_offered: "This school doesn't offer it.",
}

interface Props {
  kind: MissingKind
  className?: string
}

export default function MissingMark({ kind, className = '' }: Props) {
  return (
    <span className={`${CLASS_NAME[kind]} ${className}`} title={TOOLTIP[kind]} aria-label={TOOLTIP[kind]}>
      {TEXT[kind]}
    </span>
  )
}
