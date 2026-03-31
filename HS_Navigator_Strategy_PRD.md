# HS Navigator: Strategy + PRD

**Author:** Inna Raykhman **Date:** March 25, 2026 **Status:** V1 build-ready draft

---

## Executive Summary

The high school choice process in NYC is structurally complex: families choose among 700+ programs across 400+ high schools, spanning multiple admissions methods (open, zoned, screened, Educational Option, auditions, plus a separate specialized high school pathway). The main application cycle opens October 7, 2025, closes December 3, 2025, and offers are released March 5, 2026.

Two recent platform and policy changes increase both the opportunity and the trust bar for an AI product:

1. Applicants can now rank more than 12 programs, while still being encouraged to include at least 12 strong options.
2. The district introduced an offer-chances prediction feature that uses key admissions variables (priorities, seat counts, applicant groupings, random numbers, and SWD/general-ed seat category).

---

## TAM

Approximately 80,000 applicants participate in the high school match each year. Willingness-to-pay signals are strong: paid memberships, hourly consulting, and test-prep packages routinely sit in the hundreds to thousands of dollars.

### Realistic ARR Estimates

Not all 80,000 families are the target market. NYC's student population skews lower income than the segments this product serves. Approximately 15-20% of applicant families fit the "educated or affluent, willing to pay for tools" profile, giving an addressable market of roughly 12,000-16,000 families per year.

| Scenario | Free signups | Paid conversion | Avg price | Year 1 ARR |
|---|---|---|---|---|
| Conservative | 500 | 4% (20 users) | $75 | ~$1,500 |
| Base | 1,500 | 6% (90 users) | $75 | ~$6,750 |
| Optimistic | 3,000 | 8% (240 users) | $99 | ~$24,000 |

These are year one estimates for a new product with no marketing budget beyond organic community channels. The seasonal concentration (Oct-Dec peak) means most revenue lands in a 10-week window.

**Projected monthly growth (base case, Oct launch):**

| Month | Cumulative free users | Cumulative paid | Notes |
|---|---|---|---|
| Sep (pre-launch) | 0 | 0 | Waitlist only |
| Oct | 200 | 8 | Application opens, peak demand starts |
| Nov | 600 | 30 | Peak window |
| Dec | 900 | 50 | Application closes Dec 3 |
| Jan-Feb | 950 | 52 | Near-zero new demand |
| Mar | 1,100 | 65 | Offers released, secondary spike |
| Apr-Aug | 1,300 | 75 | Slow growth, next cycle prep begins |
| Sep Y2 | 2,000 | 120 | Word of mouth + SEO compound |

### Future Revenue Streams

The core navigation tool is the wedge. Additional revenue layers as trust is established:

1. **Tutor/counselor marketplace:** connect families with vetted admissions consultants and SHSAT tutors. Take a referral fee or subscription from service providers. Natural fit given families already spending $440-$2,500 on consultants.
2. **Access to crowdsourced survey data:** license or integrate Amelie Marian-style lottery cutoff data as a premium feature. Families pay for historical RAN cutoffs per school.
3. **SHSAT prep integration:** white-label or partner with an existing provider rather than build from scratch. Revenue share model.
4. **Portfolio/essay evaluation:** AI-assisted review of audition essays and portfolio pieces against school-specific rubrics. High WTP from audition families. Later-stage feature requiring careful accuracy controls.
5. **Expansion to other districts:** once the NYC workflow is proven, the same model applies to other large cities with complex admissions (Boston, Chicago, LA).

None of these are V1 scope. They are called out here to frame the long-term opportunity and inform which features build the right foundation now.

---

## Strategy

Build a workflow product that:

1. Interviews the user to define their guardrails and generates these as a standalone artifact.
2. Helps families build a balanced ranked list based on those guardrails.
3. Builds a personalized checklist and timeline.
4. Provides evidence-linked answers with clear provenance to reduce error and liability.

This aligns with how the match actually works (rules + constraints + deadlines) and avoids competing head-on with the official prediction feature.

### Positioning

The wedge is not "AI." The wedge is: **"I know exactly how complicated this process is. I built this tool for myself. I will not let you miss anything, and I will show you exactly where every rule came from."**

