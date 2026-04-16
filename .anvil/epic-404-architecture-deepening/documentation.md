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
- Execution status: complete
- Current phase: Unit 10 final sweep complete
- Next required action: publish the finished branch and hand the run off as complete

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
- Active execution worktree: `/home/oruc/Desktop/workspace/risoluto-worktrees/epic-404-architecture-deepening`
- Active execution branch: `epic-404-architecture-deepening`
- Active execution commit at resume: `d91eb2c`
- Active execution resume timestamp: `2026-04-15T14:56:26Z`
- Active-run marker: `.anvil/ACTIVE_RUN` was missing in this worktree at resume and was restored during Unit 0
- Final pre-closeout commit before durable-artifact sync: `c786282`

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

- The original planning worktree was dirty, so implementation had to move into this clean dedicated worktree.
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

## Execution log

- 2026-04-15T14:56:26Z: Resumed the epic in the dedicated clean worktree, confirmed `git status --short` is empty on branch `epic-404-architecture-deepening`, and started Unit 0 durable-state refresh before any production code changes.
- 2026-04-15T14:59:47Z: Completed Unit 0. The first `pnpm run build` failed because this fresh worktree had no `node_modules` yet (`tsc: command not found`); `pnpm install --frozen-lockfile` fixed the environment and the rerun baseline gate passed with `pnpm run build`, `pnpm run lint`, `pnpm run format:check`, and `pnpm test`.
- 2026-04-15T15:07:14Z: Completed Unit 1 (`#410`). Deleted `src/orchestrator/orchestrator-delegates.ts` and `src/config/builders.ts`, switched remaining callers to direct imports from the real coordinator/config modules, added the intrinsic-churn note to `src/core/types.ts`, and passed the Unit 1 targeted suite plus the full repo gate. The only gate repair needed was formatting `tests/orchestrator/orchestrator-delegates.test.ts`.
- 2026-04-15T15:21:22Z: Completed Unit 2 (`#406`). Moved `serializeSnapshot` into new orchestrator-owned file `src/orchestrator/snapshot-serialization.ts`, moved `sortAttemptsDesc` and `sumAttemptDurationSeconds` into `src/core/attempt-analytics.ts`, converted `src/core/attempt-store-port.ts` into a pure contract module with updated documentation, and moved the serializer/attempt-helper coverage into new direct tests. The only gate repair needed was formatting `tests/http/route-helpers.test.ts`.
- 2026-04-15T15:30:01Z: Completed Unit 3 (`#409`). Added HTTP-owned route modules for config, secrets, prompt templates, audit, and setup under `src/http/routes/`, introduced `src/http/errors.ts` as the shared home for `methodNotAllowed` and `issueNotFound`, rewired `registerExtensionRoutes` to the new modules, deleted the domain-owned `api.ts` files, and passed the route-focused suite plus the full gate including `pnpm run typecheck` and `pnpm run typecheck:frontend`.
- 2026-04-15T16:02:41Z: Completed Unit 4 (`#405`). Added `src/setup/port.ts` as the explicit setup boundary, extended `TrackerPort` with a typed `provision` surface, moved Linear provisioning work out of `setup-service.ts` and into `LinearTrackerAdapter`, added GitHub-backed provisioning for setup smoke-test issue and label creation in `GitHubTrackerAdapter`, updated setup route registration and test harnesses to pass a tracker dependency explicitly, and fixed the one surfaced regression by restoring the legacy `400 no_teams` project-creation response while keeping provisioning inside the tracker layer. Unit 4 targeted verification passed, and the full gate passed with `pnpm run build`, `pnpm run lint`, `pnpm run format:check`, `pnpm run typecheck`, `pnpm run typecheck:frontend`, and `pnpm test`.
- 2026-04-15T16:16:02Z: Completed Unit 5 (`#407`). Added `src/webhook/port.ts`, `src/webhook/service.ts`, `src/webhook/signature.ts`, `src/webhook/http-adapter.ts`, and `src/webhook/index.ts`; re-pointed webhook composition, HTTP route types, route registration, and test harnesses to the webhook-owned boundary; and deleted `src/http/webhook-handler.ts` plus `src/http/github-webhook-handler.ts`. Unit 5 targeted verification passed, and the full gate passed with `pnpm run build`, `pnpm run lint`, `pnpm run format:check`, `pnpm run typecheck`, `pnpm run typecheck:frontend`, and `pnpm test`.
- 2026-04-15T16:26:18Z: Completed Unit 6 (`#408`). Added `src/agent-runner/session-port.ts` as the explicit `AgentSessionPort` boundary, migrated `src/agent-runner/attempt-executor.ts`, `src/agent-runner/index.ts`, and `src/agent-runner/docker-runtime.ts` to the new session vocabulary, retained `src/agent-runner/codex-runtime-port.ts` as a compatibility barrel for incremental callers, and added `tests/agent-runner/agent-session-port.test.ts` to verify the public session seam directly. Unit 6 targeted verification passed, and the full gate passed with `pnpm run build`, `pnpm run lint`, `pnpm run format:check`, `pnpm test`, `pnpm run typecheck`, and `pnpm run typecheck:frontend`.
- 2026-04-15T17:05:21Z: Completed Unit 7 (`#402` Phase A). Added `src/orchestrator/core/dispatch.ts`, `src/orchestrator/core/retry-policy.ts`, `src/orchestrator/core/lifecycle-state.ts`, and `src/orchestrator/core/snapshot-projection.ts`; rewired `src/orchestrator/dispatch.ts`, `src/orchestrator/retry-policy.ts`, `src/orchestrator/issue-view-builders.ts`, `src/orchestrator/outcome-view-builder.ts`, `src/orchestrator/snapshot-builder.ts`, and `src/orchestrator/lifecycle.ts` to those core helpers; and added `tests/orchestrator/lifecycle-core.test.ts` plus `tests/orchestrator/snapshot-projection.test.ts` for the new pure scaffolding. Unit 7 targeted verification passed, the first full-gate build caught one stale `ReturnType<typeof issueView>` wrapper type in `src/orchestrator/outcome-view-builder.ts`, `format:check` then surfaced the four new files for a one-time Prettier pass, and the rerun full gate passed with `pnpm run build`, `pnpm run lint`, `pnpm run format:check`, `pnpm run typecheck`, `pnpm run typecheck:frontend`, and `pnpm test`.
- 2026-04-15T17:27:21Z: Completed Unit 8 (`#402` Phase B). Expanded `src/orchestrator/core/lifecycle-state.ts` so `LifecycleState` now describes the live runtime collections and mutation helpers, switched `src/orchestrator/orchestrator.ts` to build runtime state via `createLifecycleState`, switched `src/orchestrator/snapshot-builder.ts` to expose `createRuntimeReadModelFromState`, rewired `src/orchestrator/run-lifecycle-coordinator.ts` to mutate and project through the new core state helpers, and tied `src/orchestrator/context.ts` to the lifecycle-state vocabulary. Unit 8 targeted verification passed; the first full-gate build caught explicit-typing gaps in `buildContext()`, the first full `pnpm test` pass then surfaced an `operatorAbortSuppressions` fixture assumption in `tests/orchestrator/worker-outcome-invariants.test.ts`, and the rerun full gate passed with `pnpm run build`, `pnpm run lint`, `pnpm run format:check`, `pnpm run typecheck`, `pnpm run typecheck:frontend`, and `pnpm test`.
- 2026-04-15T17:43:22Z: Completed Unit 9 (`#402` Phase C). Added a typed `executeCommand` surface to `src/orchestrator/port.ts` and `src/orchestrator/orchestrator.ts`, routed `src/http/model-handler.ts`, `src/http/template-override-handler.ts`, `src/http/transition-handler.ts`, `src/http/trigger-handler.ts`, `src/http/routes/issues.ts`, and `src/http/routes/system.ts` through that command path with compatibility fallbacks for older stubs, and kept the route contracts stable while the mutating orchestrator calls converged on one command surface. Unit 9 targeted verification passed, and the rerun full gate passed with `pnpm run build`, `pnpm run lint`, `pnpm run format:check`, `pnpm run typecheck`, `pnpm run typecheck:frontend`, and `pnpm test`.
- 2026-04-15T20:13:41Z: Completed Unit 10 final sweep. Re-cut the finished work into atomic commits, fixed the one closeout-only proof flake in `tests/cli/bootstrap.test.ts` by giving the heavy dynamic import a realistic timeout, and reran the full repo gate successfully: `pnpm run build`, `pnpm run lint`, `pnpm run format:check`, `pnpm run typecheck`, `pnpm run typecheck:frontend`, and `pnpm test`.
