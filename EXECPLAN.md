# Stabilize Orchestrator Runtime Hot Paths

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with [.agents/PLANS.md](./.agents/PLANS.md).

## Purpose / Big Picture

Operators should be able to trust Symphony’s running state: aborted issues must become dispatchable again, stall handling must be consistent, SSE streams must stay quiet after disconnects, and the most-polled dashboard endpoint must stop rebuilding the entire world on every request. After this change, the orchestrator will fetch candidate issues once per tick, build `/api/v1/state` from a cached revision-aware snapshot, and keep internal state maps and aggregates tight over long runs. The user-visible proof is that the existing test suite stays green while new regression tests cover operator aborts, stall handling, CLI port validation, and snapshot caching behavior.

## Progress

- [x] (2026-03-28 17:05Z) Ran baseline validation: `pnpm run build` and `pnpm test` both passed on the unmodified tree.
- [x] (2026-03-28 17:07Z) Verified the current repo has no `EXECPLAN.md`; this file now serves as the live execution record for the work.
- [x] (2026-03-28 17:20Z) Fixed the correctness layer: operator-abort now releases claims safely, stall handling is unified, SSE writes are guarded after disconnect, CLI port parsing validates early, turn state is per-attempt, and sanitizer cloning/parsing is hardened.
- [x] (2026-03-28 17:24Z) Refactored orchestrator tick flow so candidate issues are fetched once per tick and `/api/v1/state` can serve a cached serialized payload from the orchestrator.
- [x] (2026-03-28 17:29Z) Tightened internal structures: cached state-policy lookups, identifier-indexed issue resolution, config overlay helper extraction, and JSONL attempt-store aggregate caching.
- [x] (2026-03-28 17:31Z) Removed verified dead code and stale `knip` ignores, including the unused feature-flag runtime, dead frontend stub page, and test-only SSE subscriber wrappers.
- [x] (2026-03-28 17:33Z) Ran repo validation: `pnpm run build`, `pnpm run lint`, `pnpm run format:check`, `pnpm test`, and `pnpm run knip` all completed successfully on the final tree.
- [x] (2026-03-28 17:35Z) Ran the required visual verification workflow against `http://127.0.0.1:4000`, captured before/after screenshots plus a diff, and checked browser errors/console output.

## Surprises & Discoveries

- Observation: The repo did not already contain an `EXECPLAN.md`, even though the repository instructions explicitly reference one as the factual implementation log.
  Evidence: `nl -ba EXECPLAN.md` returned `No such file or directory` before this file was created.
- Observation: The current runtime on this machine throws a hard `ERR_SOCKET_BAD_PORT` when `listen()` receives `NaN`; it does not silently bind to port `0`.
  Evidence: `node -e '...listen(Number("abc"))...'` failed with `RangeError [ERR_SOCKET_BAD_PORT]`.
- Observation: The orchestrator currently has two separate stall detection paths wired into the same tick, but the tick order means the second one usually sees already-aborted entries rather than emitting duplicate stall events.
  Evidence: `src/orchestrator/orchestrator.ts` calls `detectAndKillStalled()` before `reconcileRunningAndRetryingState()`, and each path checks `abortController.signal.aborted`.
- Observation: Releasing an operator-aborted claim immediately caused the same still-active issue to relaunch on the next tick, which contradicted the repository’s existing abort behavior.
  Evidence: `tests/orchestrator/orchestrator.test.ts` failed with `expected runAttempt to be called 1 times, but got 2 times` until a suppression marker was added.
- Observation: The visual diff between the before/after dashboard screenshots was 4.13%, but the page structure, interactive refs, and browser error checks stayed stable.
  Evidence: `agent-browser diff screenshot` reported `4.13% pixels differ`, while `agent-browser errors` and `agent-browser console` produced no errors after reload.

## Decision Log

- Decision: Keep backward compatibility for `agent.stall_timeout_ms`, but make runtime stall enforcement read from `config.codex.stallTimeoutMs` only.
  Rationale: The config builder already resolves `codex.stall_timeout_ms` with `agent.stall_timeout_ms` as fallback, so runtime code can have one source of truth without breaking existing workflows.
  Date/Author: 2026-03-28 / Codex
