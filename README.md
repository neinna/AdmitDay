# ListReady
 
AI-powered NYC public high school admissions navigator. Helps families build personalized school lists from 700+ programs based on their preferences.
 
## Problem
 
Every year, roughly 75,000 NYC families navigate high school admissions. The information exists (NYC DOE website, School Information Finder, NYC_SIFT), but it's scattered, hard to filter, and impossible to personalize. Parents end up relying on Facebook groups, word of mouth, and spreadsheets. ListReady uses AI to help parents define their criteria and build a list of high schools based on them. 
 
## How It Works
 
Two discovery modes:
 
1. **Structured filters.** Boolean matching on borough, academics, SHSAT status, interests. Filter-then-generate: match on structured fields, then Claude generates personalized descriptions for each school.
2. **RAG-powered chat.** Ask natural language questions ("which schools in Brooklyn have strong CS programs and soccer?"). The system retrieves relevant school data via semantic search and generates grounded answers.
## Architecture
 
- **Frontend:** Next.js, Tailwind CSS
- **AI:** Claude API (Anthropic) for generation, grounding prompts to prevent hallucination
- **RAG pipeline:** Built from scratch. Data ingestion, semantic chunking (identity/academics/activities splits per school), in-memory vector search, chat API route
- **Data:** 457 NYC public high schools scraped and structured from DOE sources
- **Observability:** Sentry (error tracking), PostHog (product analytics)
- **Deployment:** DigitalOcean VPS, PM2 process manager, GitHub Actions CI/CD
- **Coding agent:** Autonomous agent (agent-coordinator.sh) watches GitHub Issues labeled `todo`, runs Claude Code, commits on success, notifies via Telegram
  
## Lessons Learned Building This So Far
 
**Semantic chunking matters.** Naive single-chunk-per-school embeddings caused chunk dilution: a 3,900-character school description produces an embedding that matches no single query well. Splitting into identity, academics, and activities chunks for schools with descriptions longer than 800 chars (e.g., Brooklyn Tech went from 1 chunk to 3) improved retrieval scores significantly.
 
**Evals catch real bugs.** Built golden datasets and scored on a 4-dimension rubric (factual accuracy, decision quality, output format, completeness). Found data hallucination, domain misclassification, and chunk dilution in production. Wrote prompt fixes for all three.
 
**Code for rules, LLM for reasoning.** Important,deterministic filters (borough, SHSAT status) should never go through an LLM. Deterministic matching in code, Claude handles the nuanced generation and conversational retrieval.
 
**Compound queries are hard.** A query like "CS + soccer + Brooklyn" gets blended into one average vector. No single chunk matches all signals well. Identified hybrid search (merging deterministic matching on high-priority fields with semantic search on secondary fields) as the next fix.
 
## Running Locally
 
```bash
git clone https://github.com/neinna/hs-navigator.git
cd hs-navigator
npm install
cp .env.local.example .env.local
# Add your ANTHROPIC_API_KEY to .env.local
npm run dev
```
 
## Status
 
Deployed to production with pilot users. Active development.
