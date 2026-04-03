---
title: "feat: Persistence recovery bundle"
type: feat
status: ready_for_final_push
date: 2026-04-03
origin: .anvil/persistence-recovery-bundle/requirements.md
review-rounds: 1
review-settlements: 4
audit-rounds: 1
audit-verdict: PASS
dry-run: false
---

# Persistence Recovery Bundle

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `.agents/PLANS.md`.

## Purpose / Big Picture

After this bundle lands, Risoluto should stop silently losing work when a dirty workspace is cleaned up, and it should stop forgetting in-flight attempts after a restart. Operators should be able to restart the service, have viable orphaned attempts resumed onto their existing attempt record, and inspect a recovery report that explains what was resumed, cleaned up, or escalated.

The behavior must be demonstrable in two concrete scenarios. First, a dirty workspace must be auto-committed before removal or preserved if the rescue commit fails. Second, a persisted `running` attempt with a workspace and thread id must be recovered on startup and exposed in a startup recovery report served by HTTP.

## Progress

- [x] 2026-04-03 20:39+03:00 Created fresh `.anvil/persistence-recovery-bundle/` state and recorded the bundle intake.
- [x] 2026-04-03 20:43+03:00 Wrote requirements grounded in the current repo and issue text.
- [x] 2026-04-03 20:47+03:00 Wrote this ExecPlan, settled the core design decisions, and moved the run into execute.
- [x] Implement Unit 1: git-backed workspace rescue commits and preservation-on-failure cleanup semantics.
- [x] Implement Unit 2: startup orphan recovery scan, same-attempt resume, cleanup/escalation paths, and `GET /api/v1/recovery`.
- [x] Implement Unit 3: tests, roadmap/docs updates, claims, and required verification gates.

## Surprises & Discoveries

- Observation: the existing agent runtime already supports `thread/resume` plus `thread/rollback`, so truthful same-thread recovery is possible without inventing a new protocol.
  Evidence: `src/agent-runner/session-init.ts` resumes `previousThreadId` and only falls back to `thread/start` on failure.

- Observation: startup recovery today is only partial hygiene, not attempt recovery.
  Evidence: `src/orchestrator/orchestrator.ts` seeds completed claims and cleans terminal workspaces, but never rehydrates persisted `running` attempts into `runningEntries`.

- Observation: cleanup protection has to live in the workspace layer to cover more than just the post-success PR path.
  Evidence: cleanup happens from terminal outcome handlers, retry reconciliation, and startup terminal cleanup, all of which call `WorkspaceManager.removeWorkspace()`.

## Decision Log

- Decision: treat `#278` as shipped substrate and focus execution on `#319` plus `#346`.
  Rationale: the repo already persists attempt events and checkpoints, so the real remaining user-facing gap is preservation and recovery behavior.
  Date/Author: 2026-04-03 / Codex

- Decision: rescue commits should be recorded as attempt events/checkpoint metadata instead of widening the `AttemptRecord` shape.
  Rationale: it keeps the public attempt schema stable while still writing durable evidence into the attempt store.
  Date/Author: 2026-04-03 / Codex

- Decision: viable startup recovery should reuse the existing attempt row instead of minting a fresh attempt.
  Rationale: resuming the same attempt is the most truthful operator story and best matches the issue requirement to avoid restarting from scratch.
  Date/Author: 2026-04-03 / Codex

- Decision: ambiguous orphan attempts must remain visible in a recovery report rather than being silently retried or silently failed.
  Rationale: active work without a resumable thread id is exactly the case where operators need evidence more than hidden automation.
  Date/Author: 2026-04-03 / Codex

## Outcomes & Retrospective

The bundle shipped the two missing persistence hardening behaviors without widening the public attempt schema. Dirty workspaces are now protected during cleanup, orphaned running attempts are classified and resumed or surfaced truthfully on startup, and the operator-facing recovery report is documented and tested. The run is now waiting only on an explicit final-push step.

## Context and Orientation

`src/workspace/manager.ts` owns workspace creation and deletion for both directory and worktree strategies. Every code path that eventually removes a workspace flows through `removeWorkspace()`, making it the right enforcement point for the `#319` preservation guarantee.

