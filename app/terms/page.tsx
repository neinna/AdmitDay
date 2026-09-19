import type { Metadata } from 'next'
import Link from 'next/link'
import Footer from '@/components/Footer'
import AuthControls from '@/components/AuthControls'
import { Eyebrow } from '@/components/ui'

export const metadata: Metadata = {
  title: 'Terms · AdmitDay',
}

/**
 * /terms — issue #198. FR-6.3 says the legal disclaimer belongs in the terms
 * a family accepts, not in on-screen chrome. This is that document: the
 * product policy that already governs AdmitDay (no predictions, no DOE
 * affiliation, confirm everything in MySchools), written down in one place
 * rather than restated on every screen.
 */

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-white">
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

      <section className="px-5 min-[900px]:px-9 pt-11 pb-[26px] border-b border-rule">
        <h1 className="font-display font-bold text-[34px] min-[700px]:text-[44px] leading-[1.02] tracking-[-0.038em] text-ink">
          Terms
        </h1>
        <p className="text-[15.5px] text-muted mt-4 max-w-[620px]">
          What AdmitDay is, and what it isn&rsquo;t.
        </p>
        <p className="text-[13px] text-faint mt-3">Last updated September 17, 2026.</p>
      </section>

      <section className="px-5 min-[900px]:px-9 pt-[26px] pb-[30px] border-b border-rule">
        <Eyebrow>What this is</Eyebrow>
        <p className="text-[14.5px] text-ink-2 leading-[1.55] mt-3 max-w-[680px]">
          AdmitDay organizes and helps you navigate the New York City Department of Education&rsquo;s own public
          information about its high schools and programs — what each one offers, how it admits, and what
          applying to it actually requires.
        </p>
      </section>

      <section className="px-5 min-[900px]:px-9 pt-[26px] pb-[30px] border-b border-rule">
        <Eyebrow>What this is not</Eyebrow>
        <div className="mt-3 flex flex-col gap-[14px] max-w-[680px]">
          <div>
            <p className="text-[15px] font-semibold text-ink">Not a predictor</p>
            <p className="text-[14.5px] text-ink-2 leading-[1.55] mt-1">
              AdmitDay does not estimate, score, or predict whether your child will be admitted to any school or
              program. There is no reach, target, or likely label anywhere in the product, and there will not be.
            </p>
          </div>
          <div>
            <p className="text-[15px] font-semibold text-ink">Not affiliated with the DOE</p>
            <p className="text-[14.5px] text-ink-2 leading-[1.55] mt-1">
              AdmitDay is an independent project. It is not affiliated with, sponsored by, or endorsed by the New
              York City Department of Education.
            </p>
          </div>
        </div>
      </section>

      <section className="px-5 min-[900px]:px-9 pt-[26px] pb-[34px]">
        <Eyebrow>Confirm everything yourself</Eyebrow>
        <div className="mt-3 flex flex-col gap-[10px] text-[14.5px] text-ink-2 leading-[1.55] max-w-[680px]">
          <p>
            Every requirement, deadline, and figure shown on AdmitDay is sourced from public DOE channels —
            the DOE&rsquo;s school directory and MySchools. Confirm every requirement and deadline that matters
            to your family directly in{' '}
            <a
              href="https://www.myschools.nyc"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-ink"
            >
              MySchools
            </a>{' '}
            before you rely on it or apply. AdmitDay&rsquo;s copy is not authoritative and is not a substitute for
            the official listing.
          </p>
          <p>DOE data changes between AdmitDay&rsquo;s refreshes, so what you see here can be out of date.</p>
        </div>
      </section>

      <Footer />
    </main>
  )
}
