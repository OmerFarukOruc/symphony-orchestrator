# Raise Backend Integration Coverage Toward a Real 100% Gate

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with [`.agents/PLANS.md`](/home/oruc/Desktop/workspace/risoluto/.agents/PLANS.md).

## Purpose / Big Picture

Risoluto already has strong unit coverage and a growing Playwright surface, but it still lacks a trustworthy answer to the operator question, "how much of the real backend runtime is exercised by integration tests?" After this plan is complete, a contributor can run one backend-focused command and get an honest coverage report for executable backend code under `src/**`, with deterministic tests always included and live external-provider tests included when credentials exist. The report should identify what remains uncovered instead of pretending the system is already at 100%.

The user-visible outcome is a repeatable backend integration coverage program. From the repository root, running `pnpm run test:integration:backend` should produce `coverage/backend-integration/summary.json`, `coverage/backend-integration/coverage-final.json`, and `coverage/backend-integration/uncovered-files.json`. Running `pnpm run test:integration:backend:full` in an environment with live credentials should extend that report with live coverage instead of requiring a separate manual merge step.

## Progress

- [x] (2026-04-02 21:10Z) Chose backend executable code in `src/**` as the coverage target instead of mixing backend runtime and `frontend/src/**` into one misleading number.
- [x] (2026-04-02 21:24Z) Added `scripts/backend-integration-coverage.mjs` to run deterministic integration tests, optionally include live suites, merge coverage artifacts, and emit backend-only summaries plus uncovered-file rankings.
- [x] (2026-04-02 21:31Z) Added `test:integration:backend` and `test:integration:backend:full` scripts in `package.json`.
- [x] (2026-04-02 21:42Z) Updated `.github/workflows/ci.yml` so pull requests run deterministic backend integration coverage and the full integration lane can include live-backed coverage when secrets are present.
- [x] (2026-04-02 21:54Z) Added initial backend integration tests for CLI bootstrap/runtime config, HTTP API slices, setup handlers, workflow helpers, notification webhook behavior, event bus behavior, and state-machine/config seams.
- [x] (2026-04-02 22:00Z) Verified the current baseline with `pnpm run build`, `pnpm run lint`, `pnpm run format:check`, `pnpm test`, and `pnpm run test:integration:backend`.
- [x] (2026-04-02 22:01Z) Measured the first honest backend integration baseline: lines/statements `32.32%`, functions `34.05%`, branches `27.2%`.
- [x] (2026-04-02 22:05Z) Added real integration tests for `src/core/attempt-store.ts` and `src/workspace/manager.ts`, covering archive reloads, corrupt archives, hook execution, hook failures, timeouts, and worktree fallback removal.
- [x] (2026-04-02 22:07Z) Re-ran the full verification suite after the archive/workspace slice and raised backend integration coverage to lines/statements `35.88%`, functions `38.00%`, branches `28.85%`.
- [x] (2026-04-02 22:10Z) Added real integration tests for `src/config/legacy-import.ts`, covering auto-discovery, parent-directory fallback, overlay merge, template reseeding, failure logging, and no-source metadata recording.
- [x] (2026-04-02 22:10Z) Re-ran the full verification suite after the legacy-import slice and raised backend integration coverage to lines/statements `37.15%`, functions `38.52%`, branches `29.48%`.
- [x] (2026-04-02 22:18Z) Added real integration tests for `src/cli/services.ts`, covering service graph construction with real persistence, webhook-disabled startup, webhook URL without secret, and full webhook infrastructure with an injected persistence runtime.
- [x] (2026-04-02 22:18Z) Re-ran `pnpm run test:integration:backend` after the services slice and raised backend integration coverage to lines/statements `39.31%`, functions `40.21%`, branches `31.10%`.
- [ ] Continue adding integration tests for the next high-value uncovered backend runtime module. Current candidates are `src/core/content-sanitizer.ts` and orchestrator-adjacent runtime helpers.
- [ ] Re-run the required verification suite after each new coverage slice and update this plan with new percentages and discoveries. Note: the latest repo-wide lint/format pass is blocked by unrelated dirty files outside this slice.
- [ ] Decide when the backend integration threshold is high enough to enforce a ratcheting gate without creating fake confidence or blocking the team on unreachable live-only paths.

