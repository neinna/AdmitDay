# AdmitDay Agent Instructions

These are the shared rules for any coding agent working in this repo: Claude Code, Codex, open-weight model runners, or future orchestrator workers. Agent-specific adapters should load this file rather than duplicating rules.

## Source Of Truth

- Treat GitHub `main` as the live code truth. Local checkouts are caches and may be stale after agent-built PRs; refresh from GitHub before making or reviewing code claims.
- Treat Notion as the live roadmap and task truth. Private or local planning docs are caches unless explicitly refreshed from Notion.
- When local files, GitHub, and Notion disagree, state the conflict and prefer GitHub for code state and Notion for roadmap and task state.

## Core Rules

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
- `LESSONS.md` is coordinator-owned runtime state — read it for context, but never commit it.
- Stay strictly within the scope of the issue you were given; an independent reviewer rejects scope creep.

## Issue Sequencing

The coordinator picks up `agent-ok` issues in ascending issue-number order. File issues in the order they should be built.

An issue whose body contains a line `Blocked by #N` is skipped while issue #N is still open.

## Design System

Design lives in `design/`.

- `design/DESIGN-SYSTEM.html` is the canonical source for color, type, geometry, layout, primitives, states, and visual invariants.
- Per-screen files such as `find-screen`, `school-detail`, `saved-list`, and `landing` are deltas on top of the design system.
- Never hardcode a hex value or type size that the system already defines; use Tailwind tokens.
