# Handoff

## Current State

- Run: `epic-404-architecture-deepening`
- Phase: planning (`completed`)
- Loop state: paused
- Next required action: create a clean dedicated worktree, open the durable docs in the documented order, and begin Unit 0

## What Changed

The epic now has a durable long-horizon execution stack instead of a chat-only plan. The epic and all child RFCs were reviewed against the live repo, a repo-visible ExecPlan was written, and a matching `.anvil` run package was created with prompt, plan, implementation runbook, status log, and closeout artifacts.

## Open First

1. `docs/plans/2026-04-15-001-epic-404-architecture-deepening-execplan.md`
   Reason: full source of truth for sequence, files, tests, and acceptance.
2. `.anvil/epic-404-architecture-deepening/prompt.md`
   Reason: frozen scope and behavioral guardrails for the long-running implementation.
3. `.anvil/epic-404-architecture-deepening/implement.md`
   Reason: execution loop and artifact-update rules.
4. `.anvil/epic-404-architecture-deepening/documentation.md`
   Reason: concise current-state log and bootstrap warning.

## Evidence

- Epic `#404` and child issues `#402`, `#405`, `#406`, `#407`, `#408`, `#409`, `#410` were read.
- Current repo structure for `src/orchestrator/`, `src/setup/`, `src/webhook/`, `src/agent-runner/`, `src/http/routes/`, and `tests/` was audited.
- Current planning baseline recorded:
  - Branch: `architecture-deepening-closeout`
  - Commit: `3f723ea`
  - Worktree: dirty in unrelated frontend files

## Open Risk

- Implementation must not run in the original dirty worktree.
- The orchestrator refactor (`#402`) is intentionally staged and should not be collapsed into one rewrite.
- Setup, webhook, and route relocation work must preserve HTTP behavior and existing contract coverage.

## Resume Here

Create a clean worktree and branch for the run, then update `status.json` and `documentation.md` with the new path and start Unit 0. Do not begin code changes in the original dirty tree.
