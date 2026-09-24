# AdmitDay Agent Instructions

These are the shared rules for any coding agent working in this repo: Claude Code, Codex, open-weight model runners, or future orchestrator workers. Agent-specific adapters should load this file rather than duplicating rules.

## Source Of Truth

- Treat GitHub `main` as the live code truth. Local checkouts are caches and may be stale after agent-built PRs; refresh from GitHub before making or reviewing code claims.
- Treat Notion as the live roadmap and task truth. Private or local planning docs are caches unless explicitly refreshed from Notion.
- When local files, GitHub, and Notion disagree, state the conflict and prefer GitHub for code state and Notion for roadmap and task state.

## Core Rules

- Treat GitHub `main` as the live code source of truth, Notion as the live roadmap/task source of truth, and local checkouts or local docs as caches unless explicitly refreshed from their source.
- If GitHub, Notion, and local files disagree, state the conflict. Prefer GitHub for code state and Notion for roadmap/task state.
- **Never modify `data/schools.json`.** It is curated source data.
- The shape of the school data is in `data/schema-summary.json` (field names, types, presence counts, examples). Read that instead of opening `schools.json` or `data/school-embeddings.json` to find out what a field is called.
- Filtering logic lives in `lib/school-list-utils.ts` — look there first for anything about school list filtering.
- Tests live in `__tests__/`. **Add** new test files or cases; never overwrite or delete existing tests.
- While working, run only the tests for what you changed (`npx jest __tests__/<file>`) and `npx tsc --noEmit`. Run the full `npm test` once before committing. Under the coordinator, do not run `npm run build`: the coordinator runs the full suite and the build after you finish and sends you any failure, and a build takes about 3 minutes on its 1-CPU server. Outside the coordinator, `npm test` and `npm run build` must both exit 0 before a change is done.
- After broad exploration, write a compact task brief and start a fresh implementation session instead of carrying the full exploratory context forward.
- Before implementation, state success criteria cold: expected behavior, files likely involved, verification commands, and reviewer risks.
- The app deploys to Vercel automatically from `main`. Do not add local deploy or pm2 steps.
- The product name in UI copy is **"AdmitDay"**.
- Do not update `README.md` unless the issue asks for it. The README is brought up to date in its own PR and reviewed there, not on every issue.
- Never push, never merge, never switch branches unless the active orchestrator or human operator explicitly assigns that responsibility.
- Stay strictly within the scope of the issue you were given; an independent reviewer rejects scope creep.

## Use What Already Exists

The app already runs on:

- **Vercel Postgres** (`@vercel/postgres`, see `lib/load-schools.ts`) for anything persisted, including counters and small operational tables. Tables are created with `CREATE TABLE IF NOT EXISTS` on first use; there is no migration tool.
- **`data/school-embeddings.json`**, loaded into memory by `lib/rag.ts`, for retrieval.
- **Sentry** for errors, **PostHog** for product analytics, **Langfuse** (`lib/trace.ts`) for LLM tracing.

Rules:

- **Solve the issue with existing infrastructure.** Do not add a new external service, hosted database, queue, or paid API unless the issue names it. Calling a service's HTTP API directly with `fetch` still counts as adding it.
- If the issue cannot be done without something new, stop and say so in your summary instead of adding it. Choosing a new service is a decision recorded in Notion, not an implementation detail.
- **Prefer the smallest change that meets the issue.** No new abstractions, configuration options, or fallback paths the issue did not ask for.

## Cost And Issue Sizing

Every implementation run is capped by `CLAUDE_IMPLEMENT_MAX_USD` (currently \$5.00). An issue that cannot be finished inside one capped run is not a hard issue — it is a badly sized one, and it will consume the whole cap and produce nothing.

The metric is **cost per merged PR**, not cost per attempt. On 2026-09-17 this repo spent roughly \$13 per merged PR across five runs. \$2–5 is the healthy range for a multi-file feature with tests; \$0.50–1.50 for a single-file change with an explicit spec.

### Epics and children

A conversation that produces more than one concern, or that needs any discovery, becomes an **epic** first, not an issue.

- **The epic is a record, never a task.** Label it `epic`. It never gets `agent-ok`, and the coordinator never picks it up. It holds the decision, why it was made, what was discovered, and links to its children.
- **Discovery happens before the children are filed, and its output lives in the epic.** Field names, sample records, column lists, API shapes, exact values. A child issue that still has to explore pays for that exploration inside a capped run, and re-reads the result on every later turn.
- **One concern per child.** A scraper change and the screen that shows the new field are two children. A data migration and the cleanup that follows it are two children.
- **Children carry the answer, not the pointer.** Exact values, exact file paths, exact thresholds, copied from the epic.
- **Single-concern work skips the epic.** Filing one small, fully specified issue is cheaper than the overhead of a parent.

Measured on 2026-09-22: five issues written as complete specifications rather than as sized children consumed $27 and merged nothing, while four properly sized issues cost $0.43-$2.43 each and merged on the first attempt. The difference was concerns per issue, not difficulty.

When filing an issue for the agent:

- **One concern per issue.** A new module, a new dependency, two route changes, and three test scenarios in one ticket is four issues.
- **Put the answer in the issue, not a pointer to it.** Exact values, exact thresholds, exact API calls. #192 landed on the first pass because the verified cutoff numbers were written into the body. #162 failed four times because its four selectivity levels were named and never defined, leaving the agent to invent thresholds and then test its own invention.
- **Do not list files "for context".** Every file named in the body is a paid read before any work begins. Name only the files that must change.
- **No open design decisions.** If the issue requires choosing a threshold, a scale, or a product rule, that decision belongs in the issue or in Notion before the issue is filed.
- **A new third-party dependency is its own issue.** Installing it and proving one call works is one ticket; using it is the next. Integrating an unfamiliar SDK is the single most expensive thing this pipeline does.
- **Name the infrastructure.** Whoever writes the issue checks the existing stack (above) and states which piece the work uses, for example "store it in Postgres". Adding a new service is Inna's decision, made before the issue is filed and never by the agent. The decision and its product and technical reasons are recorded in Notion, in the architecture doc or the PRD; the issue links to that entry.
- **Check the issue against the PRD before filing.** #162 asked for a derived rating that the PRD bans by name, so no implementation of it could ever have passed review.

## Issue Sequencing

The coordinator picks up `agent-ok` issues in ascending issue-number order. File issues in the order they should be built.

An issue whose body contains a line `Blocked by #N` is skipped while issue #N is still open.

The line must be exactly `Blocked by #N` — the `#` is required, and no other text may share the line. `Blocked by 336.` does not match and the gate will not hold.

## Design System

Design lives in `design/`.

- `design/DESIGN-SYSTEM.html` is the canonical source for color, type, geometry, layout, primitives, states, and visual invariants.
- Per-screen files such as `find-screen`, `school-detail`, `saved-list`, and `landing` are deltas on top of the design system.
- Never hardcode a hex value or type size that the system already defines; use Tailwind tokens.
- **A mark, not a sentence.** Where a fact can be carried by an icon, a dot, a colour or a short token (`n/a`), use that and put the words in a `title`/`aria-label`. Parents do not read explanatory paragraphs in a UI. A sentence on the page has to earn its place.
- **Fix shared components, not call sites.** A visual fault in something used in more than one place is fixed in the component. `!important` to beat a variant's own styling means the component needs a prop, not an override.
