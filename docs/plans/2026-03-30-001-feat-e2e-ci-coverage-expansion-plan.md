---
title: "feat: E2E lifecycle CI integration and API surface verification"
type: feat
status: active
date: 2026-03-30
origin: docs/brainstorms/2026-03-30-e2e-ci-coverage-expansion-requirements.md
finalized: 2026-03-30
finalized-by: claude-opus-4-6
---

# E2E Lifecycle CI Integration & API Surface Verification

## Overview

Add a non-blocking `e2e-lifecycle` job to the GitHub Actions CI workflow that runs the full E2E lifecycle test on every push to `main`, gated behind `build-and-test`. Expand test coverage with a `verify-api-surface` phase that validates every relevant HTTP endpoint's response shape after a successful issue lifecycle. Add JUnit XML output for download-and-inspect debugging (with an optional `EnricoMi/publish-unit-test-result-action` step for in-PR rendering).

## Problem Frame

The E2E lifecycle test validates Symphony's integration with Linear, GitHub, and Codex APIs -- coverage that unit and Playwright tests cannot provide. It currently runs only locally, meaning integration regressions can ship undetected. The goal is automated CI execution on every push to `main` with the single highest-value new verification phase (API surface) and machine-readable JUnit output for at-a-glance debugging.

(see origin: `docs/brainstorms/2026-03-30-e2e-ci-coverage-expansion-requirements.md`)

## Requirements Trace

- R1. `e2e-lifecycle` job in CI workflow, runs on every push to `main`
- R2. Job depends on `build-and-test` gate
- R3. Concurrency group prevents parallel E2E runs
- R4. Always non-blocking (`continue-on-error: true`), never gates other jobs
- R5. Codex auth via injected `auth.json` from base64-encoded `CODEX_AUTH_JSON` secret
- R6. All other credentials injected as env vars from GitHub secrets
- R7. Separate `scripts/e2e-config.ci.yaml` with `$ENV_VAR` references
- R8. Upload `e2e-reports/` as artifact on every run
- R9. `verify-api-surface` phase hits every relevant API endpoint and validates response shapes
- R10. Endpoints: `/api/v1/state`, `/api/v1/{identifier}`, `/api/v1/{identifier}/attempts`, `/api/v1/attempts/{attempt_id}`, `/api/v1/runtime`, `/api/v1/models`, `/metrics`, `/api/v1/workspaces`, `/api/v1/git/context`, `/api/v1/events` (SSE)
- R11. Phase runs after `monitorLifecycle` and before `verify-pr`
- R12. JUnit XML output for GitHub Actions artifact (rendered via optional `publish-unit-test-result-action`)
- R13. JUnit output written alongside `e2e-summary.json`

## Scope Boundaries

- No `verify-workspace`, `verify-attempt-persistence`, or `verify-dashboard` phases -- overlap with existing coverage
- No retry/failure scenario testing in CI
- No running on PRs -- too expensive
- No changes to `e2e-summary.json` format -- JUnit is additive
- One test scenario per run
- `verify-api-surface` does NOT deeply validate nested object trees -- it checks top-level shape and key field presence to catch regressions without creating a brittle contract test

## Context & Research

### Relevant Code and Patterns

**Phase implementation pattern**: Each phase is an async function `(ctx: RunContext) => Promise<PhaseResult>` exported from a file in `scripts/e2e-lib/`. The `PhaseResult` type requires `phase` (kebab-case name), `status` ("pass" | "fail" | "skip"), `durationMs`, optional `error`, optional `data`. Phases use `fetchJson` from `helpers.ts` for HTTP calls.

**Phase registration**: The `PHASES` array in `scripts/e2e-lifecycle.ts` lists `PhaseEntry` objects `{ name, fn, alwaysRun? }`. The pipeline runner executes them sequentially, skipping non-`alwaysRun` phases after the first failure.

**Existing phase files**:
- `scripts/e2e-lib/phases-startup.ts` -- phases at array indices 0-2 (preflight, clean-slate, start-symphony)
- `scripts/e2e-lib/phases-lifecycle.ts` -- phases at array indices 3-5 (createIssue, waitPickup, monitorLifecycle) plus `restartResilience` (index 8). Note: the file's JSDoc uses "phase 7.5" as a convenience label for `restartResilience`, but this is NOT an array index.
- `scripts/e2e-lib/phases-teardown.ts` -- phases at array indices 6-10 (verifyPr, verifyLinear, collectArtifacts, cleanup, shutdownSymphony)

