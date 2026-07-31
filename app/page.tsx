import Link from 'next/link'
import Footer from '@/components/Footer'
import { getAllSchools } from '@/lib/load-schools'
import { buildLandscape, landscapeIsPublishable } from '@/lib/landscape'
import { Eyebrow, DefinitionRow } from '@/components/ui'

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
 * Deliberately absent: pricing, a feature list, an FAQ, newsletter capture, a
 * second destination, and any social proof. There are no users yet, so the only
 * honest trust signals are checkable properties of the product itself — which is
 * why the trust section is made of claims you can verify on the very next
 * screen, and why the refusal to predict gets its own block.
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
        <div className="flex items-center gap-[9px]">
          <span className="w-[9px] h-[9px] bg-accent inline-block" />
          <div className="flex items-baseline">
            <span className="font-display font-bold text-[21px] text-ink tracking-[-0.035em]">Admit</span>
            <span className="font-wordmark italic text-[24px] text-accent ml-[3px] tracking-[-0.01em]">Day</span>
          </div>
        </div>
        <nav className="flex items-center gap-7 text-[14.5px] text-muted">
          <Link href="/find" className="hover:text-ink transition-colors duration-[120ms] ease-out">Find</Link>
          <Link href="/my-schools" className="hover:text-ink transition-colors duration-[120ms] ease-out">My Schools</Link>
        </nav>
      </header>

      <section className="grid grid-cols-1 min-[900px]:grid-cols-[1fr_300px] gap-6 min-[900px]:gap-10 items-end px-5 min-[900px]:px-9 pt-11 pb-[34px] border-b border-rule">
        <div>
          <h1 className="font-display font-bold text-[34px] min-[700px]:text-[44px] leading-[1.02] tracking-[-0.038em] text-ink max-w-[700px]">
            Every NYC high school, in one list you can actually use.
          </h1>
          <p className="text-[15.5px] text-muted mt-4 max-w-[560px]">
            Set what matters — borough, size, how a school admits — or just describe what
            you&rsquo;re looking for. You get a ranked shortlist with what each school actually
            requires, built from the DOE&rsquo;s own directory.
          </p>
        </div>
        <div>
          <Cta />
          <p className="text-[13px] text-faint mt-[10px]">Free. No account, no email.</p>
        </div>
      </section>

      <section className="px-5 min-[900px]:px-9 pt-[26px] pb-[30px] border-b border-rule">
        <Eyebrow>What you&rsquo;re actually up against</Eyebrow>
        {showNumbers && (
          <div className="grid grid-cols-2 min-[700px]:grid-cols-4 gap-[1px] bg-rule border border-rule mt-3">
            {[
              { v: landscape.programsLabel, l: 'Programs' },
              { v: landscape.schoolsLabel, l: 'Schools' },
              { v: String(landscape.methods), l: 'Ways they admit' },
            ].map((c) => (
              <div key={c.l} className="bg-surface px-[18px] py-4">
                <div className="font-mono text-[24px] font-medium tracking-[-0.02em] text-ink">{c.v}</div>
                <div className="text-[10.5px] uppercase tracking-[0.06em] text-faint mt-1">{c.l}</div>
              </div>
            ))}
            <div className="bg-surface-2 px-[18px] py-4">
              <p className="text-[12.5px] text-faint leading-[1.5]">
                Counted from the DOE directory we build on. Not an estimate.
              </p>
            </div>
          </div>
        )}
        <div className="grid grid-cols-1 min-[700px]:grid-cols-2 gap-7 mt-6 text-[14.5px] text-ink-2 leading-[1.55]">
          <p>
            A single school can admit several different ways at once — one program screens on
            grades, another holds an audition, a third takes anyone who applies. Two programs at the
            same address can have completely different requirements.
          </p>
          <p>
            None of this is secret. It&rsquo;s just scattered across PDFs, a portal, and parent
            Facebook threads — which means the families with the most time and the best contacts end
            up with the best lists.
          </p>
        </div>
      </section>

      <section className="px-5 min-[900px]:px-9 pt-[26px] pb-[30px] border-b border-rule">
        <Eyebrow>How it works</Eyebrow>
        <div className="mt-3">
          {[
            {
              n: '01',
              t: 'Set your guardrails',
              b: 'Borough, school size, how a school admits. These are hard filters — a school that doesn’t match is left out, so the list stays yours.',
            },
            {
              n: '02',
              t: 'Say the rest in your own words',
              b: 'A strong music program, soccer, small classes. What you type never removes a school — it moves the ones that fit up the list.',
            },
            {
              n: '03',
              t: 'Open a school and see the real thing',
              b: 'Programs, what applying actually requires, sports and courses, how many applied per seat — each with a link to the official listing.',
            },
          ].map((s, i, arr) => (
            <div
              key={s.n}
              className={`grid grid-cols-[34px_1fr] min-[900px]:grid-cols-[34px_300px_1fr] gap-4 py-4 ${
                i < arr.length - 1 ? 'border-b border-rule-light' : ''
              }`}
            >
              <span className="font-mono text-[13px] text-[#B8B8B4] pt-1">{s.n}</span>
              <h3 className="text-[18px] font-bold text-ink">{s.t}</h3>
              <p className="text-[14.5px] text-ink-2 max-w-[560px] col-start-2 min-[900px]:col-start-3">
                {s.b}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-1 min-[900px]:grid-cols-[1fr_316px]">
        <div className="px-5 min-[900px]:px-9 pt-[26px] pb-7 min-[900px]:border-r border-rule">
          <Eyebrow>Why you can check us</Eyebrow>
          <div className="mt-3">
            <div className="border-b border-rule-light py-4">
              <DefinitionRow label="Every number" value="Is a figure the DOE published. We don’t compute our own." />
            </div>
            <div className="border-b border-rule-light py-4">
              <DefinitionRow
                label="Every requirement"
                value="Links out to the official listing, so you can confirm it before you apply."
              />
            </div>
            <div className="py-4">
              <DefinitionRow
                label="Missing data"
                value="Is said in words, never shown as a zero or a dash. A gap in the source is not a low score."
              />
            </div>
          </div>

          <div className="bg-surface-2 border border-rule px-5 py-[18px] mt-5">
            <Eyebrow>And what it will never do</Eyebrow>
            <p className="text-[15px] font-semibold text-ink mt-2">{'No chance of admission. No reach, target or likely. No score or rating of any kind.'}</p>
            <p className="text-[14.5px] text-muted mt-2 leading-[1.55]">
              Other tools will give you a number. We won&rsquo;t, because the inputs aren&rsquo;t
              public — and a confident-looking estimate is how families talk themselves out of
              applying somewhere they should have ranked.
            </p>
          </div>
        </div>

        <aside className="px-5 min-[900px]:px-7 py-[26px] border-t min-[900px]:border-t-0 border-rule">
          <Eyebrow>Where the data comes from</Eyebrow>
          <div className="mt-2 flex flex-col gap-[10px]">
            <DefinitionRow labelWidth={92} label="Source" value="NYC DOE school directory" />
            <DefinitionRow labelWidth={92} label="Also" value="NYC-SIFT, for school-level statistics" />
          </div>
          <p className="text-[13px] text-faint mt-4 pt-4 border-t border-rule-light leading-[1.5]">
            Some DOE figures are older than the current cycle. Those are labelled with their own date
            wherever they appear.
          </p>

          <div className="mt-6 pt-6 border-t border-rule">
            <Eyebrow>Who made this</Eyebrow>
            <p className="text-[14.5px] text-ink-2 leading-[1.6] mt-2">
              I went through this with my own kid. I read the PDFs, kept the spreadsheet, and still
              missed things — not because the information was hidden, but because it was everywhere.
            </p>
            <p className="text-[14.5px] text-ink-2 leading-[1.6] mt-3">
              So I built the tool I wanted: one list, real requirements, and a link to the source for
              every claim.
            </p>
            <p className="text-[13px] text-faint mt-3">— A public school parent in Brooklyn</p>
          </div>
        </aside>
      </section>

      <section className="grid grid-cols-1 min-[900px]:grid-cols-[1fr_300px] gap-6 items-end px-5 min-[900px]:px-9 pt-[30px] pb-8 border-t border-rule">
        <div>
          <p className="font-display font-bold text-[26px] tracking-[-0.03em] text-ink">
            You don&rsquo;t have to know the vocabulary to start.
          </p>
          <p className="text-[14.5px] text-muted mt-2 max-w-[560px]">
            Pick a borough. Everything else can come later, and nothing you do here is final.
          </p>
        </div>
        <div>
          <Cta />
          <p className="text-[13px] text-faint mt-[10px]">
            Free while it&rsquo;s being built. More is coming.
          </p>
        </div>
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
