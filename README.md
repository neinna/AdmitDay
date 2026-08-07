# AdmitDay

AI-powered NYC public high school admissions navigator. AdmitDay helps families turn a scattered admissions process into a grounded, personalized school list.

- Live app: https://www.admitday.com
- Unified finder: `/find` and `/school/[dbn]`

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

`/find` is the live discovery surface: hard rail filters plus an ask box that re-ranks without removing schools, linked to `/school/[dbn]` detail pages.

1. **Structured filters:** users narrow schools by concrete constraints, then get personalized rationale text.
2. **RAG ask box:** users ask in natural language; the system extracts exact signals, hard-filters the candidate pool, semantic-ranks within it, and cites only the schools it found via `/api/find/ask`.

## Architecture

- **Frontend:** Next.js 14 App Router and Tailwind CSS.
- **Design system:** token layer plus reusable UI primitives in `components/ui/`.
- **Data:** 457 NYC public high schools in Vercel Postgres, keyed by `dbn`.
- **Retrieval:** OpenAI `text-embedding-3-small`, semantic chunking by identity, academics, and activities, plus deterministic filtering.
- **Generation:** Claude Sonnet 5 through grounded prompts.
- **Cost protection:** per-IP rate limiting on LLM routes.
- **Observability:** Sentry for errors and PostHog for analytics.
- **Deployment:** Vercel from `main`; GitHub Actions runs Jest on pushes and PRs.

## Data Quality

Data currency is the core differentiator. One command runs the refresh pipeline:

```bash
npm run refresh:data
```

The pipeline runs `build_school_data.py`, validates counts and required fields, writes the validated JSON, seeds Postgres with `scripts/seed-schools.ts`, and rebuilds embeddings with `scripts/embed-schools.ts`. It refuses to write if the scrape looks structurally wrong, such as a large school-count drop, duplicate DBNs, or missing required fields.

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
