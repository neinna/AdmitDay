# AdmitDay

AI-powered NYC public high school admissions navigator. Helps families build a personalized school list from 700+ programs across 400+ schools, based on what actually matters to them.

## Problem

Every year, roughly 75,000 NYC families navigate high school admissions. The information exists (NYC DOE website, School Information Finder, NYC_SIFT), but it's scattered, hard to filter, and impossible to personalize. Parents end up relying on Facebook groups, word of mouth, and spreadsheets. AdmitDay turns that mess into one trustworthy, personalized tool.

## How It Works

Two discovery surfaces today (unifying them into a single flow is the next build — see below):

1. **Structured filters** (https://www.admitday.com). Deterministic matching on borough, size, admissions track, and interests. Filter-then-generate: match on structured fields in code, then Claude writes a personalized rationale for each school.
2. **RAG-powered chat** (https://www.admitday.com/chat). Ask in plain language ("which Brooklyn schools have strong CS and soccer?"). The system extracts exact signals from the question (borough, sport, interest), hard-filters the candidate pool, then semantic-ranks within it (**hybrid search**), and generates a grounded answer citing only the schools it found.

The filter page and the chat page are still two separate surfaces that don't share state. Unifying them into a single "find schools" flow is the **next build**.

## Architecture

- **Frontend:** Next.js 14 (App Router), Tailwind CSS.
- **Generation:** Claude **Sonnet 5** (Anthropic), grounded prompts to prevent hallucination.
- **Retrieval (RAG):** built from scratch — OpenAI `text-embedding-3-small` (1536-dim), semantic chunking (identity / academics / activities per school), hybrid deterministic-plus-semantic search, grounded chat API route.
- **Data:** 457 NYC public high schools in Vercel Postgres (`dbn TEXT PRIMARY KEY, data JSONB`), read through a cached loader (`lib/load-schools.ts` → `getAllSchools()`) that degrades gracefully to an empty-state banner on any DB error. Refresh the data with `npm run refresh:data` (see below); the JSON files it produces are gitignored and never ship in the repo.
- **Cost protection:** per-IP rate limiting on the LLM routes (`/api/chat`, `/api/rationale`); returns 429 under abuse.
- **Observability:** Sentry (errors), PostHog (analytics).
- **Deployment:** Vercel — production auto-deploys from `main`; GitHub Actions CI runs the Jest suite as a required check on every PR.

## Refreshing School Data

Data currency is the app's core differentiator, so refreshing it for a new admissions cycle is meant to be routine, not archaeology. One command runs the full pipeline in order and validates the result before writing anything:

```bash
npm run refresh:data
```

This runs `scripts/refresh-data.ts`, which does, in order:

1. **Scrape** current DOE / NYC-SIFT data: `python3 build_school_data.py` → writes `schools.json` at the repo root.
2. **Validate** the scrape (`lib/validate-school-data.ts`) before anything is written to `data/`. It fails loudly — refuses to write and exits non-zero — if:
   - the school count falls outside the expected range (~457 ± 10%),
   - the count drops more than ~10% versus the previously-seeded `data/schools.json`,
   - any record is missing a required field (`dbn`, `name`, or `borough`), or
   - any `dbn` value is duplicated.
   It also prints a human-readable summary: schools before/after, added dbns, removed dbns, and any records that failed validation.
3. **Write** the validated data to `data/schools.json`.
4. **Seed Postgres**: `npx ts-node scripts/seed-schools.ts` — upserts every record into the `schools` table, keyed by `dbn`.
5. **Re-embed**: `npx ts-node scripts/embed-schools.ts` — rebuilds `data/school-embeddings.json` for RAG retrieval.

Steps 4 and 5 need `POSTGRES_URL` and `OPENAI_API_KEY` in `.env.local`. This is a manual, on-demand command today — no scheduling (cron/CI) is wired up.

## How AdmitDay gets built — the autonomous coding agent

AdmitDay is built through a self-hosted coding-agent pipeline, designed to be a repeatable platform for this and future apps:

1. File a GitHub issue and label it `agent-ok`.
2. A coordinator (`agent-coordinator.sh`, on a VPS) picks it up, runs Claude Code on a fresh task branch, and **objectively verifies** the result with `npm test` + `npm run build`.
3. An independent reviewer pass — a second, read-only Claude — checks the diff against the issue and rejects scope creep.
4. The coordinator opens a PR. Low-risk, reviewer-approved changes are **auto-merged** (squash) once the required `test` check passes; anything touching the database, secrets, or infrastructure is escalated to a human instead of auto-merging.
5. Branch protection makes the PR the only path to `main` — no direct pushes, no force-pushes.

Progress is reported over Telegram. Guardrails — branch protection, secret scanning + push protection, and a markdown-allowlist CI guard — keep the autonomy safe by structure.

## Lessons Learned Building This

**Semantic chunking matters.** Naive single-chunk-per-school embeddings caused chunk dilution: a 3,900-character school description produces an embedding that matches no single query well. Splitting into identity, academics, and activities chunks for schools with descriptions longer than 800 chars (e.g., Brooklyn Tech went from 1 chunk to 3) improved retrieval scores significantly.

**Evals catch real bugs.** Built golden datasets and scored on a 4-dimension rubric (factual accuracy, decision quality, output format, completeness). Found data hallucination, domain misclassification, and chunk dilution in production, and wrote prompt fixes for all three.

**Code for rules, LLM for reasoning.** Important, deterministic filters (borough, admissions track) should never go through an LLM. Deterministic matching happens in code; Claude handles the nuanced generation and conversational retrieval.

**Hybrid search beats pure semantic for compound queries.** A query like "CS + soccer + Brooklyn" gets blended into one average vector, so no single chunk matches all signals well. The fix (now shipped): extract deterministic filters — borough, sport, interest — from the question, hard-filter the candidate set, then semantic-rank within it.

## Running Locally

```bash
git clone https://github.com/neinna/AdmitDay.git
cd AdmitDay
npm install
cp .env.local.example .env.local
# Add ANTHROPIC_API_KEY, OPENAI_API_KEY, and the Postgres connection vars to .env.local
npm run dev
```

## Status

Live in production at https://www.admitday.com. Recent cycle: fixed the production school list (Postgres data layer), shipped hybrid chat search, moved both LLM routes to Claude Sonnet 5, added rate limiting, and brought the autonomous agent pipeline (with guarded auto-merge) online. Five moderated user sessions with NYC parents. Active development toward the October application window.