**Reporting**: `scripts/e2e-lib/reporting.ts` contains `JsonlWriter`, `diagnoseProblem`, `generateSummary`, `writeSummaryFile`, `printPhaseResult`, `printFinalReport`. Summary is written via `writeSummaryFile(reportDir, summary)` which outputs `e2e-summary.json`.

**API endpoints and response shapes** (from `src/http/routes.ts` and handlers):

| Endpoint | Handler | Response shape (key fields) |
|---|---|---|
| `GET /api/v1/state` | `orchestrator.getSerializedState()` | `{ generated_at, counts, running[], retrying[], completed[], queued[], codex_totals, workflow_columns, recent_events }` |
| `GET /api/v1/{identifier}` | `orchestrator.getIssueDetail()` | `IssueDetailView` -- extends `RuntimeIssueView` + `{ recentEvents[], attempts[], currentAttemptId }` |
| `GET /api/v1/{identifier}/attempts` | inline | `{ attempts: AttemptSummaryEntry[], current_attempt_id }` |
| `GET /api/v1/attempts/{attempt_id}` | `handleAttemptDetail` | `AttemptDetailView` -- extends `AttemptSummary` + `{ events[] }` |
| `GET /api/v1/runtime` | inline | `{ version, workflow_path, data_dir, feature_flags: {}, provider_summary }` |
| `GET /api/v1/models` | inline via `fetchCodexModels` | `{ models: [...] }` |
| `GET /metrics` | `globalMetrics.serialize()` | Prometheus text format (content-type `text/plain`) |
| `GET /api/v1/workspaces` | `handleWorkspaceInventory` | `{ workspaces[], generated_at, total, active, orphaned }` -- returns 503 when `workspaceRoot` is falsy |
| `GET /api/v1/git/context` | `handleGitContext` | `{ repos[], activeBranches[], githubAvailable }` -- always returns 200 |
| `GET /api/v1/events` | `createSSEHandler` | SSE stream; first frame: `{ type: "connected" }` |

**CI workflow structure** (`.github/workflows/ci.yml`):
- Phase 1: `build` job (install + compile + cache)
- Phase 2: Parallel quality gates (`lint`, `test`, `typecheck`, `gitleaks`, `semgrep`)
- Phase 3: `e2e-smoke` (sharded), `sonarcloud`
- Phase 4: `docker-build`, `integration` (main only)
- Phase 5: `mutation` (weekly/PR)
- Phase 6: `docker-push` (main only, needs `build-and-test`)
- Gate: `build-and-test` aggregates all required jobs

The `integration` job is the closest pattern -- main-only, needs prior gates, uses secrets as env vars, restores cached build. The new `e2e-lifecycle` job follows this pattern but with `continue-on-error: true` and a concurrency group.

**Note:** The CI workflow uses `paths-ignore: ["**.md", "docs/**"]`, so doc-only pushes to `main` will skip the entire CI pipeline including the `e2e-lifecycle` job. In practice, this plan's code changes (.ts, .yml) will always trigger the pipeline.

**Config format**: `scripts/e2e-config.yaml` uses literal credentials. The CI config will use `$ENV_VAR` references that `resolveEnvValue()` in `helpers.ts` expands at runtime.

### Institutional Learnings

- The `e2e-config.yaml` is gitignored (`scripts/e2e-config.yaml`), but the CI config `scripts/e2e-config.ci.yaml` should be committed since it only contains `$ENV_VAR` references. (`.gitignore` only ignores the exact name `scripts/e2e-config.yaml`; the `.ci.yaml` variant is not excluded.)
- Codex `auth.json` path is resolved via `expandTilde(config.codex.source_home)` + `/auth.json`. In CI, the config uses a literal path `/tmp/codex-auth`, so `expandTilde` passes it through unchanged (it only expands a leading `~`).

## Key Technical Decisions

- **JUnit XML generation: hand-written, no dependency**: The E2E test produces ~12 phase results. JUnit XML is a simple format (testsuite + testcase elements). A small `generateJunitXml(phases)` function in `reporting.ts` avoids adding a dependency for such a trivial output. The format only needs `<testsuite>` with `<testcase>` elements, `<failure>` for failed phases, `<skipped/>` for skipped phases.

