# AdmitDay Agent Pipeline

AdmitDay is built with a guarded autonomous coding workflow that runs on a DigitalOcean VPS. The goal is not to let an agent do anything it wants; the goal is to make small, reviewable changes move through a repeatable system with objective checks.

This pipeline is for the project operator, not for AdmitDay users. Parents use the product. The agent pipeline is the build system behind the product.

## Who Uses This

- **You:** file issues, decide priorities, review risky PRs, and merge work that should stay human-controlled.
- **GitHub:** acts as the control plane: issues are the queue, labels are state, branches hold work, and PRs are the review surface.
- **The VPS coordinator:** polls GitHub, starts agent runs, verifies results, comments on issues, and opens PRs.
- **Claude Code:** performs the current implementation and review passes on the VPS.
- **Future model router:** will decide which model should handle planning, simple edits, complex implementation, and review.

`AGENTS.md` is the shared instruction file for all coding agents. Claude Code gets a tiny `CLAUDE.md` adapter because it loads that filename automatically, but the adapter points back to `AGENTS.md`. Open-weight model runners and future orchestrator workers should receive the same `AGENTS.md` content in their harness prompt.

## Where It Runs

The coordinator runs on the VPS, not on the production user's browser session. The basic deployment shape is:

1. GitHub issue gets labeled `agent-ok`.
2. VPS coordinator sees the issue and creates a task branch.
3. Coordinator loads `AGENTS.md` into the runner prompt.
4. Agent writes code on the VPS checkout.
5. Coordinator runs verification.
6. Coordinator pushes the branch to GitHub and opens a PR.
7. GitHub checks run.
8. Approved changes merge through GitHub.
9. Production deploys from the merged GitHub state.

That keeps GitHub as the source of truth even though the coding work happens on the VPS.

## Current Flow

1. File a GitHub issue and label it `agent-ok`.
2. The coordinator (`agent-coordinator.sh`) picks up eligible issues in ascending issue-number order.
3. Claude Code runs on a fresh task branch.
4. The coordinator loads `AGENTS.md` into the runner prompt.
5. The coordinator verifies the result with `npm test` and `npm run build`.
6. A separate read-only reviewer model inspects the issue and diff for correctness, risk, and scope creep.
7. The coordinator opens a PR.
8. Low-risk, reviewer-approved changes can be auto-merged after required checks pass.
9. Changes touching database, secrets, deployment, seeding, or infrastructure are labeled for human review.

The coordinator never pushes to `main` directly and never merges directly.

## Session Discipline

Long agent sessions are expensive because they carry large context forward. The working rule is:

- Use one session for exploration.
- End exploration with a compact task brief.
- Start a fresh implementation session from that brief.
- Start another fresh session for independent review.

The task brief should be short enough to fit in a GitHub issue comment. It should include:

- User goal.
- Files and routes likely involved.
- Known constraints.
- Acceptance criteria.
- Verification commands.
- Risks or areas requiring human review.

This keeps the implementation context focused and avoids paying repeatedly for irrelevant exploratory history.

## Cost Gate

Before launching a long autonomous run, estimate whether the task deserves a frontier model.

Use a cheap or mid-tier model when the task is:

- File search.
- README or issue drafting.
- Mechanical edits.
- Small UI copy changes.
- Test-only updates.
- Dependency-free refactors with narrow scope.

Use a frontier model when the task is:

- Architecture or data-model design.
- Retrieval, ranking, or eval logic.
- User-facing behavior with ambiguous requirements.
- Security, privacy, auth, database, or deployment work.
- A change that needs an independent reviewer before merge.

The target is not "cheapest model always." The target is "cheapest model that can reliably satisfy the written success criteria."

## Success Criteria

Define success before looking at model output. A cheap model succeeded only if:

- The requested behavior is implemented.
- Existing tests pass.
- New tests cover changed behavior when risk justifies it.
- `npm run build` passes.
- The reviewer flags no correctness, scope, or risk issue.
- The PR body clearly explains what changed and how it was verified.

If any of these fail, escalate the task to a stronger model or a human review path.

## Planned Observability

The next instrumentation step is Langfuse, self-hosted on the VPS:

- Log every agent run.
- Capture model, provider, latency, tokens, cost, issue number, branch, verification result, reviewer verdict, and final PR result.
- Compare model tiers against the same written success criteria.
- Route future tasks from the plan output, not keyword matching.

That turns the coding agent from a black box into an evalable system.

## Model Analytics And Routing Roadmap

The first phase should be measurement only. Nothing routes differently until the baseline is visible.

1. **Trace every run:** log cost, latency, tokens, model, task type, issue number, branch, test result, build result, and reviewer verdict.
2. **Write success criteria before output:** define what counts as a successful cheap-model run before reading the model's work.
3. **Classify from the plan:** ask the planning pass for complexity, risk areas, likely files, and verification commands, then route from that structured plan.
4. **Route conservatively:** cheap model for search, README drafting, issue grooming, and mechanical edits; stronger model for architecture, retrieval, evals, security, data, and ambiguous product behavior.
5. **Keep a reviewer lane:** complex or user-facing changes still get an independent review pass.
6. **Add open-weight models after instrumentation:** compare an open-weight local/VPS model on bounded tasks where success can be judged by tests, build, and reviewer outcome.

The useful metric is not whether a model sounded good. The useful metric is whether it shipped a correct, scoped change at lower cost without increasing review failures.