`src/git/manager.ts` is the host-side git abstraction. Today it knows how to clone, create worktrees, commit/push success paths, and open PRs, but it does not expose a small rescue-commit primitive for cleanup-time protection.

`src/orchestrator/worker-launcher.ts` creates attempt rows and running entries, while `src/orchestrator/orchestrator.ts` owns startup sequencing. The important current limitation is that startup seeds completed views but never restores persisted `running` attempts back into runtime control.

`src/agent-runner/session-init.ts` already supports `thread/resume`, which is a Codex protocol call that continues an existing thread. In this repository that means a recovered attempt can continue its previous conversation context if the thread id was already persisted.

The attempt store contract lives in `src/core/attempt-store-port.ts`, with the SQLite implementation in `src/persistence/sqlite/attempt-store-sqlite.ts`. We should preserve the stable `AttemptRecord` shape and instead write recovery/preservation evidence as attempt events and checkpoint metadata.

## Plan of Work

Unit 1 edits `src/git/port.ts`, `src/git/manager.ts`, and `src/workspace/manager.ts`. Add lightweight helpers for `git status --porcelain`, rescue commits with `--no-verify`, and a structured workspace-removal result so callers can tell whether cleanup removed, auto-committed, or preserved the workspace. Update terminal cleanup and any other callers that should surface the result.

Unit 2 adds `src/orchestrator/recovery-types.ts` and `src/orchestrator/recovery.ts`, then wires startup recovery into `src/orchestrator/orchestrator.ts`. The recovery flow should scan persisted running attempts, look up current issue state, check workspace existence, inspect matching containers if available, classify each orphaned attempt, and either resume the same attempt record, clean it up, or escalate it. Store the latest report on the orchestrator and expose it through `src/http/routes.ts`, `src/http/openapi-paths.ts`, and `src/http/response-schemas.ts`.

Unit 2 also updates `src/orchestrator/worker-launcher.ts` so recovered attempts can reuse their existing attempt id, timestamps, thread id, and model selection instead of creating a new attempt row.

Unit 3 updates tests across `tests/workspace/`, `tests/git/`, `tests/orchestrator/`, and `tests/http/`. Then update roadmap/conformance/operator docs plus `EXECPLAN.md` to record the shipped persistence behavior.

## Concrete Steps

From `/home/oruc/Desktop/workspace/risoluto` run:

    pnpm test tests/workspace/manager.test.ts tests/workspace/manager.integration.test.ts tests/git/manager.test.ts tests/orchestrator/recovery.test.ts tests/orchestrator/restart-recovery.integration.test.ts tests/http/recovery-api.integration.test.ts tests/http/openapi-paths.test.ts tests/http/response-schemas-core.test.ts
    pnpm test tests/http/openapi-sync.test.ts
    pnpm run build
    pnpm run lint
    pnpm run format:check
    pnpm run typecheck
    pnpm run typecheck:frontend
    pnpm test

Expected signs of success:

    - workspace manager tests prove dirty workspaces are auto-committed or preserved.
    - recovery tests prove a persisted running attempt is resumed on startup and ambiguous cases appear in the report.
    - build, lint, format, and full test suite succeed without regressions.

## Validation and Acceptance

Acceptance for `#319` is behavioral: create or mock a dirty git-backed workspace, invoke cleanup, and observe either a rescue commit event plus deletion or a preserved workspace when commit fails.

Acceptance for `#346` is behavioral: seed a running attempt in SQLite, restart the orchestrator, and observe that the attempt is either resumed on the same attempt id or reported with an explicit cleanup/escalation reason. `GET /api/v1/recovery` must return that report.

## Idempotence and Recovery

The startup recovery scan must be safe to run repeatedly. Once an attempt is recovered or transitioned out of `running`, a second startup should not duplicate the action. Cleanup protection must be safe to re-run because a preserved workspace should remain on disk until a later cleanup attempt succeeds.

## Artifacts and Notes

This plan intentionally keeps the attempt schema stable and stores recovery evidence in attempt events plus checkpoint metadata. That reduces blast radius across HTTP consumers and existing tests.
