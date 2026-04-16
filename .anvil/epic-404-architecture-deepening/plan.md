# Plan

This file is the short-form execution index for the long-horizon epic `#404` run.

The full source of truth is:

- `docs/plans/2026-04-15-001-epic-404-architecture-deepening-execplan.md`

Use this file for quick orientation, then open the ExecPlan for exact files, tests, and acceptance details.

## Mission

Deepen architecture boundaries across setup, webhook, agent execution, HTTP route ownership, persistence hygiene, compat churn, and the orchestrator lifecycle engine without changing operator-visible behavior.

## Ordered units

1. Unit 0 — bootstrap a clean dedicated worktree
2. Unit 1 — `#410` retire compat shims and document intrinsic churn
3. Unit 2 — `#406` persistence hygiene
4. Unit 3 — `#409` relocate domain `api.ts` files into `src/http/routes/`
5. Unit 4 — `#405` `SetupPort` plus `TrackerPort.provision`
6. Unit 5 — `#407` `WebhookPort`
7. Unit 6 — `#408` `AgentSessionPort`
8. Unit 7 — `#402` Phase A, orchestrator core scaffolding
9. Unit 8 — `#402` Phase B, drive live runtime transitions through the core
10. Unit 9 — `#402` Phase C, unify operator commands and delete duplicate contexts
11. Unit 10 — final regression sweep and closeout

## Operating rules

- Read the prompt, ExecPlan, implement runbook, and documentation log before editing.
- Update the ExecPlan `Progress`, `Surprises & Discoveries`, and `Decision Log` sections as reality changes.
- Update `.anvil/epic-404-architecture-deepening/documentation.md`, `handoff.md`, `closeout.md`, and `status.json` at every meaningful checkpoint.
- Run targeted tests first, then the repo gate.
- If a bug appears, write or update the failing test first, fix it, and log the discovery.

## Verification gate

Minimum gate after each completed unit:

    pnpm run build
    pnpm run lint
    pnpm run format:check
    pnpm test

Additional gate when type-heavy or route-heavy work lands:

    pnpm run typecheck
    pnpm run typecheck:frontend

## Final acceptance

The run is only complete when:

- all units are done
- the full gate is green
- setup, webhook, agent-runner, orchestrator, and HTTP route contract coverage remain green
- the durable docs describe reality precisely enough for a fresh session to continue without hidden context
