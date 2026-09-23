import type { Metadata } from 'next'
import Link from 'next/link'
import Footer from '@/components/Footer'
import AuthControls from '@/components/AuthControls'
import { Eyebrow, DefinitionRow } from '@/components/ui'

export const metadata: Metadata = {
  title: 'Privacy · AdmitDay',
}

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
      "Saved to your account in AdmitDay's database, linked to your account ID rather than your name or email. Saving a school requires an account.",
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
      "Page views and clicks, via PostHog. Signed out, they're anonymous. Signed in, they're linked to a random account ID, never to your name or email.",
  },
  {
    label: 'Error reports',
    value:
      "Crash and exception details, via Sentry. Session recordings are masked, so on-screen text and anything you type is never captured. Error reports leave out your IP address, whether they come from AdmitDay's servers, your browser, or edge routes.",
  },
  {
    label: 'Parent name and email',
    value:
      "Collected only if you create an account: your first name, last name, and email, and either a password or your Google sign-in. Clerk stores these for AdmitDay. AdmitDay never sees your password.",
  },
  {
    label: 'IP address',
    value:
      'Used to limit how many questions one visitor can ask per minute, so the service stays up for everyone. It is stored in our database with that request counter.',
  },
]

const PROCESSORS: { label: string; value: string }[] = [
  { label: 'Vercel', value: 'Hosts the website and its serverless functions.' },
  {
    label: 'Vercel Postgres',
    value: "Stores the school and program directory, signed-in parents' saved lists, and the request counters used for rate limiting.",
  },
  { label: 'Anthropic', value: "Generates the answers on /find and each school's rationale text." },
  { label: 'OpenAI', value: 'Turns your search question into a vector used to find matching schools.' },
  {
    label: 'Sentry',
    value:
      'Receives error reports so bugs can get fixed. Session replay is masked. IP addresses are left out of every report, from the server, the browser, and edge routes alike.',
  },
  { label: 'PostHog', value: 'Receives usage analytics: anonymous when signed out, linked to a random account ID when signed in.' },
  {
    label: 'Langfuse',
    value:
      'Receives the cost, timing, and token counts of each AI request so AdmitDay can watch spend and speed. Never your question, the answer, or anything that identifies you.',
  },
  {
    label: 'Clerk',
    value:
      'Handles sign-up, sign-in, and password reset, and stores your account details (name, email, password or Google sign-in) on AdmitDay’s behalf.',
  },
  {
    label: 'Google',
    value: 'Only if you choose “Continue with Google”: confirms who you are and shares your name and email with Clerk.',
  },
]

export default function PrivacyPage() {
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
          Privacy
        </h1>
        <p className="text-[15.5px] text-muted mt-4 max-w-[620px]">
          What AdmitDay collects, why, who sees it, and how to have it deleted.
        </p>
        <p className="text-[13px] text-faint mt-3">Last updated September 18, 2026.</p>
      </section>

      <section className="px-5 min-[900px]:px-9 pt-[26px] pb-[30px] border-b border-rule">
        <Eyebrow>What we collect</Eyebrow>
        <p className="text-[14.5px] text-ink-2 leading-[1.55] mt-3 max-w-[680px]">
          Accounts are optional. Everything on AdmitDay works without one. If you create one, we collect your
          name and email, as described below.
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
          Anything about your child
        </p>
        <p className="text-[14.5px] text-ink-2 leading-[1.55] mt-2 max-w-[680px]">
          No name, no grade, no date of birth, no contact details, no documents. AdmitDay works from the borough,
          preferences, and filters you set for a search — never from who your child is.
        </p>
        <p className="text-[15px] font-semibold text-ink mt-4 max-w-[680px]">
          Where you&rsquo;re commuting from
        </p>
        <p className="text-[14.5px] text-ink-2 leading-[1.55] mt-2 max-w-[680px]">
          If you set a &ldquo;Starting from&rdquo; ZIP code or subway station on Find to see distances, it&rsquo;s
          saved only in your browser. It&rsquo;s never sent to AdmitDay&rsquo;s servers, never included in a search
          question, and never reaches PostHog, Sentry, or Langfuse. No street address is accepted.
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
          <p>Your name, email, and saved lists are kept until you delete your account.</p>
          <p>
            IP addresses used for rate limiting are deleted automatically within 24 hours.
          </p>
        </div>
      </section>

      <section className="px-5 min-[900px]:px-9 pt-[26px] pb-[34px]">
        <Eyebrow>Deleting your data</Eyebrow>
        <div className="mt-3 flex flex-col gap-[10px] text-[14.5px] text-ink-2 leading-[1.55] max-w-[680px]">
          <p>
            Your saved school list is stored with your account and deleted with it.
          </p>
          <p>
            Delete your account any time from the account menu. It removes your name, email, sign-in, and saved
            schools right away. Questions:{' '}
            <a href="mailto:admitday@longtailstudio.com" className="underline hover:text-ink">
              admitday@longtailstudio.com
            </a>
            .
          </p>
        </div>
      </section>

      <Footer />
    </main>
  )
}