Message: *Built by a parent, for a constantly evolving landscape.*

---

## Disclaimer Policy

The following disclaimer must appear persistently on every screen in V1, and in full on the About page:

> **HS Navigator is a navigation and organization tool. It does not predict outcomes, recommend schools, or guarantee admissions offers. Even the NYC DOE's own offer-chances prediction tool is based on historical data and cannot guarantee results. Always verify all requirements, deadlines, and program details in the [official MySchools portal](https://www.myschools.nyc). HS Navigator is not affiliated with the NYC Department of Education.**

The link to MySchools must be live and explicit wherever deadlines or requirements are shown. This is both a legal protection and a trust signal: showing families exactly where the official source is reinforces the product's positioning rather than undermining it.

---

## Assumptions

1. B2C navigation assistant optimized for affluent and educated families, focused on grade 8 to 9 admissions in NYC's public system, with optional spillover to private/parochial families applying into public options.
2. The system explicitly references borough priorities and zoned programs (zoned high schools exist in the Bronx, Queens, Staten Island, and Brooklyn; not in Manhattan).
3. V1 includes public, arts, and specialized (SHSAT) pathways. Charter, religious, and private schools are excluded.
4. The tool is navigation and organization only. It does not make recommendations or predict outcomes. Even the DOE's own prediction score is unreliable; there are no guarantees.

---

## Segments and Personas

| Segment | Pain intensity | Primary acquisition channel |
|---|---|---|
| Affluent + time-starved optimizers | 5 - highest urgency, lowest time budget | Facebook parent groups; paid newsletter ads; SEO |
| Educated + budget-conscious power researchers | 4 - high urgency; want better tools | Reddit NYC parenting threads; SEO; community word of mouth |
| Selective-test maximizers | 5 - acute anxiety around SHSAT and backup list | Test prep vendor partnerships; SHSAT SEO; forums |
| New-to-the-city navigators | 5 - disoriented; no local network | SEO explainer content; newcomer Facebook groups; school counselor referrals |
| Private/parochial to public switchers | 3 - moderate; need public system orientation | School counselor partnerships; private school parent networks; SEO |

Full segment detail is in the accompanying Client Segments spreadsheet.

---

## Jobs to Be Done and Core Problems

A navigation product succeeds when it supports what families actually have to do, not just what they want to know.

1. **Build a real list:** Families are explicitly encouraged to apply to 12 or more options they would attend. No one can guarantee a first-choice offer.
2. **Translate admissions mechanics into personal eligibility:** The system uses different methods (open, screened, Educational Option, zoned priority, auditions, special language screening), each with different rules, evidence needs, and timelines.
3. **Plan and execute requirements without missing deadlines:** Many programs require additional materials (essays, interviews, assessments, auditions uploaded during the application window).
4. **Reduce uncertainty:** Random numbers function as tie-breakers. Families want interpretability ("what does this mean for us?").

---

## AI Use Cases

- Summarizing program requirements
- Generating checklists
- Explaining admissions methods in plain language
- Helping families articulate constraints (commute, interests)
- Producing candidate lists with citations
- Content organization

---

## Competitive Landscape

Full detail is in the accompanying Competition spreadsheet. Summary of gaps:

**Trust + auditability gap:** Most substitutes either provide official facts without personalized synthesis, or sell synthesis without verifiable source linking. An AI product wins by making every output traceable to official or clearly labeled sources.

**Workflow gap:** Families are effectively project-managing multi-track requirements (main app + auditions + assessments + SHSAT logistics). An integrated admissions workflow for families is not owned by any single competitor, including NYC-SIFT (the closest free alternative), which has no checklist, no requirements tracking, and no deadline management.

---

## Pricing

### WTP Signals from Market

- Paid membership: ~$200/season (High School 411)
- Consulting: $440-$2,500 per engagement
- Test prep: $595-$4,750 per course or camp

### Recommended Pricing Model

**Freemium (recommended anchor):**
- Free tier: generates a tailored 12-school list, all data lives in the app.

