# AdmitDay — house rules for agents

- **Never modify `data/schools.json`.** It is curated source data.
- Filtering logic lives in `lib/school-list-utils.ts` — look there first for anything about school list filtering.
- Tests live in `__tests__/`. **Add** new test files or cases; never overwrite or delete existing tests.
- Run `npm test` and `npm run build` before considering any change done; both must exit 0.
- The app deploys to Vercel automatically from `main`. Do not add local deploy or pm2 steps.
- The product name in UI copy is **"AdmitDay"** (the repo was renamed from hs-navigator; don't reintroduce the old name).
- Never push, never merge, never switch branches — the coordinator owns git remotes.
- `LESSONS.md` is coordinator-owned runtime state — read it for context, but never commit it (use `git add -A -- ':(exclude)LESSONS.md'`).
- Stay strictly within the scope of the issue you were given; an independent reviewer rejects scope creep.