- Decision: Cache the serialized `/api/v1/state` payload inside the orchestrator instead of in the HTTP route.
  Rationale: The orchestrator already owns the mutable state and knows when revisions change, so it is the right place to invalidate cached snapshot data.
  Date/Author: 2026-03-28 / Codex
- Decision: Add an operator-abort suppression fingerprint instead of relying on claim release alone.
  Rationale: Releasing the claim fixes the “stuck forever” problem, but a suppression fingerprint prevents the same unchanged issue from relaunching immediately after an operator abort. The suppression automatically clears when the tracker issue changes.
  Date/Author: 2026-03-28 / Codex

## Outcomes & Retrospective

The shipped result matches the original purpose: the orchestrator now avoids duplicate candidate fetches each tick, `/api/v1/state` can reuse a cached serialized snapshot between state changes, operator aborts no longer leave issues permanently claimed, and the JSONL attempt store plus config overlay code are leaner. The dead feature-flag plumbing and dead frontend helpers were removed, and `knip` now runs cleanly without the stale ignore noise.

Validation completed successfully with the repo’s required commands: `pnpm run build`, `pnpm run lint`, `pnpm run format:check`, `pnpm test`, and `pnpm run knip`. The frontend verification requirement also ran successfully against the local dashboard. The screenshot diff was non-zero because the dashboard content is live, but the layout remained intact and no browser errors were reported.

## Context and Orientation

The orchestrator is the long-running service that polls the tracker, launches workers, tracks runtime state, and serves the dashboard API. The key files for this change are `src/orchestrator/orchestrator.ts`, which owns the main poll loop and snapshot reads; `src/orchestrator/lifecycle.ts` and `src/orchestrator/worker-launcher.ts`, which currently fetch candidate issues independently; `src/orchestrator/orchestrator-delegates.ts`, which mutates recent events and usage totals; and `src/orchestrator/worker-outcome/terminal-paths.ts`, which handles terminal worker outcomes. The HTTP surface lives in `src/http/routes.ts`, `src/http/route-helpers.ts`, and `src/http/sse.ts`. The agent runtime pieces involved in correctness fixes live in `src/agent-runner/index.ts`, `src/agent-runner/turn-state.ts`, `src/agent-runner/notification-handler.ts`, and `src/core/content-sanitizer.ts`. Archived attempt summaries and startup loading live in `src/core/attempt-store.ts`.

In this repository, a “tick” means one poll cycle of the orchestrator. A “claim” means the in-memory marker in `claimedIssueIds` that prevents the same issue from being dispatched twice. A “snapshot” means the `RuntimeSnapshot` returned by `Orchestrator.getSnapshot()` and then serialized for `/api/v1/state`. A “stall timeout” means the maximum silent period before a running worker is aborted and retried.

## Plan of Work

First, fix correctness bugs that can leave the runtime in a bad state. `handleOperatorAbort()` in `src/orchestrator/worker-outcome/terminal-paths.ts` must mirror the other terminal handlers and release the claimed issue. The orchestrator will use one stall detector path only: remove the duplicate timeout check from `src/orchestrator/lifecycle.ts`, keep `src/orchestrator/stall-detector.ts` as the sole runtime detector, and normalize its event name to the existing `worker_stalled` event used elsewhere in the orchestrator. `src/http/sse.ts` will grow an internal closed flag so the server stops writing after disconnect. `src/cli/index.ts` will validate `--port` before startup. `src/agent-runner/index.ts` will create a fresh `TurnState` per attempt, and `src/core/content-sanitizer.ts` will avoid speculative parsing and clone failures.

Next, remove duplicate polling work and cache the most expensive read path. `src/orchestrator/orchestrator.ts` will fetch candidate issues once per tick, pass that array into queue refresh and launch logic, and track a monotonically increasing state revision. `getSnapshot()` will reuse a cached `RuntimeSnapshot` and a cached serialized API payload until the revision changes. The HTTP route for `/api/v1/state` will read the cached serialized payload from the orchestrator instead of rebuilding it every time.

