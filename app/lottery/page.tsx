import type { Metadata } from 'next'
import Link from 'next/link'
import Footer from '@/components/Footer'
import AuthControls from '@/components/AuthControls'
import SiteNav from '@/components/SiteNav'
import LotteryDecoder from './LotteryDecoder'

export const metadata: Metadata = {
  title: 'AdmitDay: Lottery number',
  description: 'Read your NYC high school admissions lottery number. Runs in your browser; never sent or saved.',
}

export default function LotteryPage() {
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
          <SiteNav />
          <AuthControls />
        </div>
      </header>

      <section className="px-5 min-[900px]:px-9 pt-11 pb-[34px] flex-1">
        <h1 className="font-display font-bold text-[34px] min-[700px]:text-[44px] leading-[1.02] tracking-[-0.038em] text-ink">
          Lottery number
        </h1>
        <p className="text-[15.5px] text-muted mt-4 mb-8 max-w-[620px]">Paste it to see where it sits.</p>
        <LotteryDecoder />
      </section>

      <Footer />
    </main>
  )
}