## Surprises & Discoveries

- Observation: the repo already had many integration-style tests in flight, but there was no backend-only merged coverage view that answered the original question.
  Evidence: `coverage/backend-integration/summary.json` now centralizes deterministic and live-ready backend coverage instead of scattering numbers across Vitest runs.

- Observation: backend integration coverage is much lower than the unit test posture suggests, which means "100% covered" is not a switch we can honestly flip today.
  Evidence:
    {
      "lines": { "covered": 2150, "total": 6652, "pct": 32.32 },
      "functions": { "covered": 525, "total": 1542, "pct": 34.05 },
      "branches": { "covered": 1075, "total": 3952, "pct": 27.2 }
    }

- Observation: the largest gaps are concentrated in backend orchestration, filesystem lifecycle management, and external-provider adapters rather than simple HTTP route plumbing.
  Evidence: top uncovered files currently include `src/orchestrator/orchestrator.ts`, `src/core/attempt-store.ts`, `src/workspace/manager.ts`, `src/linear/client.ts`, and multiple `src/agent-runner/**` modules.

- Observation: filesystem-backed integration slices deliver immediate coverage wins and quickly remove modules from the top-hotspot list.
  Evidence: after adding `AttemptStore`, `WorkspaceManager`, and `legacy-import` integration tests, coverage moved from `32.32%` statements to `37.15%`, and `src/config/legacy-import.ts` dropped to only `4` uncovered statements while `src/core/attempt-store.ts` dropped to `5`.

- Observation: `src/workspace/manager.ts` still has non-trivial uncovered branches even after the first integration slice, which suggests the remaining gaps are narrower edge conditions rather than missing broad lifecycle coverage.
  Evidence:
    src/workspace/manager.ts {"uncoveredStatements":17,"uncoveredFunctions":1,"uncoveredBranches":18}

- Observation: `src/cli/services.ts` responded well to a small number of higher-level integration tests because one service-construction call covers many backend branches at once.
  Evidence:
    src/cli/services.ts {"uncoveredStatements":39,"uncoveredFunctions":19,"uncoveredBranches":23}

- Observation: the latest repo-wide lint and format failures are coming from unrelated dirty files already present in the shared worktree rather than from the new service integration file.
  Evidence:
    format:check -> tests/setup/setup-status.test.ts
    lint -> tests/http/write-guard.test.ts
    targeted checks for tests/cli/services.integration.test.ts both passed

## Decision Log

- Decision: treat backend executable code in `src/**` as the integration-coverage target and exclude `frontend/src/**` from this metric.
  Rationale: the user asked about source code being "100% covered in terms of integration tests." Mixing backend runtime with frontend UI would blur two very different test styles and would make the number much less actionable.
  Date/Author: 2026-04-02 / Codex

- Decision: introduce a merged backend integration coverage runner before attempting any hard threshold.
  Rationale: the system first needed an honest measuring stick. Enforcing thresholds before we can isolate backend integration coverage would create noise and false certainty.
  Date/Author: 2026-04-02 / Codex

- Decision: keep deterministic integration coverage as the default command and fold live-provider coverage in only when credentials are available or explicitly required.
  Rationale: contributors and CI need a fast, repeatable default lane, but the final "real world" goal still includes live external dependencies.
  Date/Author: 2026-04-02 / Codex

- Decision: prioritize large backend hotspots with real seams such as archive persistence and workspace lifecycle before taking on the full orchestrator.
  Rationale: these areas provide meaningful runtime coverage with lower risk than immediately editing the most coupled orchestration code.
  Date/Author: 2026-04-02 / Codex

