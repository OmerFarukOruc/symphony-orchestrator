# Intake -- Persistence Recovery Bundle

## Request

User request on 2026-04-03: use the repo-local `anvil-risoluto` workflow for the Persistence (3) bundle:

- [#278](https://github.com/OmerFarukOruc/risoluto/issues/278) -- Execution replay system with phase-aware event recording
- [#319](https://github.com/OmerFarukOruc/risoluto/issues/319) -- Pre-cleanup commit enforcement to prevent silent work loss
- [#346](https://github.com/OmerFarukOruc/risoluto/issues/346) -- Crash recovery system for orphaned sessions and workspaces

## Source Bundle Reality

- `#278` is already shipped in the current repo and roadmap docs. It stays in this bundle as shipped context and as a dependency surface for recovery/replay, not as new implementation scope.
- `#319` and `#346` are still meaningful gaps. Both sit on the same seam: persisted attempt state, workspaces, and what happens when Risoluto loses control of an in-flight session.

## Why These Issues Belong Together

The bundle is coherent around one user-facing failure mode: work that was already in progress should remain inspectable and recoverable after crashes, timeouts, or cleanup. `#319` prevents accidental deletion of dirty workspaces. `#346` uses the persisted attempt and checkpoint substrate from `#278` and `#375` to classify orphaned sessions and either resume, clean up, or escalate them.

## Current Repo Reality

- Attempt rows, event streams, and checkpoint history already exist in SQLite and are exposed via HTTP detail endpoints.
- `WorkspaceManager.removeWorkspace()` deletes directories and worktrees today without a last-chance commit preservation pass.
- Startup recovery currently does terminal workspace cleanup plus attempt seeding for the dashboard, but does not reconcile `running` attempts back into orchestrator control.
- The agent runtime already supports `thread/resume` and `thread/rollback`, which gives us a truthful way to continue a crashed attempt without starting a brand-new thread from scratch.

## Likely Touched Areas

- `src/workspace/manager.ts`
- `src/git/manager.ts`
- `src/git/port.ts`
- `src/orchestrator/worker-launcher.ts`
- `src/orchestrator/orchestrator.ts`
- `src/orchestrator/recovery.ts`
- `src/orchestrator/recovery-types.ts`
- `src/docker/lifecycle.ts`
- `src/http/routes.ts`
- `src/http/openapi-paths.ts`
- `src/http/response-schemas.ts`
- `tests/workspace/manager*.test.ts`
- `tests/git/manager.test.ts`
- `tests/orchestrator/*.test.ts`
- `docs/ROADMAP_AND_STATUS.md`
- `docs/CONFORMANCE_AUDIT.md`
- `EXECPLAN.md`

## Run Slug

`persistence-recovery-bundle`
