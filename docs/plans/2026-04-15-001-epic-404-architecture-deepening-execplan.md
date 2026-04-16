# Implement Epic #404 Next-wave Architecture Deepening

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `.agents/PLANS.md`.

## Purpose / Big Picture

Epic [#404](https://github.com/OmerFarukOruc/risoluto/issues/404) is the next boundary-deepening pass for Risoluto's core runtime. After this work is complete, setup will no longer silently assume Linear when GitHub is configured, webhook handling will have one cohesive service boundary, agent execution will have a real session port instead of a Docker-shaped surface, HTTP route registration for domain modules will live under `src/http/routes/`, and the orchestrator will move toward a pure-core-plus-shell design with a unified operator command path.

The user-visible promise is stability, not new surface area. Operators should still use the same setup wizard, API routes, webhook endpoints, and orchestration flows, but the code behind them should become easier to navigate, easier to test, and safer to extend for roadmap items like executor pluggability and non-Linear tracker support. The proof is behavioral parity plus better tests: existing route and integration contracts stay green while mock-heavy or file-hop-heavy internals are replaced by boundary-focused suites.

## Progress

- [x] (2026-04-15 14:36Z) Reviewed epic `#404` and the child RFCs `#402`, `#405`, `#406`, `#407`, `#408`, `#409`, and `#410`.
- [x] (2026-04-15 14:36Z) Reviewed the long-horizon Codex durable-memory pattern from the Design Desk example and distilled the required artifact roles: frozen spec, source-of-truth plan, execution runbook, and continuously updated status log.
- [x] (2026-04-15 14:36Z) Audited the current repo layout for the affected subsystems under `src/`, `tests/`, and `src/http/routes/`.
- [x] (2026-04-15 14:36Z) Created the durable planning stack under `.anvil/epic-404-architecture-deepening/` plus this repo-visible ExecPlan so a fresh Codex session can resume without hidden chat context.
- [x] (2026-04-15 14:59Z) Resumed execution in dedicated clean worktree `/home/oruc/Desktop/workspace/risoluto-worktrees/epic-404-architecture-deepening`, restored truthful `.anvil` run-state markers, and completed the Unit 0 baseline gate (`build`, `lint`, `format:check`, `test`) on branch `epic-404-architecture-deepening`.
- [x] Unit 0: create a clean implementation worktree and baseline the current branch, status, and test state before code changes.
- [x] (2026-04-15 15:07Z) Completed Unit 1 (`#410`) by deleting `src/orchestrator/orchestrator-delegates.ts` and `src/config/builders.ts`, repointing the remaining callers to `run-lifecycle-coordinator.ts`, `derivation-pipeline.ts`, and `section-builders.ts`, and documenting `src/core/types.ts` as an intentional high-fanout barrel.
- [x] Unit 1: implement `#410` by removing stale compat shims and documenting `src/core/types.ts` churn as intrinsic.
- [x] (2026-04-15 15:21Z) Completed Unit 2 (`#406`) by moving `serializeSnapshot` into `src/orchestrator/snapshot-serialization.ts`, moving attempt ordering/duration helpers into `src/core/attempt-analytics.ts`, removing the dead JSONL wording from `src/core/attempt-store-port.ts`, and repointing runtime plus test callers to the new ownership boundaries.
- [x] Unit 2: implement `#406` by relocating snapshot serialization and attempt analytics helpers to correct layers.
- [x] (2026-04-15 15:30Z) Completed Unit 3 (`#409`) by moving the config, secrets, prompt, audit, and setup adapters into `src/http/routes/`, introducing `src/http/errors.ts` for shared HTTP error helpers, updating extension-route wiring to the new modules, and deleting the domain-owned `api.ts` files.
- [x] Unit 3: implement `#409` by relocating domain HTTP adapters into `src/http/routes/` and introducing `src/http/errors.ts`.
- [x] (2026-04-15 16:02Z) Completed Unit 4 (`#405`) by introducing `src/setup/port.ts`, routing setup provisioning through `TrackerPort.provision`, moving Linear provisioning logic into `LinearTrackerAdapter`, adding GitHub-safe provisioning behavior in `GitHubTrackerAdapter`, wiring setup routes to require a tracker dependency, and restoring the legacy `400 no_teams` project-creation contract after the first green-to-red full-suite pass exposed the regression.
- [x] Unit 4: implement `#405` by extending `TrackerPort` with provisioning and collapsing setup behind a `SetupPort`.
- [x] (2026-04-15 16:16Z) Completed Unit 5 (`#407`) by introducing `src/webhook/port.ts` and `src/webhook/service.ts`, moving the Linear and GitHub webhook HTTP adapters under `src/webhook/http-adapter.ts`, moving signature verification under `src/webhook/signature.ts`, deleting `src/http/webhook-handler.ts` and `src/http/github-webhook-handler.ts`, and rewiring route types, composition, and tests to the webhook-owned boundary while preserving the existing `/webhooks/*` contracts.
- [x] Unit 5: implement `#407` by introducing `WebhookPort` and collapsing the three-layer webhook wrapper stack.
- [x] (2026-04-15 16:26Z) Completed Unit 6 (`#408`) by introducing `src/agent-runner/session-port.ts` as the agent-session boundary, migrating `attempt-executor.ts`, `index.ts`, and `docker-runtime.ts` to the new `AgentSessionPort`/`AgentSession` vocabulary, keeping `codex-runtime-port.ts` as a compatibility barrel for incremental callers, and adding `tests/agent-runner/agent-session-port.test.ts` so the new seam is exercised directly without going through Docker-session internals.
- [x] Unit 6: implement `#408` by introducing `AgentSessionPort` and replacing the `docker-session` mock-heavy test surface.
- [x] (2026-04-15 17:05Z) Completed Unit 7 (`#402` Phase A) by introducing `src/orchestrator/core/` with dispatch, retry-policy, lifecycle-state, and snapshot-projection scaffolding; rewiring the existing orchestrator helper modules to those pure core functions; adding reducer-style tests for queue/detail projection and completed-claim seeding; and preserving the live shell behavior behind the existing runtime coordinator.
- [x] Unit 7: implement `#402` Phase A by extracting orchestrator pure helpers and defining `LifecycleState` / reducer scaffolding behind the existing shell.
- [x] (2026-04-15 17:27Z) Completed Unit 8 (`#402` Phase B) by making `LifecycleState` the live runtime state shape, constructing the orchestrator shell state through `createLifecycleState`, routing the runtime read model through `createRuntimeReadModelFromState`, wiring coordinator mutations through the new core state helpers, and keeping the public orchestrator/HTTP contracts stable while the live runtime adopted the Phase A vocabulary.
- [x] Unit 8: implement `#402` Phase B by routing orchestrator state transitions and snapshot projection through the new core.
- [x] (2026-04-15 17:43Z) Completed Unit 9 (`#402` Phase C) by adding a typed `executeCommand` surface to `OrchestratorPort`, routing the issue/model/template/transition/trigger/system HTTP mutators through that unified command path with compatibility fallbacks for older test doubles, and collapsing the remaining operator-write logic onto shared orchestrator command handlers while keeping route contracts stable.
- [x] Unit 9: implement `#402` Phase C by unifying mutating commands, deleting duplicate context layers, and finishing caller migration.
- [x] (2026-04-15 20:13Z) Completed Unit 10 final sweep by regrouping the shipped tree into atomic commits, fixing the one closeout-only CLI bootstrap timeout flake, rerunning the full repo gate, and refreshing every durable `.anvil` artifact plus this ExecPlan for final handoff.
- [x] Unit 10: run the final regression sweep, update docs, and refresh all durable run artifacts.

## Surprises & Discoveries

- Observation: the repo already has an established `src/http/routes/` module pattern.
  Evidence: `src/http/routes.ts` already mounts `codex`, `extensions`, `git`, `issues`, `notifications`, `system`, `webhooks`, and `workspaces` route modules, so `#409` should extend an existing pattern rather than invent a new one.

- Observation: the dedicated implementation worktree did not have `node_modules` installed yet, so the first Unit 0 build failed on missing `tsc`.
  Evidence: `pnpm run build` initially exited with `sh: line 1: tsc: command not found` plus `Local package.json exists, but node_modules missing`; rerunning after `pnpm install --frozen-lockfile` produced a green baseline gate.

- Observation: the only Unit 1 gate failure was a formatting miss in the rewritten orchestrator compatibility test after swapping imports from the deleted shim to the real coordinator.
  Evidence: `pnpm run format:check` failed on `tests/orchestrator/orchestrator-delegates.test.ts`; running `pnpm exec prettier --write tests/orchestrator/orchestrator-delegates.test.ts` fixed it and the rerun gate passed.

- Observation: the only Unit 2 gate failure was a formatting miss in the trimmed HTTP helper test after moving snapshot serialization coverage into its new orchestrator-owned suite.
  Evidence: `pnpm run format:check` failed on `tests/http/route-helpers.test.ts`; running `pnpm exec prettier --write tests/http/route-helpers.test.ts` fixed it and the rerun gate passed.

- Observation: the setup subsystem already has dedicated tests, but the current test shape is still too handler-centric.
  Evidence: the repo contains `tests/setup/setup-service.test.ts` plus many per-handler files such as `tests/setup/project-handler.test.ts`, `tests/setup/openai-key-handler.test.ts`, and `tests/setup/handlers.integration.test.ts`. The real problem is not “zero tests,” it is “wrong boundary plus duplicated wrapper tests.”

- Observation: the first Unit 4 full-suite pass changed one long-standing setup contract even though the new port wiring itself was correct.
  Evidence: `tests/setup/project-handler.test.ts` and `tests/setup/project-handler-extended.test.ts` failed because the new tracker-owned project creation surfaced “no teams found” as a generic `502 linear_api_error` instead of the historical `400 no_teams`; the fix was to preserve that HTTP contract in `setup-service.ts` while keeping tracker provisioning inside the adapters.

- Observation: deleting the HTTP-owned webhook handler modules was less risky than it first looked because the real contract surface was mostly import ownership, not behavior logic.
  Evidence: after moving the handlers to `src/webhook/http-adapter.ts` and deleting `src/http/webhook-handler.ts` plus `src/http/github-webhook-handler.ts`, the webhook-targeted suites and the full `pnpm test` gate both stayed green once route types, harness imports, and signature exports were repointed.

- Observation: the agent-runner already had a workable session abstraction, but it was hidden behind Codex-runtime naming rather than an explicit agent-session contract.
  Evidence: Unit 6 landed mostly as a boundary-lifting refactor: `DefaultAttemptExecutor` and `AgentRunner` now depend on `AgentSessionPort`, while `codex-runtime-port.ts` became a compatibility re-export layer so the rest of the repo could stay stable during the migration.

- Observation: the first Unit 7 build caught a stale type reference that the targeted suites did not exercise, and the new core files needed one dedicated Prettier pass before the repo gate was fully green.
  Evidence: `pnpm run build` initially failed in `src/orchestrator/outcome-view-builder.ts` because the wrapper still referenced `ReturnType<typeof issueView>` after the projection moved into `src/orchestrator/core/snapshot-projection.ts`; after fixing that type and formatting the four new core/test files, `build`, `lint`, `format:check`, `typecheck`, `typecheck:frontend`, and `pnpm test` all passed.

- Observation: Unit 8’s targeted suites stayed green, but the full gate still found two important runtime assumptions that only the wider repo surface exercised.
  Evidence: the first Unit 8 full-gate pass exposed `buildContext()` typing holes after the new lifecycle-state wiring, then the first `pnpm test` pass surfaced an operator-abort regression in `tests/orchestrator/worker-outcome-invariants.test.ts` because some older fixtures did not initialize `operatorAbortSuppressions`; making the launch context explicit and restoring the null-safe suppression path fixed the failures and the rerun full gate passed.

- Observation: Unit 9 could move the real server path onto a unified command surface without forcing a big-bang mock migration, as long as the HTTP adapters kept a short compatibility fallback for older test doubles.
  Evidence: the real `Orchestrator` now exposes `executeCommand(...)`, while the HTTP handlers and routes prefer that path but fall back to the older method surface when a stub lacks the new method; this let the targeted HTTP suites and the full `pnpm test` gate stay green while still proving the live path through the new command surface.

- Observation: the current worktree is already dirty in unrelated frontend files.
  Evidence: `git status --short` before this planning pass showed modifications under `frontend/src/` and related tests that are outside epic `#404`. Execution must not revert or absorb those changes accidentally.

- Observation: `src/http/routes/` exists, but five domain-owned `api.ts` files still register their own Express bindings.
  Evidence: `src/config/api.ts`, `src/secrets/api.ts`, `src/prompt/api.ts`, `src/audit/api.ts`, and `src/setup/api.ts` still exist alongside the route directory, so the codebase currently mixes the old and new routing patterns.

- Observation: the branch is already `architecture-deepening-closeout`, which is semantically related to the epic but not a clean execution environment.
  Evidence: `git branch --show-current` returned `architecture-deepening-closeout` while the worktree was non-clean. A dedicated worktree is safer than running the full long-horizon implementation directly here.

- Observation: the only failing proof in the final full-suite closeout was not a product regression but a timeout in `tests/cli/bootstrap.test.ts` while dynamically importing the heavy `src/cli/index.ts` module.
  Evidence: `pnpm test` failed only on `tests/cli/bootstrap.test.ts > rejects invalid --port values before startup` with the default 5s Vitest timeout; increasing the timeout for the three dynamic-import assertions removed the flake and the rerun full gate passed.

## Decision Log

- Decision: create both a repo-visible ExecPlan and an `.anvil/epic-404-architecture-deepening/` run package.
  Rationale: the repo needs a human-readable long-term plan, while a later long-running Codex session needs prompt, runbook, status, and handoff artifacts it can reopen repeatedly without chat history.
  Date/Author: 2026-04-15 / OpenAI Codex

- Decision: sequence the single-thread implementation as `#410` -> `#406` -> `#409` -> `#405` -> `#407` -> `#408` -> `#402`.
  Rationale: the epic issue suggested running `#402` independently in parallel, but this run is intentionally a single long-horizon implementation pass. Landing the smaller cleanups and supporting ports first shrinks the surface and gives the orchestrator refactor cleaner seams to target.
  Date/Author: 2026-04-15 / OpenAI Codex

- Decision: preserve current operator-visible behavior unless a child RFC explicitly changes it, and prove parity with existing HTTP, setup, webhook, and orchestrator contract tests before broad internal deletions.
  Rationale: this epic is architectural deepening, not product redesign. Behavior drift would make the large refactor harder to trust and harder to review.
  Date/Author: 2026-04-15 / OpenAI Codex

- Decision: start implementation in a dedicated clean worktree rather than the current dirty tree.
  Rationale: the existing worktree contains unrelated frontend edits. A long autonomous session should isolate itself to avoid merge confusion and accidental reversions.
  Date/Author: 2026-04-15 / OpenAI Codex

- Decision: treat `src/core/types.ts` churn as documented intrinsic churn rather than another barrel-removal refactor.
  Rationale: epic `#410` already distinguishes avoidable churn from intrinsic high-fanout churn. Replacing the barrel would explode touch points across ~123 importers for little gain.
  Date/Author: 2026-04-15 / OpenAI Codex

- Decision: preserve setup route error semantics in the setup service even after moving provider-specific work into tracker adapters.
  Rationale: tracker adapters should own provisioning behavior, but route-visible status codes and error codes such as `missing_api_key`, `missing_project`, and `no_teams` remain part of the setup HTTP contract and should not drift just because the implementation boundary deepened.
  Date/Author: 2026-04-15 / OpenAI Codex

- Decision: keep the closeout-only CLI fix as a standalone proof commit instead of folding it into the architecture slices.
  Rationale: the timeout adjustment is independent from the epic's runtime boundary work, so a dedicated test commit keeps the implementation history easier to audit.
  Date/Author: 2026-04-15 / OpenAI Codex

## Outcomes & Retrospective

Execution is complete through Unit 10. The run landed the smaller support-boundary cleanups (`#410`, `#406`, `#409`, `#405`, `#407`, `#408`), completed all three orchestrator phases, and then closed with a green full-gate sweep plus durable artifact refresh.

The staged plan paid off exactly the way it was supposed to. Unit 7 created the vocabulary, Unit 8 moved the live runtime onto it, and Unit 9 let the write paths converge on a single command surface without redesigning the public API or the tests all at once. Unit 10 then proved the whole tree, exposed one small CLI test-timeout flake, and closed the run with an honest atomic commit history instead of a fake unit-by-unit split.

## Context and Orientation

The affected subsystems live in a handful of concentrated directories.

`src/orchestrator/` is the execution spine. It owns polling, dispatch, retries, snapshot projection, worker outcome handling, and recovery. The current public surface is `src/orchestrator/port.ts`, while the implementation is still spread across files such as `orchestrator.ts`, `run-lifecycle-coordinator.ts`, `context.ts`, `lifecycle.ts`, `dispatch.ts`, `retry-policy.ts`, `retry-coordinator.ts`, `stall-detector.ts`, `snapshot-builder.ts`, `issue-view-builders.ts`, `outcome-view-builder.ts`, and several worker-outcome test files under `tests/orchestrator/`.

`src/setup/` currently mixes an oversized `setup-service.ts` with route files, per-endpoint handler wrappers, and tracker-specific Linear calls. The relevant files are `src/setup/setup-service.ts`, `src/setup/api.ts`, `src/setup/setup-handlers.ts`, `src/setup/repo-route-handlers.ts`, and the wrapper files under `src/setup/handlers/`. The test surface is large and fragmented across `tests/setup/*.test.ts`, `tests/http/setup-api.integration.test.ts`, and `tests/frontend/setup-wizard.test.ts`.

`src/webhook/` holds the webhook runtime pieces, but the HTTP-specific handlers still live in `src/http/webhook-handler.ts` and `src/http/github-webhook-handler.ts`. The current internal layers are `src/webhook/composition.ts`, `src/webhook/runtime.ts`, `src/webhook/registrar.ts`, `src/webhook/delivery-workflow.ts`, and `src/webhook/health-tracker.ts`, with tests spread across `tests/webhook/*.test.ts` and `tests/http/*webhook*.test.ts`.

`src/agent-runner/` owns Codex execution. The key file for epic `#408` is `src/agent-runner/docker-session.ts`, supported by helpers such as `session-init.ts`, `session-helpers.ts`, `notification-handler.ts`, `turn-state.ts`, `helpers.ts`, and `preflight.ts`. The focal test is `tests/agent-runner/docker-session.test.ts`, backed by `tests/orchestrator/worker-launcher.test.ts`.

`src/http/` already has a route-module pattern through `src/http/routes/`, but the old domain-owned adapters remain in `src/config/api.ts`, `src/secrets/api.ts`, `src/prompt/api.ts`, `src/audit/api.ts`, and `src/setup/api.ts`. `src/http/route-helpers.ts` currently holds generic HTTP helpers plus functionality that should move deeper into orchestrator territory as part of `#406`.

`src/core/attempt-store-port.ts`, `src/git/pr-monitor.ts`, and `src/core/types.ts` are the small but important hygiene targets. They should become clearer by the end of units `#406` and `#410`.

For tests, the repo already contains strong route and subsystem coverage. That is important because this epic should replace tests that assert on internal extraction seams with tests that assert on port behavior or lifecycle outcomes. The implementation should bias toward preserving or improving coverage rather than simply deleting tests to make refactors easier.

## Requirements Trace

Epic `#404` requires the following outcomes, each traced to a concrete unit in this plan.

- `#410` must remove `src/orchestrator/orchestrator-delegates.ts` and `src/config/builders.ts` where they are now pure churn amplifiers, while explicitly documenting why `src/core/types.ts` remains a broad type barrel.
- `#406` must move `serializeSnapshot` out of the HTTP layer, split attempt analytics helpers out of `src/core/attempt-store-port.ts`, and remove dead JSONL wording from the port contract.
- `#409` must move the domain-owned Express route adapters into `src/http/routes/` and centralize method-not-allowed handling under an HTTP-owned helper.
- `#405` must extend `TrackerPort` with tracker-agnostic provisioning, stop setup from calling Linear GraphQL directly, and collapse setup behind a `SetupPort` and a single route module.
- `#407` must introduce a single `WebhookPort`, move HTTP-specific webhook parsing under a webhook-owned adapter, and delete the current wrapper stack.
- `#408` must define a public session boundary at the observable lifecycle level so that `docker-session` is no longer the only shape callers understand.
- `#402` must move the orchestrator toward a pure reducer-style core plus effectful shell, unify the mutating command surface, and replace duplicated context layers with a single lifecycle state model.
- Every unit must keep the durable artifacts under `.anvil/epic-404-architecture-deepening/` current so a fresh session can resume the run.

## Scope Boundaries

This plan intentionally excludes the following work.

- Do not implement roadmap items outside epic `#404`, even if the new boundaries make them easier later. In particular, do not implement executor auto-selection, sandbox executor support, new tracker adapters, or new webhook sources as part of this run.
- Do not redesign frontend operator surfaces. The unrelated dirty frontend edits in the current worktree are out of scope and must remain untouched.
- Do not change external API paths, setup wizard affordances, webhook endpoint URLs, or operator command semantics unless a compatibility-preserving migration path is explicitly documented and tested.
- Do not remove `src/core/types.ts` or fan out its 100+ import sites.
- Do not silently collapse test coverage. Internal tests may be replaced, but only with stronger boundary tests that cover the same behavioral promises.

## Key Technical Decisions

The implementation should follow these design decisions.

First, use ports at the intent level, not at the low-level helper level. `SetupPort`, `WebhookPort`, `AgentSessionPort`, and the orchestrator command interface should expose what a caller is trying to do, not how the current implementation happens to be factored internally.

Second, prefer route-level behavioral compatibility over file-for-file preservation. `#409` is allowed to move route modules aggressively as long as request paths, status codes, payloads, and contract tests remain stable.

Third, isolate the large orchestrator refactor behind staged phases. The core should be introduced while the existing shell still exists, then the shell should adopt the new core, and only then should duplicated context types and write methods be deleted.

Fourth, bias tests toward deterministic in-memory adapters. This epic repeatedly benefits from fake or in-memory implementations: tracker provisioning for setup, delivery envelopes for webhooks, scripted session events for agent execution, and plain-object reducer inputs for orchestrator logic.

Fifth, keep this long-running task inspectable. After every meaningful unit, update this ExecPlan, `.anvil/epic-404-architecture-deepening/documentation.md`, `.anvil/epic-404-architecture-deepening/handoff.md`, `.anvil/epic-404-architecture-deepening/closeout.md`, and `.anvil/epic-404-architecture-deepening/status.json`.

## Implementation Units

### Unit 0 — Clean Execution Workspace Bootstrap

Goal: start the long-running implementation from a clean worktree and record the baseline branch, commit, and dirty-file warning before any code changes.

Owned files: `.anvil/epic-404-architecture-deepening/status.json`, `.anvil/epic-404-architecture-deepening/handoff.md`, `.anvil/epic-404-architecture-deepening/closeout.md`

Dependencies: this plan and the existing branch `architecture-deepening-closeout`

Execution target: create a dedicated worktree and branch, copy or retain the durable planning artifacts there, and confirm `git status --short` is clean before starting Unit 1.

Verification surface: shell commands only; no code changes yet

Tests impact: none

Docs impact: refresh the durable run state documents with the clean worktree path, branch name, and start timestamp

### Unit 1 — `#410` Retire Compat Shims and Document Intrinsic Churn

Goal: remove the avoidable churn files and codify why `src/core/types.ts` remains as a high-fanout barrel.

Owned files: `src/orchestrator/orchestrator-delegates.ts`, `src/config/builders.ts`, `src/core/types.ts`, any source/test import sites that currently depend on the removed files

Dependencies: clean worktree from Unit 0

Execution target: delete the shim and forwarding barrel, migrate callers to direct imports, and add a concise file-level note explaining that `src/core/types.ts` churn is structural

Verification surface: `tests/orchestrator/orchestrator-delegates.test.ts`, `tests/config/builders.test.ts`, nearby orchestrator and config suites that catch missed imports

Tests impact: update or remove tests that directly import the deleted files, but preserve behavior coverage for the real coordinator and config helpers

Docs impact: update `.anvil/epic-404-architecture-deepening/documentation.md` and this plan to record that the first mechanical cleanup is done and `core/types.ts` remains intentionally

### Unit 2 — `#406` Persistence Hygiene

Goal: correct the dependency direction around snapshot serialization and separate attempt analytics helpers from the attempt-store port contract.

Owned files: `src/orchestrator/snapshot-serialization.ts`, `src/orchestrator/orchestrator.ts`, `src/http/route-helpers.ts`, `src/core/attempt-store-port.ts`, `src/core/attempt-analytics.ts`, `src/git/pr-monitor.ts`

Dependencies: Unit 1 complete

Execution target: move `serializeSnapshot` into orchestrator-owned code, move `sortAttemptsDesc` and `sumAttemptDurationSeconds` into a non-port helper module, and correct the attempt-store documentation

Verification surface: `tests/http/route-helpers.test.ts`, new `tests/orchestrator/snapshot-serialization.test.ts`, new `tests/core/attempt-analytics.test.ts`, `tests/git/pr-monitor.test.ts`, `tests/core/attempt-store-port.test.ts`

Tests impact: add direct tests for the extracted pure helpers and delete or slim indirect HTTP-only assertions where the behavior now lives lower in the stack

Docs impact: note the corrected dependency direction and the JSONL wording removal in the durable documentation log

### Unit 3 — `#409` Relocate Domain HTTP Adapters into `src/http/routes/`

Goal: finish the HTTP route-module pattern by moving the remaining domain-owned Express adapters under `src/http/routes/`.

Owned files: `src/http/errors.ts`, `src/http/routes/config.ts`, `src/http/routes/secrets.ts`, `src/http/routes/prompt.ts`, `src/http/routes/audit.ts`, `src/http/routes/setup.ts`, `src/http/routes.ts`, `src/config/api.ts`, `src/secrets/api.ts`, `src/prompt/api.ts`, `src/audit/api.ts`, `src/setup/api.ts`

Dependencies: Unit 2 complete

Execution target: move or rewrite the five `api.ts` adapters as route modules, centralize `methodNotAllowed`, and leave the domain directories free of Express registration code

Verification surface: `tests/http/routes.test.ts`, `tests/http/setup-api.integration.test.ts`, `tests/http/secrets-api.integration.test.ts`, `tests/http/audit-api.integration.test.ts`, `tests/http/template-api.test.ts`, `tests/config/api.test.ts`

Tests impact: relocate or rewrite route-focused tests so they target the HTTP layer rather than importing domain `api.ts` modules

Docs impact: record the route-module migration and note that the repo now uses a single routing pattern for domain HTTP bindings

### Unit 4 — `#405` SetupPort plus `TrackerPort.provision`

Goal: make setup tracker-agnostic, collapse handler indirection, and expose a single intent-shaped setup boundary.

Owned files: `src/tracker/port.ts`, `src/tracker/linear-adapter.ts`, `src/tracker/github-adapter.ts`, `src/setup/port.ts`, `src/setup/setup-service.ts` or its replacement implementation, `src/setup/setup-handlers.ts`, `src/setup/repo-route-handlers.ts`, all files under `src/setup/handlers/`, `src/http/routes/setup.ts`

Dependencies: Unit 3 complete so setup routes already live under `src/http/routes/`

Execution target: add `TrackerPort.provision`, route setup provisioning through tracker adapters, collapse the setup wrapper files into a real `SetupPort`, and keep the existing wizard/API behavior stable

Verification surface: `tests/setup/setup-service.test.ts`, new `tests/setup/setup-port.test.ts`, `tests/setup/handlers.integration.test.ts`, `tests/frontend/setup-wizard.test.ts`, `tests/http/setup-api.integration.test.ts`, `tests/tracker/github-adapter.test.ts`

Tests impact: replace thin per-handler tests with boundary tests around `SetupPort` and tracker provisioning; preserve end-to-end wizard coverage

Docs impact: update the durable documentation log with the new setup boundary and the explicit note that setup no longer calls Linear GraphQL directly when GitHub is configured

### Unit 5 — `#407` WebhookPort and Webhook Module Collapse

Goal: unify webhook behavior behind one service boundary and eliminate the current wrapper/type-cycle stack.

Owned files: `src/webhook/port.ts`, `src/webhook/service.ts`, `src/webhook/delivery.ts`, `src/webhook/health.ts`, `src/webhook/signature.ts`, `src/webhook/http-adapter.ts`, `src/webhook/index.ts`, `src/webhook/composition.ts`, `src/webhook/runtime.ts`, `src/webhook/registrar.ts`, `src/webhook/delivery-workflow.ts`, `src/webhook/health-tracker.ts`, `src/http/webhook-handler.ts`, `src/http/github-webhook-handler.ts`, `src/http/routes/webhooks.ts`

Dependencies: Unit 3 complete; Unit 4 complete if setup route patterns or secrets access helpers are reused

Execution target: introduce `WebhookPort`, move inbound HTTP parsing into a webhook-owned adapter, migrate route mounting to the new port, and delete the thin wrapper stack and HTTP-side handler files

Verification surface: new `tests/webhook/service.test.ts`, new `tests/webhook/http-adapter.test.ts`, `tests/http/routes-webhooks.test.ts`, `tests/http/webhook-routes.test.ts`, `tests/http/webhook-handler.test.ts`, `tests/http/github-webhook-handler.test.ts`, `tests/persistence/sqlite/webhook-inbox.test.ts`

Tests impact: replace composition/runtime façade tests with service-level delivery and subscription tests plus a small adapter test

Docs impact: update the durable documentation log with the new entry points for webhook subscription, delivery, and health

### Unit 6 — `#408` AgentSessionPort

Goal: expose agent execution as an observable session lifecycle boundary instead of a Docker-shaped implementation detail.

Owned files: `src/agent-runner/port.ts` or `src/agent-runner/session-port.ts`, `src/agent-runner/docker-session.ts`, `src/agent-runner/index.ts`, `src/agent-runner/contracts.ts`, `src/agent-runner/session-init.ts`, `src/agent-runner/session-helpers.ts`, `src/agent-runner/notification-handler.ts`, `src/agent-runner/turn-state.ts`, `src/orchestrator/worker-launcher.ts`

Dependencies: Units 1-5 complete so the orchestrator and setup/webhook boundaries are already simplified around the runner

Execution target: define `AgentSessionPort`, make the current Docker-backed implementation conform to it, migrate callers to the new interface, and replace the 15-mock test surface with scripted adapter tests

Verification surface: new `tests/agent-runner/agent-session-port.test.ts`, `tests/agent-runner/docker-session.test.ts`, `tests/orchestrator/worker-launcher.test.ts`, `tests/agent-runner/attempt-executor.test.ts`

Tests impact: delete or slim mock-heavy tests once the new boundary suite covers start, abort, stall, and termination behavior

Docs impact: document the new public session vocabulary in the run log so later work on executor pluggability has a stable starting point

### Unit 7 — `#402` Phase A: Orchestrator Core Scaffolding

Goal: extract the first pure lifecycle helpers and define the state/event/command vocabulary without deleting the current shell yet.

Owned files: new files under `src/orchestrator/core/` for lifecycle state, events, commands, retry classification, dispatch eligibility, worker outcome reduction, and snapshot projection helpers; updates to `src/orchestrator/orchestrator.ts`, `src/orchestrator/retry-policy.ts`, `src/orchestrator/dispatch.ts`, `src/orchestrator/stall-detector.ts`, `src/orchestrator/issue-view-builders.ts`, `src/orchestrator/outcome-view-builder.ts`

Dependencies: Units 1-6 complete, especially `AgentSessionPort` from Unit 6

Execution target: introduce a pure core layer and plain-object tests while keeping the public orchestrator shell and route behavior unchanged

Verification surface: new `tests/orchestrator/lifecycle-core.test.ts`, new `tests/orchestrator/snapshot-projection.test.ts`, `tests/orchestrator/retry-policy.test.ts`, `tests/orchestrator/dispatch.test.ts`, `tests/orchestrator/worker-outcome*.test.ts`

Tests impact: add reducer-style tests for the new core while retaining existing shell coverage until later phases make deletion safe

Docs impact: document the new lifecycle vocabulary and the fact that the shell still owns I/O at this stage

### Unit 8 — `#402` Phase B: Route State Transitions and Projection Through the Core

Goal: make the shell actually use `LifecycleState`, `apply`, and `project` for the real runtime, while preserving public read behavior.

Owned files: `src/orchestrator/orchestrator.ts`, `src/orchestrator/context.ts`, `src/orchestrator/lifecycle.ts`, `src/orchestrator/run-lifecycle-coordinator.ts`, `src/orchestrator/recovery.ts`, `src/orchestrator/snapshot-builder.ts`, `src/orchestrator/views.ts`, `src/orchestrator/port.ts`

Dependencies: Unit 7 complete

Execution target: convert the live orchestrator internals to drive state through the core reducer and projection functions, keeping existing port methods alive for now

Verification surface: `tests/orchestrator/orchestrator.test.ts`, `tests/orchestrator/orchestrator-advanced.test.ts`, `tests/orchestrator/lifecycle.test.ts`, `tests/orchestrator/recovery.test.ts`, `tests/orchestrator/restart-recovery.integration.test.ts`, `tests/http/routes.test.ts`

Tests impact: migrate shell-level tests away from internal context objects and toward state transitions and snapshots

Docs impact: update the durable documentation log with the new runtime architecture and what still remains to delete in Phase C

### Unit 9 — `#402` Phase C: Unified Operator Commands and Duplicate Context Deletion

Goal: finish the orchestrator deepening by collapsing duplicate contexts, deleting the old worker-outcome cluster, and unifying mutating operations behind a typed command surface.

Owned files: `src/orchestrator/port.ts`, `src/orchestrator/orchestrator.ts`, `src/http/model-handler.ts`, `src/http/template-override-handler.ts`, `src/http/transition-handler.ts`, `src/http/trigger-handler.ts`, `src/http/routes/issues.ts`, any remaining `src/orchestrator/*` files that exist only to support the old delegate/context split

Dependencies: Unit 8 complete

Execution target: replace the scattered mutating orchestrator methods with a single command path, update HTTP handlers to call it, delete duplicate context files and sub-package seams, and keep route contracts stable

Verification surface: `tests/http/model-handler.test.ts`, `tests/http/model-handler.integration.test.ts`, `tests/http/template-override-handler.test.ts`, `tests/http/transition-handler.test.ts`, `tests/http/trigger-handler.test.ts`, `tests/http/routes.test.ts`, `tests/orchestrator/worker-outcome.test.ts`, `tests/orchestrator/run-lifecycle-coordinator.test.ts`

Tests impact: delete now-obsolete internal tests such as `tests/orchestrator/orchestrator-delegates.test.ts` and the split worker-outcome suites only after equivalent shell/core behavior coverage is present

Docs impact: record the final orchestrator command surface, deleted context layers, and remaining follow-up items that are intentionally outside epic `#404`

### Unit 10 — Final Sweep and Closeout

Goal: prove the full epic ships cleanly, with docs and durable run artifacts matching reality.

Owned files: this ExecPlan, `.anvil/epic-404-architecture-deepening/documentation.md`, `.anvil/epic-404-architecture-deepening/handoff.md`, `.anvil/epic-404-architecture-deepening/closeout.md`, `.anvil/epic-404-architecture-deepening/status.json`, any user-facing docs touched during implementation such as `README.md` or `docs/TRUST_AND_AUTH.md` if behavior changed materially

Dependencies: Units 0-9 complete

Execution target: run the full verification sweep, update docs, write the final retrospective, and mark the run ready for commit/push or handoff

Verification surface: full repo gate plus targeted suite reruns for setup, webhook, agent-runner, orchestrator, and HTTP route contracts

Tests impact: none beyond final reruns and any last bug-fix additions

Docs impact: finalize the planning and closeout artifacts with honest status and residual risk

## Concrete Steps

Run all commands from the repository root unless this plan explicitly calls for a new worktree path.

For Unit 0, create a clean worktree before implementation:

    git worktree add ../risoluto-worktrees/epic-404-architecture-deepening -b epic-404-architecture-deepening HEAD
    cd ../risoluto-worktrees/epic-404-architecture-deepening
    git status --short
    git branch --show-current

Expected result: the new worktree is clean and on branch `epic-404-architecture-deepening`.

Before each unit, read the current state documents in this order:

    cat .anvil/epic-404-architecture-deepening/prompt.md
    cat .anvil/epic-404-architecture-deepening/plan.md
    cat .anvil/epic-404-architecture-deepening/implement.md
    cat .anvil/epic-404-architecture-deepening/documentation.md
    cat docs/plans/2026-04-15-001-epic-404-architecture-deepening-execplan.md

For each unit, follow the same operating loop:

    1. Update the `Progress` section before editing.
    2. Make the smallest coherent code changes for the unit.
    3. Run the unit-focused tests first.
    4. Run the repo gate:
       pnpm run build
       pnpm run lint
       pnpm run format:check
       pnpm test
    5. If the unit changed type-owned or route-owned code broadly, also run:
       pnpm run typecheck
       pnpm run typecheck:frontend
    6. Update this ExecPlan plus the `.anvil` artifacts with what actually happened.

Recommended targeted verification commands by unit:

    Unit 1:
      pnpm exec vitest run tests/orchestrator/orchestrator-delegates.test.ts tests/config/builders.test.ts

    Unit 2:
      pnpm exec vitest run tests/git/pr-monitor.test.ts tests/core/attempt-store-port.test.ts tests/http/route-helpers.test.ts

    Unit 3:
      pnpm exec vitest run tests/http/routes.test.ts tests/http/setup-api.integration.test.ts tests/http/secrets-api.integration.test.ts tests/http/audit-api.integration.test.ts

    Unit 4:
      pnpm exec vitest run tests/setup/setup-service.test.ts tests/http/setup-api.integration.test.ts tests/frontend/setup-wizard.test.ts tests/tracker/github-adapter.test.ts

    Unit 5:
      pnpm exec vitest run tests/webhook/*.test.ts tests/http/webhook-handler.test.ts tests/http/github-webhook-handler.test.ts tests/http/webhook-routes.test.ts

    Unit 6:
      pnpm exec vitest run tests/agent-runner/docker-session.test.ts tests/orchestrator/worker-launcher.test.ts

    Unit 7:
      pnpm exec vitest run tests/orchestrator/retry-policy.test.ts tests/orchestrator/dispatch.test.ts tests/orchestrator/worker-outcome.test.ts

    Unit 8:
      pnpm exec vitest run tests/orchestrator/orchestrator.test.ts tests/orchestrator/lifecycle.test.ts tests/orchestrator/recovery.test.ts

    Unit 9:
      pnpm exec vitest run tests/http/model-handler.test.ts tests/http/template-override-handler.test.ts tests/http/transition-handler.test.ts tests/http/trigger-handler.test.ts tests/http/routes.test.ts

    Unit 10:
      pnpm run build
      pnpm run lint
      pnpm run format:check
      pnpm run typecheck
      pnpm run typecheck:frontend
      pnpm test

If a unit uncovers a real bug, add the failing test first, fix the behavior, and record the discovery in `Surprises & Discoveries` and `.anvil/epic-404-architecture-deepening/documentation.md` before moving on.

## Validation and Acceptance

The epic is accepted only when all of the following are true.

The repo still builds and the full test suite passes. The setup wizard and setup API still work, but setup provisioning now routes through `TrackerPort` rather than Linear-only queries. The remaining domain HTTP adapters now live under `src/http/routes/`, and the domain directories no longer register Express routes directly. The webhook subsystem is reachable through a single `WebhookPort` and route adapter rather than the current wrapper stack. Agent execution exposes a stable `AgentSessionPort` that callers understand without depending on Docker-specific internals. The orchestrator uses a lifecycle core plus shell structure, and the mutating operator surface is unified behind a typed command path with route compatibility preserved.

Behavioral acceptance should be demonstrated with both boundary tests and existing contract coverage. At minimum, the final implementation must leave the following green:

- setup tests and setup API integration tests
- webhook service and HTTP adapter tests
- agent-runner session and orchestrator worker-launcher tests
- orchestrator core and shell tests
- HTTP route contract tests touching issue mutations, model updates, template overrides, and state serialization

The durable artifact stack is part of the acceptance bar. A fresh Codex session must be able to open `.anvil/epic-404-architecture-deepening/status.json`, `.anvil/epic-404-architecture-deepening/handoff.md`, `.anvil/epic-404-architecture-deepening/documentation.md`, and this ExecPlan and understand exactly what has happened, what remains, and what to do next.

## Idempotence and Recovery

This plan is intentionally staged so that each unit is independently recoverable.

The clean-worktree bootstrap in Unit 0 avoids contaminating the unrelated dirty files already present in the current worktree. If the long-running implementation needs to restart, reopen the same worktree and the `.anvil` artifacts first rather than recreating the plan.

Units 1, 2, and 3 are mostly mechanical and should be landed in small, reviewable commits. If one of those units breaks imports or route registration, revert or repair only the failing unit rather than bundling multiple cleanups together.

Units 4, 5, 6, and 9 use migration-style boundaries. Keep the old path alive until callers have been switched and tests are green, then delete the superseded wrappers or methods in the same unit once behavior parity is proven.

The orchestrator refactor must not be run as a big-bang rewrite. If Phase B or Phase C exposes instability, stop at the last green phase, refresh the durable artifacts with the exact blocker, and resume from there rather than pressing on with a half-migrated shell.

## Artifacts and Notes

Important planning artifacts created for this run:

    docs/plans/2026-04-15-001-epic-404-architecture-deepening-execplan.md
    .anvil/epic-404-architecture-deepening/prompt.md
    .anvil/epic-404-architecture-deepening/requirements.md
    .anvil/epic-404-architecture-deepening/plan.md
    .anvil/epic-404-architecture-deepening/implement.md
    .anvil/epic-404-architecture-deepening/documentation.md
    .anvil/epic-404-architecture-deepening/handoff.md
    .anvil/epic-404-architecture-deepening/closeout.md
    .anvil/epic-404-architecture-deepening/status.json

Important upstream issue references:

    #404  Epic: Next-wave architecture deepening
    #402  RFC: Orchestrator Lifecycle Engine
    #405  RFC: SetupPort + TrackerPort.provision
    #406  RFC: Persistence hygiene
    #407  RFC: WebhookPort
    #408  RFC: AgentSessionPort
    #409  RFC: Relocate domain api.ts files into http/routes/
    #410  Retire compat shims and document intrinsic churn

Current baseline facts captured during planning:

    Branch: architecture-deepening-closeout
    HEAD: 3f723ea
    Worktree state: dirty in unrelated frontend files

Change note: This plan was created after auditing the live repo, the epic issue, each child RFC, and the external long-horizon Codex planning examples. It intentionally adds a durable `.anvil` artifact stack because the user wants a future low-babysitting long run rather than a chat-only plan.