- Decision: take `src/config/legacy-import.ts` as the second slice after persistence/workspace coverage instead of jumping straight to `src/cli/services.ts`.
  Rationale: `legacy-import` had a large uncovered footprint but clean real-world seams: a SQLite file, `WORKFLOW.md`, overlay YAML, and import metadata. That made it a safer coverage gain than broader service graph construction.
  Date/Author: 2026-04-02 / Codex

- Decision: take `src/cli/services.ts` as the third slice once the lower-risk persistence/import modules were covered.
  Rationale: after the initial filesystem and import slices were in place, service graph construction became the next best payoff. A few real integration tests could cover webhook wiring, persistence injection, and dispatcher/orchestrator/http server construction at once.
  Date/Author: 2026-04-02 / Codex

## Outcomes & Retrospective

The first milestone is complete: Risoluto now has a real backend integration coverage program instead of a vague aspiration. The second milestone is underway and already producing measurable movement. Three concrete follow-on slices have now been verified: filesystem-backed archive/workspace lifecycle tests, legacy-import tests using real SQLite and real files, and service graph construction tests. Together they raised backend integration coverage from `32.32%` statements to `39.31%`.

The remaining gap is not tooling but surface area. A truthful retrospective at this stage is that 100% backend integration coverage remains a multi-slice effort, and the next wins should come from orchestrator-adjacent runtime helpers or other high-leverage modules that can be exercised through real integration seams without requiring live providers.

## Context and Orientation

Risoluto is a TypeScript service whose main runtime code lives in `src/`. The backend process starts in `src/cli/index.ts`, constructs services in `src/cli/services.ts`, serves HTTP from `src/http/server.ts` and `src/http/routes.ts`, orchestrates issue work from `src/orchestrator/orchestrator.ts`, and uses helpers such as `src/core/attempt-store.ts` and `src/workspace/manager.ts` to persist attempt archives and manage per-issue workspaces.

In this repository, an "integration test" means a test that exercises a real runtime seam such as the filesystem, an HTTP server, SQLite, subprocess hooks, or a live provider boundary. It should avoid trivial in-memory mocking when the production code meaningfully depends on real I/O. The relevant test runner is `vitest.integration.config.ts`, which includes files named `tests/**/*.integration.test.ts` and `tests/integration/**/*.test.ts`.

The new coverage runner lives at `scripts/backend-integration-coverage.mjs`. It runs Vitest with coverage enabled, filters the result to backend files under `src/**`, optionally adds live-provider suites, merges the counter maps, writes a summary JSON report, and prints the highest remaining uncovered files. The generated artifacts live in `coverage/backend-integration/`.

The current top backend gaps are important because they guide the next slices of work. As of the latest verified run, the biggest uncovered files are:

  - `src/orchestrator/orchestrator.ts`
  - `src/linear/client.ts`
  - `src/agent-runner/helpers.ts`
  - `src/core/content-sanitizer.ts`
  - `src/cli/services.ts`
  - `src/agent-runner/turn-executor.ts`
  - `src/orchestrator/lifecycle.ts`
  - `src/orchestrator/worker-launcher.ts`

The immediate low-risk targets in this plan were `src/core/attempt-store.ts` and `src/workspace/manager.ts`, and they are now covered by real integration tests. `AttemptStore` is the JSON-on-disk archive used to persist attempt records and attempt events under a base directory. `WorkspaceManager` is the module that creates, prepares, hooks, and removes per-issue workspace directories or Git worktrees.

The next uncovered medium-coupling target is `src/config/legacy-import.ts`, which is also now mostly covered by integration tests. It seeds default configuration rows into SQLite, imports legacy `WORKFLOW.md` and `overlay.yaml` state, updates the default prompt template, and records import metadata so the filesystem probe only happens once.

The next likely high-payoff target after that was `src/cli/services.ts`, and that slice is now partially covered as well. That module builds the service graph: tracker client, repo router, Git integration, workspace manager, dispatcher, event bus, notification manager, orchestrator, HTTP server, webhook infrastructure, prompt template store, and audit logger.

## Plan of Work

First, keep the coverage infrastructure intact and document it here so a fresh contributor can reproduce it. Do not replace the runner or split the metric again unless the backend scope itself changes.