Then tighten the hot-path data structures. `src/state/policy.ts` will cache normalized state lookups and reuse the state machine cache for transition reads. `src/orchestrator/worker-launcher.ts` will stop rescanning all running entries for each candidate issue by precomputing running counts per state. `src/orchestrator/issue-locator.ts` and the model-selection flow will use identifier indices instead of repeated linear scans. `src/core/attempt-store.ts` will batch startup loading and keep archived aggregates in memory so snapshot reads do not rescan all attempts repeatedly.

Finally, clean up verified dead code and duplicated helpers. The feature-flag runtime in `src/core/feature-flags.ts` and its tests will be removed if no production code depends on it. The duplicated config helper functions in `src/config/overlay.ts` and `src/config/db-store.ts` will move into a shared internal helper module. Verified dead frontend helpers and stale `knip.json` ignores will be removed. Because frontend files are part of Symphony’s web UI, a visual verification pass must run before the task is considered done.

## Concrete Steps

All commands are run from `/home/oruc/Desktop/workspace/symphony-orchestrator`.

Start from the baseline:

    pnpm run build
    pnpm test

During implementation, use focused test runs while changing each subsystem:

    pnpm exec vitest run tests/orchestrator/worker-outcome.test.ts tests/orchestrator/lifecycle.test.ts tests/orchestrator/stall-detector.test.ts
    pnpm exec vitest run tests/http/sse.test.ts tests/core/content-sanitizer.test.ts tests/agent-runner/turn-state.test.ts
    pnpm exec vitest run tests/orchestrator/orchestrator.test.ts tests/orchestrator/orchestrator-advanced.test.ts tests/http/routes.test.ts

Finish with the required repo-wide checks:

    pnpm run build
    pnpm run lint
    pnpm run format:check
    pnpm test
    pnpm run knip

If frontend files change, run the required visual verification workflow after code validation.

## Validation and Acceptance

Acceptance means the following are all demonstrably true:

`handleOperatorAbort()` releases the issue claim, proven by a regression test in `tests/orchestrator/worker-outcome.test.ts`. Stall handling is unified under one timeout path and existing stall-related tests still pass after updating expectations. An SSE client disconnect no longer causes `ERR_STREAM_WRITE_AFTER_END`, proven by a dedicated test in `tests/http/sse.test.ts`. Invalid CLI ports fail fast with a human-readable startup error, covered by a new CLI parsing test. `pnpm test` stays green and the orchestrator tests show a single candidate fetch per tick. `pnpm run knip` reports no stale configuration hints after the ignore cleanup. If frontend code changes, visual verification confirms the dashboard still renders and updates normally.

## Idempotence and Recovery

These changes are safe to re-run because they only mutate source files and test expectations in the repository. If a partial implementation leaves tests failing, rerun the focused Vitest commands listed above to isolate the failing subsystem before continuing. The baseline build and test commands provide a safe before/after comparison. The snapshot cache must be implemented so invalidation is explicit and deterministic; if cached output ever looks stale, the safe recovery path is to increment the orchestrator revision on the missed mutation and rerun the affected tests.

## Artifacts and Notes

Key baseline evidence captured before implementation:

    pnpm run build
    ✓ tsc -p tsconfig.json && pnpm run build:frontend

    pnpm test
    Test Files  165 passed (165)
    Tests  1895 passed | 1 skipped (1896)

    node -e '...listen(Number("abc"))...'
    RangeError [ERR_SOCKET_BAD_PORT]: options.port should be >= 0 and < 65536. Received type number (NaN)

## Interfaces and Dependencies

At the end of this work, `src/orchestrator/port.ts` should expose a cached state payload accessor in addition to `getSnapshot()`, because the HTTP layer needs the serialized `/api/v1/state` payload without rebuilding it. `src/orchestrator/lifecycle.ts` and `src/orchestrator/worker-launcher.ts` should accept a pre-fetched `Issue[]` candidate list from the orchestrator tick. `src/core/attempt-store.ts` should maintain private in-memory aggregate fields for archived seconds, tokens, and cost that stay in sync across `start()`, `createAttempt()`, and `updateAttempt()`. Any new helper module extracted from the config overlay stores must remain internal to `src/config/` and preserve the current public `ConfigOverlayPort` behavior.

Plan revision note: created this ExecPlan because the repo did not already contain `EXECPLAN.md`, and seeded it with the verified scope and current baseline results before code changes began.
