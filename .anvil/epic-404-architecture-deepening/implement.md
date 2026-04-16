# Implementation Runbook

Now implement epic `#404` end to end.

Do not stop after each unit to ask for confirmation. Proceed through the units in the ExecPlan until the epic is complete or until a real blocker appears that cannot be resolved from the repo and the durable docs alone.

## Read order before work starts

1. `.anvil/epic-404-architecture-deepening/prompt.md`
2. `docs/plans/2026-04-15-001-epic-404-architecture-deepening-execplan.md`
3. `.anvil/epic-404-architecture-deepening/plan.md`
4. `.anvil/epic-404-architecture-deepening/documentation.md`

## Non-negotiable execution rules

- Start from a clean dedicated worktree. If the working tree is dirty with unrelated changes, do not implement in place.
- Treat the ExecPlan as the source of truth for unit order, owned files, verification, and acceptance.
- Keep changes scoped to one implementation unit at a time.
- After each unit:
  - run the targeted tests named in the ExecPlan
  - run `pnpm run build`
  - run `pnpm run lint`
  - run `pnpm run format:check`
  - run `pnpm test`
  - run `pnpm run typecheck` and `pnpm run typecheck:frontend` when route or type boundaries moved substantially
  - repair every failure before advancing
- Update the durable artifacts after each unit:
  - `docs/plans/2026-04-15-001-epic-404-architecture-deepening-execplan.md`
  - `.anvil/epic-404-architecture-deepening/documentation.md`
  - `.anvil/epic-404-architecture-deepening/handoff.md`
  - `.anvil/epic-404-architecture-deepening/closeout.md`
  - `.anvil/epic-404-architecture-deepening/status.json`

## Behavior rules

- Preserve current operator-visible behavior unless the ExecPlan explicitly calls for a compatibility-safe migration.
- Prefer route and port contract tests over internal mock-heavy tests.
- When the live repo and an RFC disagree, trust the live repo and record the difference in the docs before continuing.
- Do not touch the unrelated frontend edits that were present during planning.

## Unit-by-unit mindset

- Units 1 to 3 are cleanup and structure. Keep them mechanical and small.
- Units 4 to 6 establish new ports. Keep old code alive only until callers and tests are switched.
- Units 7 to 9 are the orchestrator migration. Land them in phased steps; do not attempt a single giant rewrite.
- Unit 10 is not optional. The run is not done until the docs and verification prove the final state.

## Bug rule

If a refactor breaks behavior:

1. reproduce it with a failing test or route-contract assertion
2. fix the behavior
3. rerun the targeted suite and the repo gate
4. record the failure and fix in the durable docs

## Completion criteria

Do not stop until all of these are true:

- units 0 through 10 are complete
- the full verification gate is green
- the durable docs match reality
- the run is either ready to ship or explicitly marked blocked with exact reasons and next action