**Paid tier ($49-$149 season pass OR $15-$30/month Oct-Mar):**
- Guardrails document (downloadable as .pdf or .md)
- Tailored school list up to 30 schools
- Requirements map per program
- Shared task/calendar system across family members
- Proactive email reminders (one week before and one day before deadlines)

### WTP by Segment

- Affluent optimizers: will pay most for speed + structure + reduced cognitive load.
- Educated researchers: will pay when the product provides superior evidence and organization relative to free sources.
- Selective-test maximizers: WTP is high but already spending on prep; navigator should integrate test/audition planning rather than compete with prep instruction.

---

## Market Shifts

- **Ranking rules expanded:** Families can now apply to more than 12 schools.
- **Offer-chances prediction** was introduced inside the official portal, raising UX expectations for third-party tools.
- **Screened admissions changed for fall 2026:** Screened programs will admit top-performing applicants across each middle school and citywide.
- **SHSAT went digital** starting fall 2025 and is moving into a new format model.
- **NYC DOE released official AI guidance** in March 2026, emphasizing responsible use.
- **Federal student privacy frameworks** (FERPA) and state privacy law (Education Law section 2-d) increase risk of collecting student-identifiable information without controls.

---

## Seasonality

| Month | Demand intensity (0-5) | Key activity |
|---|---|---|
| Jun-Jul | 1 | Early research |
| Aug | 2 | Research ramps |
| Sep | 3 | Open houses begin |
| Oct | 5 | Application opens (Oct 7); SHSAT registration closes (Oct 31) |
| Nov | 5 | Application window peak |
| Dec | 4 | Application closes (Dec 3) |
| Jan-Feb | 2 | Waiting period |
| Mar | 5 | Offers released (Mar 5) |

---

## Open Questions to Resolve Before Building

These must be answered before a developer starts V1:

1. **Data source:** Where does school data come from? Options are DOE InfoHub, MySchools directory, manual curation from official PDFs, or a combination. This is a blocking decision because the accuracy guarantee depends on it.
2. **Session and state model:** No accounts for V1, but the 7-day retention metric requires remembering a user's list between visits. Decide: cookie, localStorage, or anonymous server-side session.
3. **Academic level definitions:** The input screen uses low/medium/high. These need to be defined in terms of grade averages that map to screened group eligibility before the matching logic can be built.
4. **Error and fallback states:** What happens if a borough + interest combo generates fewer than 12 schools? Define the fallback.
5. **Support ticket spec:** Confirm the email address for support tickets and the fields on the form (issue type, description, contact email).
6. **Hosting and stack:** Document the deployment target before build starts.
7. **Privacy posture for V1:** Confirm whether any data is persisted server-side and document the scope of FERPA/Ed Law 2-d compliance for V1.

---

## V1 Scope (Build in 3-5 days)

V1 is a lightweight workflow prototype validating one core question: can users input constraints and generate a usable 12+ school list?

### Inputs (Screen 1)

- Borough of residence
- Commute preference (short / flexible)
- Interests: STEM, arts, languages, other (checkboxes)
- SHSAT: yes / no
- Auditions: yes / no
- Academic level: low / medium / high
- IEP or GenEd
- School size preference: small / medium / large

### Outputs (Screen 2: List)

- 12-15 schools
- Each school shows: name, 1-2 line rationale, admissions type, key requirement if any
- Freemium: list capped at 12, all data in-app only
- Paid: list up to 30, downloadable as .pdf or .md

### Outputs (Screen 3: Requirements View)

Grouped by type:

- SHSAT: register by Oct 31; exam is now digital; prep timeline
- Auditions: prepare portfolio/materials; upload during application window (Oct 7 - Dec 3)
- Screened programs: submit required essays/assessments; new fall 2026 rule admits top performers per middle school and citywide

### Explicitly Out of Scope for V1

- Per-school detailed requirements breakdown
- Exact per-program deadlines
- Offer probability modeling
- Accounts, payments, push notifications
- Full database coverage of all 700+ programs

### Accuracy and Verification (Non-negotiable)

- Retrieval-first: default to "show the source" behavior; treat the model as a compiler of cited statements, not an oracle.
- Explicit freshness checks: display "last verified" and link to the official page for anything deadline-related.
- Clear disclaimers: "not affiliated with the district; confirm in the official portal."
- Hallucination mitigations must be baked into KPIs and verified automatically via unit tests or equivalent tooling.

