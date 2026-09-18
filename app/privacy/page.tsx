import Link from 'next/link'
import Footer from '@/components/Footer'
import { Eyebrow, DefinitionRow } from '@/components/ui'

/**
 * /privacy — issue #198. Published before accounts (#179) exist, because the
 * moment they land AdmitDay stores a parent's name and email. Every claim
 * below is checked against the code as it stands today: no sub-processor is
 * named unless something in this repo actually calls it, and nothing here
 * describes a feature that hasn't shipped without saying so.
 */

const COLLECTS: { label: string; value: string }[] = [
  {
    label: 'Saved school list',
    value:
      "Held in your browser's local storage. It never reaches AdmitDay's servers — there are no accounts yet to attach it to.",
  },
  {
    label: 'Search questions',
    value:
      'What you type into Ask on /find is sent to Anthropic and OpenAI to find and describe matching schools. AdmitDay does not store it after the response is generated.',
  },
  {
    label: 'Filter selections',
    value:
      "Borough, size, academic level, and similar choices are sent with each request to generate a school's rationale text. Not stored, and not tied to your identity.",
  },
  {
    label: 'Product analytics',
    value:
      "Anonymous page views and clicks, via PostHog. Not tied to a name or email — AdmitDay doesn't identify visitors, because there's no account to identify them with yet.",
  },
  {
    label: 'Error reports',
    value:
      "Crash and exception details, via Sentry. Session recordings are masked, so on-screen text and anything you type is never captured. Error reports leave out your IP address, whether they come from AdmitDay's servers, your browser, or edge routes.",
  },
  {
    label: 'Parent name and email',
    value:
      "Not collected today. Once accounts ship, this will be collected only if you create one — to save your list across devices and sign back in.",
  },
]

