import Link from 'next/link'
import Footer from '@/components/Footer'
import AuthControls from '@/components/AuthControls'
import { getAllSchools } from '@/lib/load-schools'
import { buildLandscape, landscapeIsPublishable } from '@/lib/landscape'

/**
 * The landing page — the front door for a parent who has never heard of
 * AdmitDay, arriving from a Facebook group, a Reddit thread, or another parent.
 * Replaces the redirect that stood here after the old filter flow was retired
 * in #130.
 *
 * Written for the overwhelmed first-timer rather than the spreadsheet-building
 * researcher: it explains the process before it explains the product, and every
 * piece of vocabulary carries its meaning. One job — get them into /find with
 * enough trust to try it.
 *
 * Kept deliberately short (2026-09-18): headline, one line, one button, the
 * landscape numbers, three one-line steps, and the refusal to predict. No
 * pricing, feature list, FAQ, newsletter capture, second destination, or
 * social proof.
 *
 * The landscape numbers are derived from the school table (lib/landscape.ts),
 * never typed here.
 */

function Cta({ className = '' }: { className?: string }) {
  return (
    <Link
      href="/find"
      className={`inline-block bg-accent text-white text-[15px] font-medium px-[26px] py-[13px] hover:opacity-90 transition-opacity duration-[120ms] ease-out ${className}`}
    >
      Start with your schools
    </Link>
  )
}

export default async function Landing() {
  const schools = await getAllSchools()
  const landscape = buildLandscape(schools)
  // If the data layer degrades, render the page without the numbers rather than
  // printing zeros — the same rule the rest of the product follows.
  const showNumbers = landscapeIsPublishable(landscape)

  return (
    <main className="min-h-screen bg-white">
      {/* No active nav item: / isn't one of the app's sections. */}
      <header className="flex items-center justify-between px-5 min-[900px]:px-9 py-[18px] border-b border-rule">
        <Link href="/" aria-label="AdmitDay home" className="flex items-center gap-[9px]">
          <span className="w-[9px] h-[9px] bg-accent inline-block" />
          <div className="flex items-baseline">
            <span className="font-display font-bold text-[21px] text-ink tracking-[-0.035em]">Admit</span>
            <span className="font-wordmark italic text-[24px] text-accent ml-[3px] tracking-[-0.01em]">Day</span>
          </div>
        </Link>
        <div className="flex items-center gap-7">
          <nav className="flex items-center gap-7 text-[14.5px] text-muted">
            <Link href="/find" className="hover:text-ink transition-colors duration-[120ms] ease-out">Find</Link>
            <Link href="/shortlist" className="hover:text-ink transition-colors duration-[120ms] ease-out">Shortlist</Link>
          </nav>
          <AuthControls />
        </div>
      </header>

      <section className="grid grid-cols-1 min-[900px]:grid-cols-[1fr_300px] gap-6 min-[900px]:gap-10 items-end px-5 min-[900px]:px-9 pt-11 min-[900px]:pt-[72px] pb-9 min-[900px]:pb-14 border-b border-rule">
        <div>
          <h1 className="font-display font-bold text-[36px] min-[700px]:text-[56px] leading-[1.02] tracking-[-0.038em] text-ink max-w-[760px]">
            Every NYC public high school, in one list you can actually use
          </h1>
          <p className="text-[16px] min-[700px]:text-[17px] text-muted mt-4 min-[700px]:mt-5 max-w-[540px]">
            Filter by what matters. See what each school actually requires.
          </p>
        </div>
        <div>
          <Cta className="w-full text-center" />
        </div>
      </section>

      {showNumbers && (
        <section className="grid grid-cols-3 gap-[1px] bg-rule border-b border-rule">
          {[
            { v: landscape.programsLabel, l: 'Programs' },
            { v: landscape.schoolsLabel, l: 'Schools' },
            { v: String(landscape.methods), l: 'Ways they admit' },
          ].map((c) => (
            <div key={c.l} className="bg-surface px-5 min-[900px]:px-9 py-4 min-[900px]:py-[22px]">
              <div className="font-mono text-[22px] min-[700px]:text-[28px] font-medium tracking-[-0.02em] text-ink">{c.v}</div>
              <div className="text-[10.5px] min-[700px]:text-[11px] uppercase tracking-[0.06em] text-faint mt-1">{c.l}</div>
            </div>
          ))}
        </section>
      )}

      <section className="grid grid-cols-1 min-[900px]:grid-cols-3 gap-7 min-[900px]:gap-10 px-5 min-[900px]:px-9 py-9 min-[900px]:py-12 border-b border-rule">
        {[
          { n: '01', t: 'Set your filters', b: 'Borough, size, how a school admits.' },
          { n: '02', t: 'Describe the rest', b: 'Strong music, soccer, small classes.' },
          { n: '03', t: 'Open a school', b: 'Real requirements, linked to the official listing.' },
        ].map((s) => (
          <div key={s.n} className="grid grid-cols-[30px_1fr] min-[900px]:grid-cols-1 gap-x-4 gap-y-2">
            <span className="font-mono text-[13px] text-row-index pt-[3px] min-[900px]:pt-0">{s.n}</span>
            <div className="flex flex-col gap-1 min-[900px]:gap-2">
              <h3 className="text-[16px] min-[700px]:text-[17px] font-bold text-ink">{s.t}</h3>
              <p className="text-[14.5px] text-ink-2 leading-[1.5]">{s.b}</p>
            </div>
          </div>
        ))}
      </section>

      <section className="px-5 min-[900px]:px-9 py-7 min-[900px]:py-8">
        <p className="text-[15px] text-ink-2">We never predict admission. Every fact links to its source.</p>
      </section>

      <div className="flex flex-col min-[900px]:flex-row justify-between gap-1 px-5 min-[900px]:px-9 py-4 bg-surface-2 border-t border-rule">
        <span className="text-[13px] text-faint">
          Independent and not affiliated with, or endorsed by, the New York City Department of
          Education.
        </span>
        <span className="text-[13px] text-faint">
          Confirm every program on the official listing before you apply.
        </span>
      </div>

      <Footer />
    </main>
  )
}