### Support

V1 includes a simple support ticket interface: a form with issue type and description fields that emails the founder directly.

### Technical Notes

- Web app only (no mobile app store submissions for V1).
- PII must be kept minimal: no names or other sensitive identifiers collected.
- Security must be designed in from day one; a security audit is planned post-launch.

---

## V1 Success Metrics

| Metric | Target |
|---|---|
| Activation: % of users who generate a 12+ school list | 30-40% of signups |
| Engagement: % of users who view 3+ schools | Baseline TBD |
| Engagement: % who interact with requirements section | Baseline TBD |
| Trust: % who click a source link | Baseline TBD |
| Trust: wrong requirement/date reports | Less than 2% of users |
| Retention: return within 7 days | Baseline TBD |
| Weekly retention Oct-Nov cohort | 20% or higher |

*Targets marked "Baseline TBD" should be set after first 100 users.*

---

## GTM: Validation Plan (48-90 Hours)

Goal: validate that users will trust the product, share inputs, and pay for workflow help. Do not build full software first.

**Day 0 setup (2-6 hours):**
- One-page landing page with the promise, mock flows, and a "Get your plan" CTA.
- Concierge MVP: a form + templated output doc with ranked-list draft, tasks by category, and citations to official sources.

**User acquisition (same day):**
- Post 3-5 targeted asks in high-intent communities (parents of 7th/8th graders, arts audition families, screened applicants).
- Screener: grade, borough, SHSAT/auditions, biggest fear.
- Offer first 10 families a free list + checklist in 24 hours in exchange for a 20-minute interview.

**Core experiments:**
- Trust experiment: deliver AI-style narrative vs. checklist with citations. Measure which version gets "yes, I would use/pay."
- WTP experiment: after delivering value, ask for payment at $49/$99/$199. Observe conversion.
- Retention experiment: send a 3-message October sprint sequence and measure re-engagement.

**Success criteria:**
- First 10 users: at least 6 complete intake + schedule a debrief; at least 3 ask for ongoing help.
- First 50-100 users: at least 10-20% convert to email list; at least 3-5% pay a starter tier.

---

## Distribution Channels

1. Facebook parent groups (neighborhood groups, grade cohorts, PTA-adjacent groups): fastest route to first 10-100 users.
2. Reddit (NYC parenting and admissions threads): early problem-language and objection discovery.
3. Micro-workshops (Zoom or in-person): "Build your 12+ list in 60 minutes," timed to October-November.
4. Partnerships: tutoring/test-prep vendors, school counselors, community orgs that publish application resource pages.
5. Content SEO: admissions method explainers, screened group rules, audition upload checklists.

---

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Accuracy and hallucinations: wrong requirements or dates harms families and destroys trust | Retrieval-first answers; citations; explicit uncertainty; "verify in official portal" UX; automated tests |
| Liability: "predicting outcomes" could be construed as guaranteeing admissions | Position as organizational support only; avoid deterministic language; reference official explanation of how chance predictions work |
| Privacy and student data: collecting student identifiers triggers compliance burdens | Minimize PII; no document uploads in V1; align to FERPA and Education Law 2-d; plan formal privacy review before expanding data collection |
| Seasonality: revenue collapses off-cycle | Productize adjacent cycles (middle school admissions, waitlists, transfer schools) or expand to other large districts only after owning the NYC workflow |
| Data-source fragility: scraping or unofficial APIs can break | Use stable official pages and PDFs; manual curation for V1; treat any automation as replaceable; monitor for changes |

---

## Prioritized Roadmap

### Completed (V1 — March 2026)

- School list generator: 28+ schools across SHSAT, Audition, Screened, Ed Opt, and Lottery sections
- Filtering by borough, commute, interests, academic level, IEP, size, sports
- Size as sort preference, not hard filter — fallback relaxes borough for short commute
- Admissions type badges with tooltips
- APS (applicants per seat) competition indicator with color coding
- Consortium and IB school badges
- Google Maps link per school
- AI-generated match rationale per school (Claude Sonnet)
- Requirements checklist screen grouped by admissions type
- Nav bar: Home, My Schools, Requirements, Reset Filters
- GitHub Actions auto-deploy: push to main triggers server deploy automatically
- App live at http://167.71.80.41