- **JUnit XML rendering: download-only by default, optional action for PR annotations**: GitHub Actions does NOT natively render JUnit XML from uploaded artifacts. The JUnit file is downloadable as part of the `e2e-reports/` artifact for local inspection. For richer in-PR annotations, add an `EnricoMi/publish-unit-test-result-action@v2` step to the CI job. This action is included in the CI job definition (Unit 5) as the recommended path.

- **`verify-api-surface` placement: new file `phases-verification.ts`**: The new phase is a verification concern distinct from both lifecycle monitoring and teardown. A new file keeps the existing files focused and follows the naming pattern (`phases-{concern}.ts`).

- **SSE validation: connect, read first frame, disconnect with two-layer timeout**: The SSE endpoint (`/api/v1/events`) cannot be validated with `fetchJson`. The phase opens a raw fetch with `{ signal: AbortSignal.timeout(5000) }` for connection timeout, reads the first `data:` frame using `Promise.race([reader.read(), sleep(3000)])` for read timeout, verifies it contains `{"type":"connected"}`, then aborts. This proves the endpoint is alive and speaking SSE protocol without blocking.

- **`/metrics` validation: text format check, not JSON**: The metrics endpoint returns Prometheus text format. The phase fetches it as text, asserts content-type contains `text/plain`, and checks for at least one `# TYPE` line.

- **Response shape assertions: top-level key presence, not deep equality**: Checking that `/api/v1/state` returns an object with `generated_at`, `counts`, `running`, `retrying`, `completed`, `queued`, `codex_totals`, `workflow_columns`, and `recent_events` is enough to catch regressions without coupling to internal field evolution. Same principle for all endpoints.

- **Per-endpoint error isolation**: Since `fetchJson` throws on non-2xx, each endpoint check is wrapped in its own `try/catch`. Errors are collected in an array and the phase continues checking remaining endpoints. This ensures a single endpoint failure doesn't prevent validation of the rest.

- **`/api/v1/workspaces` uses raw `fetch()`, not `fetchJson`**: The handler returns 503 when `workspaceRoot` is falsy. Since `fetchJson` throws on non-2xx, the phase must use raw `fetch()` for this endpoint to inspect `response.status` directly and treat 503 as a non-fatal skip. `/api/v1/git/context` always returns 200 and can use `fetchJson` normally.

- **CI config `source_home` uses literal path `/tmp/codex-auth`**: The CI job creates `/tmp/codex-auth/` and decodes `CODEX_AUTH_JSON` there. The CI config sets `source_home: "/tmp/codex-auth"` as a literal path (not an env-var reference) because `resolveEnvValue` only handles single `$VAR` expansion, not compound paths like `$RUNNER_TEMP/codex-auth`.

## Open Questions

### Resolved During Planning

- **JUnit XML library choice**: Resolved -- no library needed. The format for ~12 test cases is trivially hand-written. A `generateJunitXml` function in `reporting.ts` produces the XML string.

- **Exact response shape assertions**: Resolved -- the plan specifies per-endpoint key assertions based on actual route handler code (documented in Context & Research above). Top-level key presence checks, not deep structural validation.

- **Where does `verify-api-surface` go in the pipeline?**: Resolved -- after `monitorLifecycle` (index 5 in the current PHASES array) and before `verify-pr` (currently index 6). The new phase is inserted at array index 6, pushing all subsequent entries up by one. The new phase needs a completed issue with attempt data and a PR URL for full endpoint coverage.

- **How to handle `auth.json` in CI?**: Resolved -- `CODEX_AUTH_JSON` secret (base64-encoded) is decoded to `/tmp/codex-auth/auth.json` in a CI step (after `mkdir -p /tmp/codex-auth`). The CI config references that path via `source_home: "/tmp/codex-auth"`.

### Deferred to Implementation

- **`/api/v1/workspaces` may return 503 in CI if workspace config is unavailable**: The handler returns 503 when `configStore` has no workspace root. The phase uses raw `fetch()` and treats 503 as a non-fatal skip for this endpoint. Exact behavior depends on whether the CI Symphony instance has a workspace root configured (it should, via the generated workflow).