Next, add integration tests that exercise real filesystem behavior for `src/core/attempt-store.ts`. This work is complete. The tests now create temporary archive directories, start the store, persist attempts and events, restart the store from disk, rebuild indexes, reload aggregates, tolerate corrupt archive entries, tolerate malformed event archives, migrate legacy event ordering, and reject updates for unknown attempts. These tests live in `tests/core/attempt-store.integration.test.ts`.

After that, add integration tests for `src/workspace/manager.ts` using a real temporary workspace root and actual shell hooks. This work is complete. The tests in `tests/workspace/manager.integration.test.ts` now cover directory strategy creation and cleanup, hook environment variables, hook failures, hook timeouts, worktree strategy setup and fallback removal, and transient-directory pruning in `prepareForAttempt`.

Then, add integration tests for `src/config/legacy-import.ts` using a real SQLite database file plus real legacy config files. This work is complete as well. The tests in `tests/config/legacy-import.integration.test.ts` cover parent-directory autodiscovery of `WORKFLOW.md`, overlay merging, template reseeding, failure logging for malformed legacy files, and recording the "already checked" metadata even when there are no usable sources.

After each slice, run the full required validation suite. This has now been done multiple times during this plan, with the caveat that the latest repo-wide lint and format pass surfaced unrelated shared-worktree issues outside the files touched in the services slice. Compare the new `coverage/backend-integration/summary.json` with the baseline in this plan, update the measured percentages, and record any unexpected uncovered branches or testability issues in `Surprises & Discoveries`.

If time remains after that milestone, continue with the next highest-leverage backend slice, likely `src/core/content-sanitizer.ts` or an orchestrator-adjacent module with stable seams. The plan should be revised before and after each such slice so the next contributor can resume from this document alone.

## Concrete Steps

All commands below run from the repository root: `/home/oruc/Desktop/workspace/risoluto`.

1. Create or update this ExecPlan whenever the design or progress changes.

   Expected result: this file accurately records the current state, measured backend coverage, next hotspot, and the latest verification commands.

2. Add backend integration tests for the next subsystem slice.

   For the current slice, edit or create:

   - `tests/core/attempt-store.integration.test.ts`
   - `tests/workspace/manager.integration.test.ts`
   - `tests/config/legacy-import.integration.test.ts`
   - `tests/cli/services.integration.test.ts`

   These tests should use real temporary directories created under the system temp directory, clean them up in `afterEach`, and avoid depending on unrelated local state.

3. Run the mandatory verification suite.

      pnpm run build
      pnpm run lint
      pnpm run format:check
      pnpm test
      pnpm run test:integration:backend

   Expected result: all commands exit successfully and the backend integration coverage summary is regenerated.

   Latest verified backend-coverage result:

      lines/statements: 39.31%
      functions: 40.21%
      branches: 31.10%

4. Inspect the regenerated summary and update this document.

      sed -n '1,220p' coverage/backend-integration/summary.json

   Expected result: the file shows improved coverage numbers and, ideally, lower-ranked or fewer uncovered entries for the subsystems touched in the current slice.

## Validation and Acceptance

The coverage program is acceptable only if it demonstrates observable behavior rather than merely changing code. A contributor must be able to run `pnpm run test:integration:backend` and observe all of the following:

The command succeeds without requiring live credentials in the default case. The terminal output prints a "Backend integration coverage summary" section and lists the top uncovered backend files. The file `coverage/backend-integration/summary.json` exists and contains percentage objects for lines, statements, functions, and branches. The file `coverage/backend-integration/uncovered-files.json` exists and contains ranked uncovered backend hotspots. The file `coverage/backend-integration/coverage-final.json` exists and contains a merged Istanbul coverage map.

