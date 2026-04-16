# Epic 404 Documentation

This document is updated continuously so it reflects the current state of the long-horizon run.

## What this run is

Epic `#404` is the next architecture-deepening pass for Risoluto. It bundles seven linked refactors:

- `#410` remove stale compat shims and document intrinsic churn
- `#406` clean up persistence and snapshot serialization layering
- `#409` finish the move to `src/http/routes/`
- `#405` collapse setup behind `SetupPort` and `TrackerPort.provision`
- `#407` collapse webhook behavior behind `WebhookPort`
- `#408` expose agent execution behind `AgentSessionPort`
- `#402` refactor the orchestrator toward a lifecycle core plus shell with a unified command path

## Status

- Planning status: complete
- Execution status: not started
- Current phase: pre-implementation bootstrap
- Next required action: create a clean dedicated worktree and begin Unit 0

## Implementation order

1. Worktree bootstrap
2. `#410`
3. `#406`
4. `#409`
5. `#405`
6. `#407`
7. `#408`
8. `#402` Phase A
9. `#402` Phase B
10. `#402` Phase C
11. Final sweep

## Local setup

- Repository root: `/home/oruc/Desktop/workspace/risoluto`
- Planning branch at time of artifact creation: `architecture-deepening-closeout`
- Planning commit at time of artifact creation: `3f723ea`
- Warning: the planning worktree was already dirty in unrelated frontend files, so implementation must start in a clean dedicated worktree

Suggested bootstrap:

    git worktree add ../risoluto-worktrees/epic-404-architecture-deepening -b epic-404-architecture-deepening HEAD
    cd ../risoluto-worktrees/epic-404-architecture-deepening
    git status --short

## Verification commands

- Baseline gate after each unit:
  - `pnpm run build`
  - `pnpm run lint`
  - `pnpm run format:check`
  - `pnpm test`
- Additional gate when route or type ownership changes broadly:
  - `pnpm run typecheck`
  - `pnpm run typecheck:frontend`

## High-signal files to understand first

- `docs/plans/2026-04-15-001-epic-404-architecture-deepening-execplan.md`
- `src/orchestrator/`
- `src/setup/`
- `src/webhook/`
- `src/agent-runner/`
- `src/http/routes.ts` and `src/http/routes/`
- `src/tracker/port.ts`

## Key risks

- The current worktree is dirty, so implementation in place would risk collateral edits.
- `#402` is large and must stay phased. A big-bang rewrite would be hard to verify.
- Setup and webhook refactors must preserve HTTP contract behavior, not just compile.
- The repo already has good coverage, so replacing internal tests with weaker coverage would be a regression even if the code becomes cleaner.

## Durable artifact contract

At every meaningful checkpoint, refresh:

- `docs/plans/2026-04-15-001-epic-404-architecture-deepening-execplan.md`
- `.anvil/epic-404-architecture-deepening/handoff.md`
- `.anvil/epic-404-architecture-deepening/closeout.md`
- `.anvil/epic-404-architecture-deepening/status.json`

## Notes from planning

- `src/http/routes/` already exists and should be extended for `#409`.
- The setup subsystem already has tests, but many of them are wrapper-oriented and should be consolidated around `SetupPort`.
- The long-horizon run should optimize for inspectability: plan, execute, verify, update docs, continue.