const PROCESSORS: { label: string; value: string }[] = [
  { label: 'Vercel', value: 'Hosts the website and its serverless functions.' },
  {
    label: 'Vercel Postgres',
    value: 'Stores the school and program directory today; will store account records once accounts ship.',
  },
  { label: 'Anthropic', value: "Generates the answers on /find and each school's rationale text." },
  { label: 'OpenAI', value: 'Turns your search question into a vector used to find matching schools.' },
  {
    label: 'Sentry',
    value:
      'Receives error reports so bugs can get fixed. Session replay is masked. IP addresses are left out of every report, from the server, the browser, and edge routes alike.',
  },
  { label: 'PostHog', value: 'Receives anonymous usage analytics.' },
  {
    label: 'Auth provider',
    value: 'Not chosen yet. Will be named here before accounts ship, once it is.',
  },
]

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-white">
      <header className="flex items-center justify-between px-5 min-[900px]:px-9 py-[18px] border-b border-rule">
        <Link href="/" className="flex items-center gap-[9px]">
          <span className="w-[9px] h-[9px] bg-accent inline-block" />
          <div className="flex items-baseline">
            <span className="font-display font-bold text-[21px] text-ink tracking-[-0.035em]">Admit</span>
            <span className="font-wordmark italic text-[24px] text-accent ml-[3px] tracking-[-0.01em]">Day</span>
          </div>
        </Link>
        <nav className="flex items-center gap-7 text-[14.5px] text-muted">
          <Link href="/find" className="hover:text-ink transition-colors duration-[120ms] ease-out">Find</Link>
          <Link href="/my-schools" className="hover:text-ink transition-colors duration-[120ms] ease-out">My Schools</Link>
        </nav>
      </header>

      <section className="px-5 min-[900px]:px-9 pt-11 pb-[26px] border-b border-rule">
        <h1 className="font-display font-bold text-[34px] min-[700px]:text-[44px] leading-[1.02] tracking-[-0.038em] text-ink">
          Privacy
        </h1>
        <p className="text-[15.5px] text-muted mt-4 max-w-[620px]">
          What AdmitDay collects, why, who sees it, and how to have it deleted.
        </p>
        <p className="text-[13px] text-faint mt-3">Last updated September 17, 2026.</p>
      </section>

      <section className="px-5 min-[900px]:px-9 pt-[26px] pb-[30px] border-b border-rule">
        <Eyebrow>What we collect</Eyebrow>
        <p className="text-[14.5px] text-ink-2 leading-[1.55] mt-3 max-w-[680px]">
          AdmitDay doesn&rsquo;t have accounts yet, so most of the list below is either anonymous or never leaves
          your browser. That changes only where noted.
        </p>
        <div className="mt-4 flex flex-col gap-[14px]">
          {COLLECTS.map((row) => (
            <div key={row.label} className="border-b border-rule-light pb-[14px] last:border-b-0 last:pb-0">
              <DefinitionRow label={row.label} value={row.value} />
            </div>
          ))}
        </div>
      </section>

      <section className="px-5 min-[900px]:px-9 pt-[26px] pb-[30px] border-b border-rule">
        <Eyebrow>What we never collect</Eyebrow>
        <p className="text-[15px] font-semibold text-ink mt-3 max-w-[680px]">
          Anything about your child.
        </p>
        <p className="text-[14.5px] text-ink-2 leading-[1.55] mt-2 max-w-[680px]">
          No name, no grade, no date of birth, no contact details, no documents. AdmitDay works from the borough,
          preferences, and filters you set for a search — never from who your child is.
        </p>
      </section>

      <section className="px-5 min-[900px]:px-9 pt-[26px] pb-[30px] border-b border-rule">
        <Eyebrow>Who processes it</Eyebrow>
        <p className="text-[14.5px] text-ink-2 leading-[1.55] mt-3 max-w-[680px]">
          Every service below is one AdmitDay actually calls in production today, and every service AdmitDay
          calls is listed here.
        </p>
        <div className="mt-4 flex flex-col gap-[14px]">
          {PROCESSORS.map((row) => (
            <div key={row.label} className="border-b border-rule-light pb-[14px] last:border-b-0 last:pb-0">
              <DefinitionRow label={row.label} value={row.value} />
            </div>
          ))}
        </div>
      </section>

      <section className="px-5 min-[900px]:px-9 pt-[26px] pb-[30px] border-b border-rule">
        <Eyebrow>How long we keep it</Eyebrow>
        <div className="mt-3 flex flex-col gap-[10px] text-[14.5px] text-ink-2 leading-[1.55] max-w-[680px]">
          <p>The school and program directory is refreshed weekly and carries no personal information.</p>
          <p>
            Analytics events and error reports are kept for as long as our PostHog and Sentry plans retain them —
            AdmitDay has not set a shorter custom window.
          </p>
          <p>
            Search questions and filter selections are used once, to generate a response, and are not stored by
            AdmitDay afterward. Neither Anthropic nor OpenAI trains its models on API traffic by default; each
            provider&rsquo;s own terms govern how long it retains a request on its side.
          </p>
          <p>Once accounts exist, your name, email, and saved list are kept until you delete your account.</p>
        </div>
      </section>

      <section className="px-5 min-[900px]:px-9 pt-[26px] pb-[34px]">
        <Eyebrow>Deleting your data</Eyebrow>
        <div className="mt-3 flex flex-col gap-[10px] text-[14.5px] text-ink-2 leading-[1.55] max-w-[680px]">
          <p>
            Your saved school list lives only in your browser. Clearing your browser&rsquo;s site data for
            admitday.com removes it completely — AdmitDay never had a copy.
          </p>
          <p>
            Accounts don&rsquo;t exist yet. Once they do, deleting your account removes your name, email, and
            saved list from our database. Until then, or if you&rsquo;d like something removed sooner, email{' '}
            <a href="mailto:privacy@admitday.com" className="underline hover:text-ink">
              privacy@admitday.com
            </a>
            .
          </p>
        </div>
      </section>

      <Footer />
    </main>
  )
}
