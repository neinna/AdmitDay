# AdmitDay

AI-powered NYC public high school admissions navigator. AdmitDay helps families turn a scattered admissions process into a grounded, personalized school list.

- Live app: https://www.admitday.com
- Live finder: https://www.admitday.com/find
- Saved list: https://www.admitday.com/my-schools

## Why This Exists

Every year, roughly 75,000 NYC families navigate high school admissions. The information exists across DOE pages, MySchools, School Information Finder, NYC-SIFT, school sites, Facebook groups, and spreadsheets, but it is hard to filter and harder to personalize.

AdmitDay is built around a simple product bet: parents do not need more raw information. They need to know which schools are plausible, why they match, and what to do next.

## What It Does

- Builds a school list from hundreds of NYC public high schools and programs.
- Applies deterministic filters for facts that should never be guessed, including borough, admissions track, size, requirements, activities, and programs.
- Uses the `/find` ask box for plain-language requests like "strong CS and soccer in Brooklyn" while keeping hard filters under deterministic control.
- Keeps sourced facts separate from model-generated interpretation.
- Avoids admissions-odds language and missing-data-as-zero displays.

## Product Shape

The live AdmitDay discovery surface is `/find`: hard rail filters plus an ask box that re-ranks without removing schools, linked to `/school/[dbn]` detail pages and `/my-schools` saved lists.

The old `/chat` page is not the product surface. Some implementation names still refer to chat, including the legacy ask-box API path; that cleanup is tracked in GitHub issue #170.

## Architecture

- **Frontend:** Next.js 14 App Router and Tailwind CSS.
- **Design system:** token layer plus reusable UI primitives in `components/ui/`.
- **Data store:** Vercel Postgres table `schools`, keyed by `dbn`.
- **Current school data build:** `build_school_data.py` combines NYC-SIFT plus NYC Open Data dataset `uq7m-95z8`.
- **Retrieval:** OpenAI `text-embedding-3-small`, semantic chunking by identity, academics, and activities, plus deterministic filtering.
- **Generation:** Claude Sonnet 5 through grounded prompts.
- **Cost protection:** per-IP rate limiting on LLM routes.
- **Observability:** Sentry for errors and PostHog for analytics.
- **Deployment:** Vercel from `main`; GitHub Actions runs Jest on pushes and PRs.

## Data Quality And Freshness

Data currency is the core differentiator, but the current production data is not fully current.

The current refresh command is manual:

```bash
npm run refresh:data
```

That command runs `build_school_data.py`, validates counts and required fields, writes `data/schools.json`, seeds Postgres with `scripts/seed-schools.ts`, and rebuilds embeddings with `scripts/embed-schools.ts`. It refuses to write if the scrape looks structurally wrong, such as a large school-count drop, duplicate DBNs, or missing required fields.

Current source truth:

- **NYC-SIFT:** supplies school list, size, applicants per seat, academic/survey scores, and admissions-track signals. It returns the current scrape rows used by the app, but the page does not expose a reliable admissions-cycle or last-updated marker.
- **NYC Open Data / DOE directory:** dataset `uq7m-95z8`, titled `2019 DOE High School Directory`. Socrata metadata shows the row data was last updated on 2018-08-16. Fields derived from this source, including overview text, requirements, programs, sports, languages, AP courses, transit, and some stats, should be treated as historical unless superseded by a fresher source.
- **MySchools:** the intended current source for per-school and per-program admissions data. The scraper module from issue #135 exists, but it is not yet wired into `npm run refresh:data`, Postgres, `/find`, school detail pages, or embeddings. Integration is tracked in issue #175.

There is no regular data-refresh cadence yet. The repo has scheduled production smoke tests, but those only test the deployed site. Scheduled data freshness checks and a safe manual promotion path are tracked in issue #176.

## Evals And Guardrails

AdmitDay uses product rules and tests to keep the AI parts bounded:

- Deterministic filters live in code, not in the LLM.
- The school detail page renders sourced values and provenance.
- Missing data is never shown as zero.
- Admissions-odds language is banned.
- Golden evals check factual accuracy, decision quality, output format, and completeness.
- Smoke tests check the deployed site, not just local code.

Key lessons from building the retrieval layer:

- Semantic chunking beats one giant chunk per school.
- Hybrid deterministic-plus-semantic search beats pure semantic search for compound queries.
- Evals caught real production bugs, including hallucinated data, domain misclassification, and chunk dilution.

## Agentic Build System

AdmitDay is also a testbed for a guarded autonomous coding workflow. A coordinator on a DigitalOcean VPS picks up GitHub issues labeled `agent-ok`, loads shared rules from `AGENTS.md`, runs Claude Code on task branches, verifies with tests and build checks, asks a second model to review the diff, and opens PRs back on GitHub.

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

Live in production at https://www.admitday.com. Recent work shipped the Postgres data layer, the unified `/find` surface, school detail pages, saved lists, per-IP rate limiting, and the guarded autonomous agent pipeline. Active development is focused on making `/find` trustworthy for the October application window and replacing stale DOE-derived program data with current MySchools per-program data.
