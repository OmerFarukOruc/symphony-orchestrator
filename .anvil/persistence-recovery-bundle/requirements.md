# Persistence Recovery Bundle

## Problem Frame

Risoluto already persists attempt history, event streams, and checkpoint timelines, but it still has two persistence failures that matter in production. First, a dirty workspace can be deleted after a failed or interrupted run without preserving the agent's local changes. Second, a process restart leaves `running` attempts behind in SQLite without a first-class recovery pass that decides whether those attempts should be resumed, cleaned up, or escalated.

This bundle should leave Risoluto with a truthful crash-recovery story: if a workspace contains uncommitted changes, cleanup must preserve them; if startup finds orphaned attempts, the orchestrator must classify them using persisted state plus current workspace/runtime evidence and take an explicit action instead of silently forgetting them.

## Requirements

- **R1.** Preserve the already-shipped replay and checkpoint substrate from `#278` and `#375`; new work must build on it instead of replacing it.
- **R2.** Before removing a git-backed workspace, Risoluto must check for uncommitted changes using a fast porcelain-status path.
- **R3.** If changes exist, Risoluto must stage and auto-commit them with a traceable message that includes the issue identifier.
- **R4.** Auto-commit must skip git hooks so cleanup protection does not fail just because lint or format hooks would reject a rescue commit.
- **R5.** If the rescue commit fails, the workspace must be preserved and cleanup must stop rather than silently deleting the worktree or directory.
- **R6.** When cleanup protection fires, Risoluto must record durable attempt-store evidence describing what happened, including the rescue commit SHA on success and the preservation reason on failure.
- **R7.** On orchestrator startup, Risoluto must scan persisted `running` attempts before the normal polling loop proceeds.
- **R8.** Recovery classification must consider, at minimum: current tracker state, whether the workspace still exists, whether the attempt has a resumable thread id, and whether a matching sandbox container is still present.
- **R9.** If an issue is still active, the workspace exists, and the attempt has a resumable thread id, Risoluto must recover that attempt onto the same attempt record instead of starting a brand-new thread from scratch.
- **R10.** If an orphaned attempt is not recoverable, Risoluto must mark it terminal with a reason and run safe cleanup, benefiting from the new pre-cleanup commit enforcement.
- **R11.** Ambiguous cases such as active workspaces without a resumable thread id must be surfaced explicitly in a recovery report instead of being silently discarded.
- **R12.** The latest startup recovery report must be logged and retrievable from an HTTP API endpoint.
- **R13.** Unit and integration tests must cover the happy and unhappy paths for dirty-workspace cleanup, startup recovery classification, attempt resumption, cleanup-only recovery, and report exposure.
- **R14.** Operator-facing docs and roadmap status must reflect that `#319` and `#346` are shipped if this bundle completes.

## Success Criteria

- A failed attempt with dirty workspace files produces an auto-commit before cleanup, and the attempt history contains durable evidence of the rescue commit.
- A dirty workspace with a forced commit failure is left on disk, and the completed view/report clearly says the workspace was preserved for inspection.
- A persisted `running` attempt with an existing workspace and thread id is resumed on startup without creating a fresh conversation thread.
- A persisted `running` attempt that is no longer viable is marked terminal with an explicit reason, and its workspace is safely cleaned or preserved according to the cleanup result.
- `GET /api/v1/recovery` returns the most recent recovery report with per-attempt decisions.

## Scope Boundaries

- No frontend UI work is required for this bundle.
- No new replay viewer is in scope because `#278` is already shipped.
- No periodic background recovery scanner is required; startup recovery is the required minimum.
