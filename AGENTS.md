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
- Filtering logic lives in `lib/school-list-utils.ts` — look there first for anything about school list filtering.
- Tests live in `__tests__/`. **Add** new test files or cases; never overwrite or delete existing tests.
- Run `npm test` and `npm run build` before considering any change done; both must exit 0.
- After broad exploration, write a compact task brief and start a fresh implementation session instead of carrying the full exploratory context forward.
- Before implementation, state success criteria cold: expected behavior, files likely involved, verification commands, and reviewer risks.
- The app deploys to Vercel automatically from `main`. Do not add local deploy or pm2 steps.
- The product name in UI copy is **"AdmitDay"**.
- If a change alters user-facing behavior, the data model, or the architecture, update `README.md` in the same PR so the README never drifts from reality.
- Never push, never merge, never switch branches unless the active orchestrator or human operator explicitly assigns that responsibility.
- Stay strictly within the scope of the issue you were given; an independent reviewer rejects scope creep.

## Cost And Issue Sizing

Every implementation run is capped by `CLAUDE_IMPLEMENT_MAX_USD` (currently \$5.00). An issue that cannot be finished inside one capped run is not a hard issue — it is a badly sized one, and it will consume the whole cap and produce nothing.

The metric is **cost per merged PR**, not cost per attempt. On 2026-09-17 this repo spent roughly \$13 per merged PR across five runs. \$2–5 is the healthy range for a multi-file feature with tests; \$0.50–1.50 for a single-file change with an explicit spec.

When filing an issue for the agent:

- **One concern per issue.** A new module, a new dependency, two route changes, and three test scenarios in one ticket is four issues.
- **Put the answer in the issue, not a pointer to it.** Exact values, exact thresholds, exact API calls. #192 landed on the first pass because the verified cutoff numbers were written into the body. #162 failed four times because its four selectivity levels were named and never defined, leaving the agent to invent thresholds and then test its own invention.
- **Do not list files "for context".** Every file named in the body is a paid read before any work begins. Name only the files that must change.
- **No open design decisions.** If the issue requires choosing a threshold, a scale, or a product rule, that decision belongs in the issue or in Notion before the issue is filed.
- **A new third-party dependency is its own issue.** Installing it and proving one call works is one ticket; using it is the next. Integrating an unfamiliar SDK is the single most expensive thing this pipeline does.
- **Check the issue against the PRD before filing.** #162 asked for a derived rating that the PRD bans by name, so no implementation of it could ever have passed review.

## Issue Sequencing

The coordinator picks up `agent-ok` issues in ascending issue-number order. File issues in the order they should be built.

An issue whose body contains a line `Blocked by #N` is skipped while issue #N is still open.

## Design System

Design lives in `design/`.

- `design/DESIGN-SYSTEM.html` is the canonical source for color, type, geometry, layout, primitives, states, and visual invariants.
- Per-screen files such as `find-screen`, `school-detail`, `saved-list`, and `landing` are deltas on top of the design system.
- Never hardcode a hex value or type size that the system already defines; use Tailwind tokens.
