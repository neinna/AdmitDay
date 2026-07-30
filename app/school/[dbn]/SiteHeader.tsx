import Link from 'next/link'

interface Props {
  addedCount: number
}

// Same header as /find ("unchanged" per the handoff), duplicated here rather
// than imported from FindClient since that header is inline JSX inside a
// large existing client component, not an exported primitive — this keeps
// #116 from having to touch #114's file. Purely presentational: the caller
// (SchoolDetailClient, not-found.tsx) owns the hydrated addedCount state, the
// same pattern FindClient itself uses, so Add/Remove updates this in the
// same tick.
export default function SiteHeader({ addedCount }: Props) {
  return (
    <header className="flex items-center justify-between px-5 min-[900px]:px-9 py-[18px] border-b border-rule">
      <div className="flex items-center gap-[9px]">
        <span className="w-[9px] h-[9px] rounded-full bg-accent" />
        <div className="flex items-baseline">
          <span className="font-display font-bold text-[21px] text-ink tracking-[-0.035em]">Admit</span>
          <span className="font-wordmark italic text-[24px] text-accent ml-[3px] tracking-[-0.01em]">
            Day
          </span>
        </div>
      </div>
      <nav className="flex items-center gap-7 text-[14.5px] text-muted">
        <Link href="/find" className="text-ink font-medium border-b-2 border-accent pb-[3px]">
          Find
        </Link>
        <Link href="/list" className="hover:text-ink transition-colors duration-[120ms] ease-out">
          My Schools
          {addedCount > 0 && <span className="font-mono text-accent ml-1">{addedCount}</span>}
        </Link>
        <Link
          href="/requirements"
          className="hover:text-ink transition-colors duration-[120ms] ease-out"
        >
          Readiness
        </Link>
      </nav>
    </header>
  )
}
