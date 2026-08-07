# AdmitDay

AI-powered NYC public high school admissions navigator. AdmitDay helps families turn a scattered admissions process into a grounded, personalized school list.

- Live app: https://www.admitday.com
- Find schools: https://www.admitday.com/find
- School details: `/school/[dbn]`

## Why This Exists

Every year, roughly 75,000 NYC families navigate high school admissions. The information exists across DOE pages, School Information Finder, NYC-SIFT, school sites, Facebook groups, and spreadsheets, but it is hard to filter and harder to personalize.

AdmitDay is built around a simple product bet: parents do not need more raw information. They need to know which schools are plausible, why they match, and what to do next.

## What It Does

- Builds a school list from 700+ programs across 400+ NYC public high schools.
- Applies deterministic filters for facts that should never be guessed, including borough, admissions track, size, requirements, activities, and programs.
- Uses a RAG-powered ask box for plain-language questions like "which Brooklyn schools have strong CS and soccer?"
- Generates grounded rationales only from retrieved school data.
- Keeps DOE-reported facts separate from model-generated interpretation.

## Product Shape

AdmitDay currently has one live discovery surface:

1. **Unified `/find`:** users narrow schools by hard rail filters, then use the ask box for plain-language criteria that re-rank or annotate results without silently removing schools. Rows link to `/school/[dbn]` detail pages.
2. **RAG ask box:** users ask in natural language; the system extracts exact signals, hard-filters the candidate pool, semantic-ranks within it, and cites only the schools it found via `/api/find/ask`.

The older standalone `/chat` product surface is decommissioned; `/find` is the live product surface.

## Architecture

- **Frontend:** Next.js 14 App Router and Tailwind CSS.
- **Design system:** token layer plus reusable UI primitives in `components/ui/`.
- **Data:** 457 NYC public high schools in Vercel Postgres, keyed by `dbn`.
- **Retrieval:** OpenAI `text-embedding-3-small`, semantic chunking by identity, current MySchools programs, academics, and activities, plus deterministic filtering.
- **Generation:** Claude Sonnet 5 through grounded prompts.
- **Cost protection:** per-IP rate limiting on LLM routes.
- **Observability:** Sentry for errors and PostHog for analytics.
- **Deployment:** Vercel from `main`; GitHub Actions runs Jest on pushes and PRs.

## Data Quality

Data currency is the core differentiator. One command runs the refresh pipeline:

```bash
npm run refresh:data
```

The pipeline runs `build_school_data.py`, validates counts and required fields, writes the validated JSON, rebuilds embeddings with `scripts/embed-schools.ts`, and then seeds Postgres with `scripts/seed-schools.ts`. Embeddings run before the DB update so a provider/key failure cannot leave `/find` data ahead of RAG. It refuses to write if the scrape looks structurally wrong, such as a large school-count drop, duplicate DBNs, missing required fields, or missing MySchools program provenance.

Source roles:

- NYC-SIFT provides the school list and school-level selectivity signals.
- NYC Open Data dataset `uq7m-95z8` provides older DOE directory fields. Its rows are from the 2018-era / 2019 DOE High School Directory and should be treated as historical where MySchools has fresher fields.
- MySchools provides current per-school/per-program admissions records. Program data includes names, codes, admissions methods, seats/demand, requirements text, eligibility/priority text, source URL, and fetch timestamp.

Scheduled refresh runs from the VPS, where the app secrets already live. `scripts/vps-data-refresh.sh pr` sources the VPS env files, runs the validated refresh with Postgres seeding disabled, rebuilds embeddings, pushes a `data/weekly-refresh` branch, dispatches CI, and opens or updates a PR with the tracked data artifacts. After that PR merges, `scripts/vps-data-refresh.sh apply` pulls `main` on the VPS and seeds Postgres from the merged `schools.json`. This keeps `OPENAI_API_KEY` and `POSTGRES_URL` out of GitHub repository secrets while preserving a reviewed data-artifact path.

Example VPS cron entries:

```cron
0 9 * * 1 cd /home/agent/app && ./scripts/vps-data-refresh.sh pr
30 9 * * * cd /home/agent/app && ./scripts/vps-data-refresh.sh apply
```

## Evals And Guardrails

AdmitDay uses product rules and tests to keep the AI parts bounded:

- Deterministic filters live in code, not in the LLM.
- The school detail page renders only DOE-published values.
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

Live in production at https://www.admitday.com. Recent work shipped the Postgres data layer, hybrid chat search, Claude Sonnet 5 routing for LLM calls, per-IP rate limiting, and the guarded autonomous agent pipeline. Five moderated user sessions with NYC parents are complete; active development is focused on the October application window.