### Now to 4 weeks (V1 workflow core)

- Add ANTHROPIC_API_KEY to server so AI rationale works in production
- User research: 10 families across 4 segments, 20 min each (see User Research Plan section)
- Fix: cap SHSAT results at top 3 by academic score
- Nav bar persistence: remember input selections in localStorage when navigating back
- Full end-to-end test before sharing with first families
- Domain + SSL (certbot) when ready to go public

### 8-12 weeks (differentiation)

- Safety / Good Fit school category: low APS (under 2.5) + solid academic score, filtered by borough and student interests. Needs user research to validate what "safety" means to parents before building — some of these schools may be new with limited reviews. Do not build until first 10 user conversations complete.
- Commute estimate: allow user to enter their home address and calculate real commute time to each school via Google Maps API. Currently shows a Maps pin link; real-time estimate is a paid API call so evaluate cost vs. value after user research.
- Plan quality score: flags concentration risk (too many screened or audition long shots) and recommends balancing
- Collaboration mode: parent + student + counselor view, exportable artifacts
- Paid tier activation ($49-$149 season pass)

### Later (once trust is proven)

- Outcomes data collection: optional survey for families after offers are released — which schools they applied to, which offer they accepted, SHSAT score range, what they wish they knew. This creates proprietary longitudinal data that no competitor has. Evaluate carefully: data collection requires privacy controls, informed consent, and raises Ed Law 2-d considerations. Start with a simple post-offer email survey before building in-app collection.
- Premium human review marketplace: connect families with vetted admissions consultants and SHSAT tutors. Take referral fee or subscription from providers.
- Middle school admissions cycle
- Expansion to other large districts (Boston, Chicago, LA)

---

## User Research Plan

### Goal

Validate that users trust the product, will share inputs, and will pay for workflow help. Target: 10 families before any paid feature is built.

### Segments (10 total)

- 3 Affluent + time-starved optimizers
- 3 Educated + budget-conscious power researchers
- 2 Selective-test maximizers (SHSAT focus)
- 2 New-to-the-city navigators

### Format

20 minutes per family. Structure:
- 5 min: their situation and biggest fear
- 10 min: watch them use the app with no guidance — do not explain anything
- 5 min: would you use this, would you pay, what is missing

### Questions

Before app:
- What grade is your child in?
- What is the one thing keeping you up at night about high school admissions?
- What have you tried so far?

After app:
- What did you expect when you did [specific action]?
- Did the list feel useful or overwhelming?
- Is there anything here you do not understand?
- If this cost $49 for the whole application season, would you pay? What about $99?
- What would make you trust this enough to use it for your child's actual application?

### Success Criteria

- Trust: at least 6 of 10 say they would use it for their real application
- WTP: at least 3 of 10 say yes to $49 unprompted or after one ask
- Signal: the same gap or complaint mentioned by 3 or more families = next build priority

### Acquisition Channels

- Facebook parent groups (neighborhood groups, grade cohorts, PTA-adjacent)
- Reddit r/NYCpublicschools
- Direct personal contacts who fit the profile

### What to Track

After each conversation, write one sentence: what was the moment they leaned in, and what was the moment they pulled back.

---

## Links

- List of resources: Local: PRIMER - NYC Public High School Admissions List of Resources
- Additional information: HS Navigator: FB, Add Info
- What matters: Local: HS What Matters?
- Hidden gems: Local: "NYC High Schools - HIDDEN GEMS"
- Decoding lottery numbers: https://medium.com/algorithms-in-the-wild/decoding-the-nyc-school-admission-lottery-numbers-bae7148e337d
- 2025 Admission results survey: https://medium.com/algorithms-in-the-wild/results-from-the-2025-nyc-school-admission-lottery-surveys-cd12340b3364
- Admission predictions: https://medium.com/algorithms-in-the-wild/nyc-high-school-chances-of-admission-predictions-cb15fd4b5655