For the current implementation slices, the new integration tests must also prove the runtime behavior they target. For `AttemptStore`, a reader should be able to see attempts and events persisted to disk, reloaded on restart, and gracefully skipped when corrupt. For `WorkspaceManager`, a reader should be able to see real directories created and removed, transient directories pruned, shell hooks writing observable files or environment dumps, and hook failures logged rather than silently swallowed. For `legacy-import`, a reader should be able to see a real SQLite database seeded from real `WORKFLOW.md` and `overlay.yaml` files, as well as failure logs and metadata behavior when those legacy files are unusable. For `services`, a reader should be able to see a real service graph constructed against real persistence and multiple webhook wiring states.

## Idempotence and Recovery

This plan is intentionally additive. The coverage runner deletes and recreates `coverage/backend-integration/` on each run, so rerunning it is safe. Integration tests must use unique temporary directories and clean them up in `afterEach` so repeated runs do not interfere with one another.

If a new integration test fails halfway through because a temporary hook or workspace directory remains on disk, it is safe to remove that temp directory manually and rerun the same command. If a live coverage run is requested with missing credentials, the correct recovery path is to either provide the required environment variables or rerun the deterministic command without `--require-live`. Do not weaken the runner by silently pretending a required live run succeeded.

## Artifacts and Notes

Current coverage artifact:

    coverage/backend-integration/summary.json

Initial baseline excerpt:

    {
      "statements": { "covered": 2150, "total": 6652, "pct": 32.32 },
      "lines": { "covered": 2150, "total": 6652, "pct": 32.32 },
      "functions": { "covered": 525, "total": 1542, "pct": 34.05 },
      "branches": { "covered": 1075, "total": 3952, "pct": 27.2 }
    }

Latest verified excerpt:

    {
      "statements": { "covered": 2615, "total": 6652, "pct": 39.31 },
      "lines": { "covered": 2615, "total": 6652, "pct": 39.31 },
      "functions": { "covered": 620, "total": 1542, "pct": 40.21 },
      "branches": { "covered": 1229, "total": 3952, "pct": 31.10 }
    }

Latest hotspot excerpt:

    - src/orchestrator/orchestrator.ts
    - src/linear/client.ts
    - src/agent-runner/helpers.ts
    - src/core/content-sanitizer.ts
    - src/agent-runner/turn-executor.ts

## Interfaces and Dependencies

The coverage runner is implemented in `scripts/backend-integration-coverage.mjs` and must continue to expose a CLI flow with these behaviors:

  - Run deterministic backend integration coverage by default.
  - Accept `--require-live` to fail when live credentials are absent.
  - Accept optional threshold flags or environment variables for lines, statements, functions, and branches.
  - Write `coverage/backend-integration/summary.json`.
  - Write `coverage/backend-integration/uncovered-files.json`.
  - Write `coverage/backend-integration/coverage-final.json`.

The integration tests added under this plan should continue to use the existing Vitest integration lane and the real runtime module interfaces:

  - `src/core/attempt-store.ts` exports `class AttemptStore` with `start()`, `createAttempt()`, `updateAttempt()`, `appendEvent()`, `getAttempt()`, `getEvents()`, `getAttemptsForIssue()`, `sumArchivedSeconds()`, `sumCostUsd()`, and `sumArchivedTokens()`.
  - `src/workspace/manager.ts` exports `class WorkspaceManager` with `ensureWorkspace()`, `prepareForAttempt()`, `runBeforeRun()`, `runAfterRun()`, and `removeWorkspace()`, plus the `WorkspaceManagerWorktreeDeps` contract for worktree-specific setup and removal.
  - `src/config/legacy-import.ts` exports `seedDefaults()` and `importLegacyFiles()`, which are expected to operate correctly against a real SQLite database and real legacy config files.
  - `src/cli/services.ts` exports `createServices()`, which is expected to build the runtime service graph correctly for polling-only mode, partially configured webhook mode, and fully configured webhook mode.

Revision note: updated this ExecPlan after adding a fourth integration-test slice for `src/cli/services.ts`. The plan now records the verified `39.31% / 40.21% / 31.10%` backend coverage state and notes that the latest full lint/format gate is blocked by unrelated dirty files already present in the shared worktree.
