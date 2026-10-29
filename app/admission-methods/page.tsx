import type { Metadata } from 'next'
import Link from 'next/link'
import Footer from '@/components/Footer'
import AuthControls from '@/components/AuthControls'
import {
  ADMISSION_METHOD_COPY,
  admissionMethodMeaning,
  admissionMethodSlug,
  admissionMethodTerm,
} from '@/lib/school-list-utils'

export const metadata: Metadata = {
  title: 'AdmitDay: Admission methods',
}

export default function AdmissionMethodsPage() {
  return (
    <main className="min-h-screen bg-white flex flex-col">
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
            <Link href="/find" className="hover:text-ink transition-colors duration-[120ms] ease-out">Search</Link>
            <Link href="/shortlist" className="hover:text-ink transition-colors duration-[120ms] ease-out">Shortlist</Link>
          </nav>
          <AuthControls />
        </div>
      </header>

      <section className="px-5 min-[900px]:px-9 pt-11 pb-[34px]">
        <h1 className="font-display font-bold text-[34px] min-[700px]:text-[44px] leading-[1.02] tracking-[-0.038em] text-ink">
          Admission Methods
        </h1>
        <div className="mt-6 flex flex-col gap-[14px] text-[14.5px] text-ink-2 leading-[1.55] max-w-[680px]">
          {Object.keys(ADMISSION_METHOD_COPY).map((m) => (
            <section key={m} id={admissionMethodSlug(m)}>
              <h2 className="text-[15px] font-semibold text-ink">{admissionMethodTerm(m)}</h2>
              <p className="text-[14.5px] text-ink-2 leading-[1.55]">{admissionMethodMeaning(m)}</p>
            </section>
          ))}
        </div>
      </section>

      <Footer />
    </main>
  )
}
