# AdmitDay — house rules for agents

- **Never modify `data/schools.json`.** It is curated source data.
- Filtering logic lives in `lib/school-list-utils.ts` — look there first for anything about school list filtering.
- Tests live in `__tests__/`. **Add** new test files or cases; never overwrite or delete existing tests.
- Run `npm test` and `npm run build` before considering any change done; both must exit 0.
- The app deploys to Vercel automatically from `main`. Do not add local deploy or pm2 steps.
- The product name in UI copy is **"AdmitDay"** (the repo was renamed from hs-navigator; don't reintroduce the old name).
- If a change alters user-facing behavior, the data model, or the architecture, update `README.md` in the same PR so the README never drifts from reality (`README.md` is on the markdown allowlist, so editing it is always allowed).
- Never push, never merge, never switch branches — the coordinator owns git remotes.
- `LESSONS.md` is coordinator-owned runtime state — read it for context, but never commit it (use `git add -A -- ':(exclude)LESSONS.md'`).
- Stay strictly within the scope of the issue you were given; an independent reviewer rejects scope creep.
- **Issue sequencing:** the coordinator picks up `agent-ok` issues in **ascending issue-number order** (file them in the order they should be built). An issue whose body contains a line `Blocked by #N` is skipped while issue #N is still open.
- **Design lives in `design/`, and it is authoritative for *look*, not for *product decisions*.** `design/DESIGN-SYSTEM.html` is the canonical source for colour, type, geometry, layout, primitives and states — read it before building any UI, and never hardcode a hex or type size it already defines. The per-screen files (`find-screen`, `school-detail`, `saved-list`, `landing`, each with a `-handoff`) are *deltas* on top of it.
- **Where the design docs and the issue disagree, the issue wins.** The design documents were produced by a design tool and contain decisions the owner has not reviewed — particularly user-facing **copy**, and rules stated as "invariants". Product behaviour, copy, and what is or isn't shown are decided in the issue and the PRD. If a design doc requires something the issue contradicts, follow the issue and say so in the PR rather than silently choosing one.
