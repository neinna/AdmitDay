# AdmitDay

AI-powered NYC public high school admissions navigator. AdmitDay helps families turn a scattered admissions process into a grounded, personalized school list.

- Live app: https://www.admitday.com
- Find schools: https://www.admitday.com/find
- School details: `/school/[dbn]`

## Why This Exists

Every year, roughly 75,000 NYC families navigate high school admissions. The information exists across DOE pages, School Information Finder, school sites, Facebook groups, and spreadsheets, but it is hard to filter and harder to personalize.

AdmitDay is built around a simple product bet: parents do not need more raw information. They need to know which schools are plausible, why they match, and what to do next.

## What It Does

- Builds a school list from 900+ programs across 420+ NYC public high schools.
- Applies deterministic filters for facts that should never be guessed, including borough, admissions track, size, requirements, activities, and programs.
- Uses a RAG-powered ask box for plain-language questions like "which Brooklyn schools have strong CS and soccer?"
- Generates grounded rationales only from retrieved school data.
- Keeps DOE-reported facts separate from model-generated interpretation.

## Product Shape

AdmitDay's live surfaces are `/find` discovery, school detail pages, and a signed-in shortlist:

1. **Unified `/find`:** users narrow schools by hard rail filters (under a "Non-Negotiables" heading), optionally set a starting point (ZIP or subway station) to filter and sort by distance, then use the ask box for plain-language criteria that re-rank results without silently removing schools. Rows link to `/school/[dbn]` detail pages and can be saved to the shortlist.
2. **RAG ask box:** users ask in natural language; the system extracts exact signals, hard-filters the candidate pool, semantic-ranks within it, and returns one short reason per school (retrieving 20 schools) via `/api/find/ask`.
3. **Shortlist (`/shortlist`):** a signed-in family's saved schools, split into SHSAT and Main list sections, with expandable rows and a print view. Saved lists are stored in Postgres via `/api/saved-schools`.

The older standalone `/chat` product surface is decommissioned.

## Architecture

- **Frontend:** Next.js 14 App Router and Tailwind CSS.
- **Design system:** token layer plus reusable UI primitives in `components/ui/`.
- **Data:** 426 NYC public high schools in Vercel Postgres, keyed by `dbn`.
- **Retrieval:** OpenAI `text-embedding-3-small`, semantic chunking by identity, current MySchools programs, academics, and activities, plus deterministic filtering.
- **Generation:** Claude Sonnet 5 through grounded prompts.
- **Cost protection:** per-IP rate limiting on LLM routes (per minute, plus 20 LLM calls per IP per day) plus a global daily LLM ceiling, both stored durably in Vercel Postgres (`rate_limits` table), with an in-memory fallback if the store errors.
- **Observability:** Sentry for errors (initialized on Vercel only, tagged with the deployment environment), PostHog for analytics, Langfuse (`lib/trace.ts`) for per-request LLM cost/latency/token/retrieval tracing on `/api/find/ask` and `/api/rationale` — logging only, never on the response path, and never carries question/answer/prompt/chunk text. `/api/find/ask` returns that request's trace id to the client; rating an answer (`FeedbackRow`, via `/api/find/feedback`) writes a Langfuse score against it, joining user feedback to the trace it belongs to.
- **Auth:** Clerk for sign up, log in, log out, and password reset (email/password and Google). Saving a school and the shortlist require an account; browsing `/find` and school pages does not. Signed-in users can delete their account (`/api/account`).
- **Deployment:** Vercel from `main`; GitHub Actions runs Jest on pushes and PRs, the ask eval (`eval-ask.yml`), a Playwright smoke test of the signed-out parent flow on production (`smoke.yml`), and a weekly README freshness check (`readme-freshness.yml`).

## Data Quality

Data currency is the core differentiator. One command runs the refresh pipeline:

```bash
npm run refresh:data
```

The pipeline runs `build_school_data.py`, validates counts and required fields, writes the validated JSON and `data/schema-summary.json`, rebuilds embeddings with `scripts/embed-schools.ts`, and then seeds Postgres with `scripts/seed-schools.ts`. Embeddings run before the DB update so a provider/key failure cannot leave `/find` data ahead of RAG. It refuses to write if the scrape looks structurally wrong, such as a large school-count drop, duplicate DBNs, or missing required fields.

The refresh fails loudly if MySchools coverage drops too far: at least 95% of schools must have a program with both `program_code` and `provenance.source == "MySchools"`, or validation rejects the scrape.

Source roles:

- NYC Open Data dataset `dnpx-dfnc` (the Fall 2025 InfoHub HS directory plus 2024-25 School Quality Reports, via `scripts/enrich_doe_directory.py`) provides the school list, DOE directory fields, School Quality Report scores, and the high-impact flag (impact percentile >= 80).
- MySchools provides current per-school/per-program admissions records, school coordinates, open-house text and school hours, seats left last year, and applicants per seat (computed from general-ed seats). Program data includes names, codes, admissions methods, seats/demand, requirements text, eligibility/priority text, source URL, and fetch timestamp.
- SHSAT offer cutoffs (`lib/shsat-cutoffs.ts`, mirrored in `build_school_data.py`) come from NYC DOE "Specialized High School Offers" press releases and carry the 2024, 2025, and 2026 offer years per specialized-school DBN, each with a source URL and the date it was last verified. `getShsatCutoff(dbn)` returns the latest year; `getShsatCutoffs(dbn)` returns all published years.

Scheduled refresh runs from the VPS, where the env files already live. `scripts/vps-data-refresh.sh pr` runs in `/root/admitday-data` (a dedicated AdmitDay checkout; `/root/app` on the VPS is a different app), sources `/root/admitday-data/.env.local` if present, then the root-owned secret files `/root/.env.local` and `/root/.env.agents`, scrapes, validates, rebuilds embeddings, prunes stale remote refs, pushes a `data/weekly-refresh` branch, dispatches CI, and opens or updates a data PR (found by number, not branch name) with the tracked data artifacts. Its body reports the school count, added and removed DBNs, the program-count change, the open-house count, and when the run fetched the data. If the scrape or validation step fails, the runner never just logs it -- it opens or updates the single `Data refresh failed` GitHub issue with the failure summary. If nothing changed, no PR is opened. `scripts/vps-data-refresh.sh merge` is the data refresh runner's publication gate: it merges only when the generated PR changes exactly `schools.json`, `data/schema-summary.json` and `data/school-embeddings.json`, and the GitHub CI `test` check is green. The VPS never writes to Postgres: merging the data PR deploys `schools.json` to Vercel, and the daily Vercel cron `/api/cron/seed-schools` (10:00 ET, 14:00 UTC) loads it into Postgres from there -- a data PR that merges reaches Postgres at the next run of that cron. The database secret exists only in Vercel, not on the VPS.

Cadence: twice weekly (Monday and Thursday, 12:00 UTC) during admissions season, September through March; monthly (the first Monday of the month) April through August; `scripts/vps-data-refresh.sh pr`/`merge` can also be run manually at any time. The crontab lines are committed at `scripts/vps-data-cron.txt` -- install them on the VPS with:

```bash
crontab -l | { cat; cat scripts/vps-data-cron.txt; } | crontab -
```

## Evals And Guardrails

AdmitDay uses product rules and tests to keep the AI parts bounded:

- Deterministic filters live in code, not in the LLM.
- The school detail page renders only DOE-published values.
- Missing data is never shown as zero.
- Admissions-odds language is banned.
- Golden evals check factual accuracy, decision quality, output format, and completeness.
- Smoke tests check the deployed site, not just local code.
- `npm run eval:ask` is the live eval harness for the ask box (`evals/run-ask-eval.ts`). It runs weekly through the Anthropic Batch API and on ask-path PRs (not forks), records Langfuse dataset runs, and gates merges; `admitday_eval.py` is historical.
- Missing DOE data is shown as a grey `n/a` (not reported) or `none` (not offered) mark, never a sentence.
- A short Disclaimers page (`/disclaimers`) is linked from the footer.

Key lessons from building the retrieval layer:

- Semantic chunking beats one giant chunk per school.
- Hybrid deterministic-plus-semantic search beats pure semantic search for compound queries.
- Evals caught real production bugs, including hallucinated data, domain misclassification, and chunk dilution.

## Agentic Build System

AdmitDay is also a testbed for a guarded autonomous coding workflow. A coordinator on a DigitalOcean VPS picks up GitHub issues labeled `agent-ok`, loads shared rules from `AGENTS.md`, runs Claude Code on task branches, verifies with tests and build checks, asks a second model to review the diff (strict verdict), and opens PRs back on GitHub.

The full operator workflow, including who uses it, where it runs, session discipline, compact task briefs, cost gates, Langfuse observability, and future model routing, lives in [docs/agent-pipeline.md](docs/agent-pipeline.md).

## Running Locally

```bash
git clone https://github.com/neinna/AdmitDay.git
cd AdmitDay
npm install
cp .env.local.example .env.local
# Add ANTHROPIC_API_KEY, OPENAI_API_KEY, and Postgres vars to .env.local
npm run dev
```

## Status

Live in production at https://www.admitday.com. Recent work shipped the Postgres data layer, the Fall 2025 DOE data with School Quality Report scores, the shortlist, distance from a starting point, per-IP rate limiting, and the guarded autonomous agent pipeline. Five moderated user sessions with NYC parents are complete; active development is focused on the October application window.