- **Token expiry handling for `CODEX_AUTH_JSON`**: If the auth.json tokens expire, the E2E test will fail at `monitorLifecycle` (Codex can't authenticate). The existing `diagnoseProblem` already classifies 401 errors as `AUTH_EXPIRED`. No special handling needed in `verify-api-surface` -- the phase won't even run if lifecycle fails.

## High-Level Technical Design

> *Directional guidance for review, not implementation specification.*

```
CI Workflow:
  push to main
    -> build job
    -> [lint, test, typecheck, gitleaks, semgrep, docker-build, e2e-smoke] (parallel)
    -> build-and-test gate
    -> e2e-lifecycle job (continue-on-error: true, concurrency: e2e-lifecycle)
         1. restore cached build
         2. mkdir -p /tmp/codex-auth && decode CODEX_AUTH_JSON -> /tmp/codex-auth/auth.json
         3. npx tsx scripts/e2e-lifecycle.ts --config scripts/e2e-config.ci.yaml --skip-build
         4. upload e2e-reports/ artifact
         5. (optional) publish JUnit results via EnricoMi/publish-unit-test-result-action

Phase Pipeline (updated):
  [0] preflight -> [1] clean-slate -> [2] start-symphony ->
  [3] create-issue -> [4] wait-pickup -> [5] monitor-lifecycle ->
  [6] verify-api-surface (NEW) ->                          <-- after lifecycle, before verify-pr
  [7] verify-pr -> [8] verify-linear -> [9] restart-resilience ->
  [10] collect-artifacts -> [11] cleanup

Reporting (updated):
  writeSummaryFile(reportDir, summary)     -- existing e2e-summary.json
  writeJunitXml(reportDir, phases)         -- NEW: e2e-junit.xml alongside
```

## Implementation Units

- [ ] **Unit 1: `verify-api-surface` phase implementation**

**Goal:** Implement the phase function that hits all 10 API endpoints and validates response shapes after a successful issue lifecycle.

**Requirements:** R9, R10

**Dependencies:** None (new file, no existing code changes needed)

**Files:**
- Create: `scripts/e2e-lib/phases-verification.ts`

**Approach:**
- Export a single `verifyApiSurface` function with signature `(ctx: RunContext) => Promise<PhaseResult>`
- Each endpoint check is wrapped in its own `try/catch`. Caught errors are appended to an errors array. The phase continues to the next endpoint regardless of individual failures. Return pass only if all checks succeed.
- Structure as a list of check functions to keep the code flat and readable
- For SSE (`/api/v1/events`): use raw `fetch` with `{ signal: AbortSignal.timeout(5000) }` for connection timeout. After getting the response, race `reader.read()` against a 3-second timer via `Promise.race([reader.read(), sleep(3000).then(() => { throw new Error("SSE read timeout") })])`. Verify the first frame contains `{"type":"connected"}`. Call `controller.abort()` in the `finally` block to ensure cleanup.
- For `/metrics`: use raw `fetch`, check content-type header, verify body contains `# TYPE`
- For `/api/v1/workspaces`: use raw `fetch()` instead of `fetchJson` to handle 503 gracefully. Check `response.status`: on 200 validate the shape (`workspaces`, `generated_at`, `total`, `active`, `orphaned`), on 503 mark the check as "skipped" (non-fatal), on other non-2xx mark as failed.
- For `/api/v1/git/context`: use `fetchJson` normally -- this endpoint always returns 200. Validate the shape has `repos`, `activeBranches`, and `githubAvailable` keys.
- For `/api/v1/state`: validate key presence for `generated_at`, `counts`, `running`, `retrying`, `completed`, `queued`, `codex_totals`, `workflow_columns`, and `recent_events`
- For all other JSON endpoints: use `fetchJson` with top-level key presence checks as documented in the API table
- The `data` field of the returned `PhaseResult` should include a `checkedEndpoints` count and list of individual check results for debugging
- Use the issue identifier from `ctx.issueIdentifier` for parameterized endpoints (`/api/v1/{identifier}`, `/api/v1/{identifier}/attempts`)
- For `/api/v1/attempts/{attempt_id}`: extract the attempt ID from the `/api/v1/{identifier}/attempts` response

**Patterns to follow:**
- `scripts/e2e-lib/phases-lifecycle.ts` -- inline interface types for API responses, `fetchJson` usage, error handling pattern
- `scripts/e2e-lib/phases-teardown.ts` -- `verifyPr` and `verifyLinear` -- collecting errors in an array, returning a structured result

**Test scenarios:**
- Happy path: all 10 endpoints return expected shapes -> phase returns `{ status: "pass" }` with `checkedEndpoints: 10` in data
- Edge case: issue identifier is null (lifecycle failed, phase was skipped by pipeline runner) -- this case is handled by the pipeline runner itself (skips non-`alwaysRun` phases after failure), so the phase can assume `ctx.issueIdentifier` is set
- Error path: an endpoint returns unexpected shape (missing key) -> phase returns `{ status: "fail" }` with specific error message naming the endpoint and missing field
- Error path: an endpoint returns non-2xx -> phase returns `{ status: "fail" }` with status code in error. Other endpoint checks still execute (per-endpoint isolation).
- Edge case: `/api/v1/workspaces` returns 503 -> treated as non-fatal, check marked as "skipped" in data but doesn't fail the phase
- Edge case: SSE endpoint sends connected frame -> phase validates and disconnects cleanly (no hanging connection)
- Edge case: SSE connection succeeds but first frame doesn't arrive within 3s -> read timeout fires, check fails, controller is aborted

**Verification:**
- Phase can be run in isolation by temporarily inserting it into the PHASES array and running the E2E test locally
- All 10 endpoint checks execute and produce individual pass/fail results in the phase data

---

- [ ] **Unit 2: Register `verify-api-surface` in the phase pipeline**

**Goal:** Wire the new phase into the PHASES array at the correct position (after `monitorLifecycle`, before `verify-pr`) and add the import.

**Requirements:** R11

**Dependencies:** Unit 1

**Files:**
- Modify: `scripts/e2e-lifecycle.ts`

**Approach:**
- Add import for `verifyApiSurface` from `./e2e-lib/phases-verification.js`
- Insert `{ name: "verify-api-surface", fn: verifyApiSurface }` at array index 6 (between `monitor-lifecycle` at index 5 and `verify-pr` at the current index 6). All subsequent entries shift up by one.
- No `alwaysRun` flag -- this phase should be skipped if a prior phase failed

**Patterns to follow:**
- Existing PHASES array entries in `scripts/e2e-lifecycle.ts`
- Import path uses `.js` extension per repo convention

**Test scenarios:**
- Happy path: full pipeline runs with verify-api-surface appearing in the correct position in terminal output and summary
- Edge case: if monitorLifecycle fails, verify-api-surface is skipped (status: "skip" in summary)

**Verification:**
- `npx tsx scripts/e2e-lifecycle.ts --help` still works (no import errors)
- Phase appears at the correct position in the output when running the full test

---

- [ ] **Unit 3: JUnit XML generation**

**Goal:** Add a `generateJunitXml` function that converts `PhaseResult[]` into JUnit XML format, and call it alongside `writeSummaryFile`.

**Requirements:** R12, R13

**Dependencies:** None (can be built independently of Unit 1)

**Files:**
- Modify: `scripts/e2e-lib/reporting.ts` (add `generateJunitXml` and `writeJunitXml` functions)
- Modify: `scripts/e2e-lifecycle.ts` (call `writeJunitXml` after `writeSummaryFile`)
- Create: `tests/e2e-lib/reporting.test.ts` (Vitest specs for `generateJunitXml`)

**Approach:**
- `generateJunitXml(phases: PhaseResult[]): string` produces a valid JUnit XML string
  - One `<testsuite>` element with `name="symphony-e2e"`, `tests` count, `failures` count, `skipped` count, `time` (total seconds)
  - One `<testcase>` per phase with `name` (phase name), `classname="symphony-e2e"`, `time` (seconds)
  - Failed phases get a `<failure message="...">` child with the error message
  - Skipped phases get a `<skipped/>` child
  - XML-escape all dynamic strings (phase names, error messages) to prevent malformed output
- `writeJunitXml(reportDir: string, phases: PhaseResult[]): void` writes to `{reportDir}/e2e-junit.xml`
- In `e2e-lifecycle.ts`, call `writeJunitXml(reportDir, results)` right after `writeSummaryFile(reportDir, summary)`
- Add Vitest specs in `tests/e2e-lib/reporting.test.ts` covering the five test scenarios below. `generateJunitXml` is a pure function and should have full unit test coverage per the repo's testing policy.

**Patterns to follow:**
- `writeSummaryFile` in `reporting.ts` -- uses `mkdirSync` + `writeFileSync` + `join`
- JUnit XML format: standard schema used by `EnricoMi/publish-unit-test-result-action`

**Test scenarios (implemented as Vitest specs):**
- Happy path: all phases pass -> XML has `failures="0"` and no `<failure>` elements
- Error path: one phase fails -> XML has `failures="1"` and the corresponding `<testcase>` contains `<failure>` with the error message
- Edge case: phases with skip status -> `<skipped/>` element present, not counted as failure
- Edge case: error message containing XML special characters (`<`, `>`, `&`, `"`) -> properly escaped in output
- Edge case: zero phases (empty array) -> produces valid XML with `tests="0"`

**Verification:**
- Generated XML is well-formed (parseable by any XML parser)
- All five Vitest specs pass

---

- [ ] **Unit 4: CI config file `e2e-config.ci.yaml`**

**Goal:** Create the CI-specific E2E config file with all credentials as `$ENV_VAR` references.

**Requirements:** R7

**Dependencies:** None

**Files:**
- Create: `scripts/e2e-config.ci.yaml`

**Approach:**
- Mirror the structure of `scripts/e2e-config.yaml` but with `$ENV_VAR` references for all secrets
- `linear.api_key: "$LINEAR_API_KEY"` -- expanded by `resolveEnvValue`
- `github.token: "$E2E_GITHUB_TOKEN"` -- uses a separate secret name to avoid collision with `GITHUB_TOKEN` (which Actions injects automatically with limited scope)
- `codex.auth_mode: "api_key"` and `codex.source_home: "/tmp/codex-auth"` (literal path, not env-var reference, because `resolveEnvValue` only handles single `$VAR` expansion). The CI step creates this directory and writes `auth.json` there.
- `codex.model: "gpt-5-codex-mini"` -- cheap model for CI
- Timeouts tuned for CI: `lifecycle_complete_ms: 900000` (15 min -- CI should not run forever)
- `cleanup.enabled: true` -- always clean up in CI

**Patterns to follow:**
- `scripts/e2e-config.yaml` structure and field names
- `scripts/e2e-lib/types.ts` `e2eConfigSchema` for required vs. optional fields

**Test scenarios:**

Test expectation: none -- this is a static config file. Validation happens implicitly when the E2E test loads it via `e2eConfigSchema.safeParse()`.

**Verification:**
- File passes Zod schema validation when loaded with the expected env vars set
- No literal secrets in the committed file

---

- [ ] **Unit 5: GitHub Actions `e2e-lifecycle` job**

**Goal:** Add the CI job that runs the E2E lifecycle test on every push to `main`, gated behind `build-and-test`.

**Requirements:** R1, R2, R3, R4, R5, R6, R8

**Dependencies:** Unit 3 (JUnit output), Unit 4 (CI config)

**Files:**
- Modify: `.github/workflows/ci.yml`

**Approach:**
- Add job between the `build-and-test` gate and `docker-push`
- `if: github.ref == 'refs/heads/main' && github.event_name != 'schedule'` -- same condition as `docker-push`, main-only
- `needs: build-and-test` -- waits for the quality gate
- `continue-on-error: true` -- non-blocking forever (R4)
- `concurrency: { group: e2e-lifecycle, cancel-in-progress: false }` -- prevent parallel runs (R3), don't cancel in-progress (long test, not worth restarting). Note: with `cancel-in-progress: false`, rapid pushes to main queue behind the current run (up to 30 minutes). This is acceptable for a non-blocking job but means E2E results for the second push are delayed.
- `timeout-minutes: 30` -- reasonable upper bound
- Steps:
  1. Checkout
  2. Setup pnpm + Node 24
  3. Restore cached build
  4. Decode Codex auth: `mkdir -p /tmp/codex-auth && echo "$CODEX_AUTH_JSON" | base64 -d > /tmp/codex-auth/auth.json`
  5. Run: `npx tsx scripts/e2e-lifecycle.ts --config scripts/e2e-config.ci.yaml --skip-build --timeout 600`
  6. Upload `e2e-reports/` artifact (always, pass or fail)
  7. Publish JUnit results: `EnricoMi/publish-unit-test-result-action@v2` with `files: e2e-reports/e2e-junit.xml`, `check_name: "E2E Lifecycle Results"`, `if: always()` -- renders phase pass/fail in the PR checks UI
- Env vars: `LINEAR_API_KEY`, `E2E_GITHUB_TOKEN`, `OPENAI_API_KEY`, `CODEX_AUTH_JSON` from secrets
- `GITHUB_TOKEN` is also available by default but has limited scope; the `E2E_GITHUB_TOKEN` PAT is needed for PR creation/verification on the test repo
- **Important**: `docker-push` must NOT list `e2e-lifecycle` in its `needs` -- the E2E job is informational only

**Note on `OPENAI_API_KEY`**: The existing preflight phase does not validate this secret. If it is missing, the failure will surface later during `monitor-lifecycle` (Codex can't authenticate) with an `AUTH_EXPIRED` diagnosis. This is acceptable because preflight already validates the more critical `LINEAR_API_KEY` and `auth.json`, and `OPENAI_API_KEY` failures are caught by the existing error classification system.

**Patterns to follow:**
- `integration` job in `ci.yml` -- main-only, needs gate, secrets as env vars, restores cached build
- `sonarcloud` job -- `continue-on-error: true` pattern

**Test scenarios:**

Test expectation: none -- CI workflow changes are validated by running the workflow. The job is non-blocking, so a misconfiguration manifests as a red check on the commit (visible but not harmful).

**Verification:**
- CI workflow YAML is valid (no syntax errors)
- On push to main, the `e2e-lifecycle` job appears in the Actions tab
- The job does NOT block `docker-push` or any other job
- Report artifact is uploaded on both pass and fail

---

- [ ] **Unit 6: Documentation updates**

**Goal:** Update E2E testing docs to reflect the new phase, CI integration, and JUnit output.

**Requirements:** All (documentation alignment)

**Dependencies:** Units 1-5

**Files:**
- Modify: `docs/E2E_TESTING.md`

**Approach:**
- **Phase Pipeline table**: Add `verify-api-surface` at array index 6 (after monitor-lifecycle at index 5, before verify-pr which shifts to index 7). Renumber all subsequent phases using array indices consistently.
- **CI Integration section**: Replace the placeholder example with the actual job configuration and document the required GitHub secrets (`LINEAR_API_KEY`, `E2E_GITHUB_TOKEN`, `OPENAI_API_KEY`, `CODEX_AUTH_JSON`). Note that `OPENAI_API_KEY` is not validated at preflight -- failure surfaces during `monitor-lifecycle`.
- **Output section**: Add `e2e-junit.xml` to the report directory listing. Describe that JUnit output is included in the `e2e-reports/` artifact for download. Note the `EnricoMi/publish-unit-test-result-action` step renders results in the PR checks UI.
- **Config Reference**: Note the existence of `scripts/e2e-config.ci.yaml` for CI use and that it uses literal path `/tmp/codex-auth` for `source_home`.
- **Operational note**: Doc-only pushes (matching `paths-ignore: ["**.md", "docs/**"]`) skip the E2E job. This is by design.
- **Concurrency note**: With `cancel-in-progress: false`, rapid pushes queue behind the current run (up to 30 minutes).

**Patterns to follow:**
- Existing `docs/E2E_TESTING.md` structure and table format

**Test scenarios:**

Test expectation: none -- documentation.

**Verification:**
- Phase numbering in the doc matches the actual PHASES array (using array indices, not legacy "phase N.N" labels)
- All required secrets are documented
- `e2e-junit.xml` appears in the output file listing

## System-Wide Impact

- **Interaction graph:** The new `verify-api-surface` phase interacts with all HTTP route handlers via `fetchJson` / raw `fetch`. It does not mutate any state -- all calls are GET requests. The JUnit writer only touches the filesystem (report directory).
- **Error propagation:** If `verify-api-surface` fails, subsequent non-`alwaysRun` phases (`verify-pr`, `verify-linear`, `restart-resilience`) are skipped. `collect-artifacts` and `cleanup` still run. This matches existing behavior for any phase failure. Individual endpoint failures within the phase are isolated via per-endpoint `try/catch` -- all endpoints are checked even if some fail.
- **State lifecycle risks:** None. The phase is read-only against the API. The CI job uses `continue-on-error: true` so it cannot block any downstream job.
- **API surface parity:** No API changes. The phase is a consumer of existing endpoints.
- **Integration coverage:** The phase validates endpoint availability and response shapes in a real running Symphony instance -- coverage that mocked Playwright tests cannot provide.
- **Unchanged invariants:** The existing `e2e-summary.json` format is untouched. The PHASES pipeline behavior (skip-on-failure, alwaysRun) is unchanged. The `build-and-test` gate is unmodified. `docker-push` continues to depend only on `build-and-test`.

## Risks & Dependencies

| Risk | Likelihood | Impact | Mitigation | Rollback |
|------|-----------|--------|------------|----------|
| Codex auth.json tokens expire between refreshes | Medium | Medium | `AUTH_EXPIRED` diagnosis in reporting catches it; periodic manual token refresh | Job is non-blocking; failures are informational |
| `/api/v1/workspaces` returns 503 in CI (no workspace config) | Low | Low | Phase uses raw `fetch()` and treats 503 as non-fatal skip | N/A |
| SSE connection hangs if Symphony is unresponsive | Low | Medium | Two-layer timeout: `AbortSignal.timeout(5000)` on `fetch()` + 3s read timeout via `Promise.race` on `reader.read()` | Phase times out; controller aborted in `finally`; pipeline continues |
| CI runner lacks Docker (needed for Codex sandbox) | Low | High | Ubuntu 24.04 runners include Docker; verified in requirements | Preflight phase catches this and fails early |
| `CODEX_AUTH_JSON` secret not configured | Medium | High | Preflight checks for `auth.json` existence; clear error message | Job fails visibly; other jobs unaffected |
| `OPENAI_API_KEY` secret not configured | Medium | Medium | Not checked at preflight; failure surfaces during `monitor-lifecycle` with `AUTH_EXPIRED` diagnosis | Job is non-blocking; diagnosis is clear |
| GitHub Actions concurrency group stalls if a run hangs | Low | Medium | `timeout-minutes: 30` ensures the job is killed; `cancel-in-progress: false` means up to 30 min queue latency for subsequent pushes | Next push triggers a new run (after current finishes or times out) |

## Documentation / Operational Notes

- Operators must configure four GitHub secrets: `LINEAR_API_KEY`, `E2E_GITHUB_TOKEN` (PAT with repo scope), `OPENAI_API_KEY`, `CODEX_AUTH_JSON` (base64-encoded `auth.json`)
- `OPENAI_API_KEY` is not validated at preflight; if missing, the failure surfaces during `monitor-lifecycle` with an `AUTH_EXPIRED` classification
- The `sentinel-test-arena` test repo must remain writable by the PAT
- JUnit XML is included in the `e2e-reports/` artifact for download. The `EnricoMi/publish-unit-test-result-action@v2` step renders phase results as PR check annotations. Without that action, JUnit output is download-only.
- The E2E job adds ~10-15 minutes to the CI pipeline but runs in parallel with `docker-push` and never blocks it
- With `cancel-in-progress: false`, rapid pushes to main queue behind the current E2E run (up to 30 minutes latency for subsequent push results)
- Doc-only pushes matching the CI workflow's `paths-ignore` pattern skip the E2E job entirely

## Sources & References

- **Origin document:** `docs/brainstorms/2026-03-30-e2e-ci-coverage-expansion-requirements.md`
- Related code: `scripts/e2e-lib/phases-lifecycle.ts`, `scripts/e2e-lib/phases-teardown.ts`, `scripts/e2e-lib/reporting.ts`, `scripts/e2e-lifecycle.ts`
- Related code: `src/http/routes.ts`, `src/http/route-helpers.ts`, `src/http/workspace-inventory.ts`, `src/http/git-context.ts`, `src/http/sse.ts`, `src/http/attempt-handler.ts`
- CI workflow: `.github/workflows/ci.yml`
- Config: `scripts/e2e-config.yaml`, `scripts/e2e-lib/types.ts` (Zod schema)
- Docs: `docs/E2E_TESTING.md`
- Review history: `reviews/001-review-claude-opus-2026-03-30.md`, `reviews/002-counter-codex-2026-03-30.md`, `reviews/003-counter-claude-opus-2026-03-30.md`
