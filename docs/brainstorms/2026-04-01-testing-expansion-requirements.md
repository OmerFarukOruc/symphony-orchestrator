---
date: 2026-04-01
topic: testing-expansion
---

# Testing Expansion

## Problem Frame

Risoluto is approaching v1 with strong unit test coverage (244 test files) and mocked E2E tests (21 smoke/visual specs), but critical integration seams are untested:

- **8 SQLite persistence modules** have unit tests but zero integration tests — migrations, WAL behavior, restart persistence, and cross-module workflows are never exercised against a real database
- **27 API endpoints** have no response validation against the OpenAPI schema — the spec exists and is served but never tested against actual responses
- **SSE event propagation** (the entire live-update model) has no integration test covering the webhook → backend → SSE → browser flow
- **Orchestrator restart/recovery** (duplicate webhooks, crash recovery, abort races) has no integration coverage
- **Mutation testing** covers 47 modules but has no enforced break threshold — the score is informational only
- **Visual regression** covers 4 spec files (7 baselines) — most operator-critical routes are unprotected

This matters because: pre-v1 hardening requires the test posture to match production-grade expectations; regressions are feared or experienced; CI needs to graduate from "catch obvious breaks" to "catch subtle integration issues."

## Requirements

**Foundation: Source of Truth (Phase A)**

- R1. OpenAPI spec sync test: runtime-generated spec (`getOpenApiSpec()`) must match checked-in spec (`docs-site/openapi.json`) exactly. PR gate.
- R2. OpenAPI schema tightening: routes returning untyped `type: object` (e.g., `/api/v1/state`, `/api/v1/transitions`) must have proper response schemas before contract tests are written. This is a prerequisite for R5.
- R3. SQLite shared-runtime integration tests using real temp-file databases (not `:memory:`): bootstrap, migration, WAL, restart persistence, concurrent access, and all store module operations. PR gate.
- R4. Shared HTTP server harness (`tests/helpers/http-server-harness.ts`): starts a real `HttpServer` with temp SQLite DB. Reused by contract tests (R5), SSE tests (R6), orchestrator recovery tests (R7), and full-stack E2E (R8-R11).
- R5. AJV response contract tests for all 27 API endpoints: real HTTP requests against the running server, validated against compiled OpenAPI response schemas. Include error response validation (400, 404, 422). PR gate.
- R6. SSE contract tests: connect to `/api/v1/events`, verify initial event, trigger state changes via API, assert correct event envelope arrives, test disconnect/reconnect recovery. PR gate.
- R7. Orchestrator restart/recovery/idempotency tests: duplicate webhook delivery (same `deliveryId` processed once), restart mid-run (state from DB not re-dispatched), abort+completion race (deterministic winner), repeated refresh (coalesced), crash recovery. PR gate.

**Full-Stack E2E (Phase B)**

- R8. New Playwright project `fullstack` in `playwright.config.ts`. Uses real Risoluto backend serving built frontend — NOT Vite dev server. Tests the production-shape serving path.
- R9. Webhook-to-UI test: POST signed webhook directly to `/webhooks/linear` (no mock Linear server) → browser's overview page reflects the state change via real SSE push within 3 seconds, without page reload.
- R10. Issue lifecycle test: webhook triggers agent pickup → UI shows "Running" → webhook triggers completion → UI shows "Done" with attempt count incremented. All via real SSE.
- R11. SSE reconnect test: browser connects to SSE → simulate server restart (stop + start backend) → browser EventSource reconnects → POST webhook after reconnect → browser still receives the update.
- R12. API error handling test: navigate to non-existent issue → 404 error state rendered; abort non-running issue → correct error message shown.
- R13. Full-stack E2E runs in nightly CI lane (not PR gate — too slow).

**Live Provider Smoke (Phase C)**

- R14. Linear live smoke: auth check, query issues, issue lifecycle (create → transition → comment → delete), pagination, webhook register/deregister. Guarded by `LINEAR_API_KEY` + `LINEAR_TEST_TEAM_ID`. Full cleanup after each test.
- R15. GitHub live smoke: auth check, create draft PR, detect duplicate PR, add comment, fetch status, cleanup (close PR + delete branch). Guarded by `GITHUB_TOKEN` + `GITHUB_TEST_REPO`.
- R16. Docker live smoke: spawn minimal container, assert startup/stdout/exit, verify cleanup, test mount behavior, stats collection. Guarded by `DOCKER_TEST_ENABLED`.
- R17. All three run in nightly CI with credentials from GitHub Actions secrets. Skip gracefully on PR builds when credentials are absent.

**Visual Baseline Expansion (Phase D)**

- R18. Expand from 4 visual spec files (7 baselines) to ~25 baselines covering operator-critical routes and empty/error states. Target spec files: issue-detail, attempt-detail, empty-states, error-states, observability, workspaces, templates, audit, settings-tabs.
- R19. All new visual tests use `freezeClock(page)` + `installScreenshotCss(page)` for deterministic output.
- R20. Deliberately excluded from visual coverage: `/logs/:id` (non-deterministic stream), responsive breakpoints (separate task), dark mode (separate task).
- R21. Visual tests run in nightly CI lane.

**Mutation Ratchet (Phase E)**

- R22. Expand Stryker mutate array to include: HTTP layer (routes, webhook-handler, sse, validation, transitions-api, attempt-handler, workspace-inventory), persistence layer (attempt-store-sqlite, issue-config-store, webhook-inbox, migrator), external clients (linear/client, linear/issue-pagination, github/github-pr-client), secrets/notification, setup logic. Target: ~65/196 src files (curated).
- R23. Enforce progressive break thresholds: 70 → 80 → 90. Final ceiling is 90% (deliberately above the Oracle's 85 recommendation — accept some test contortion cost for v1 confidence).
- R24. Incremental mutation testing on every PR (changed files only). Full mutation pass runs nightly.
- R25. After each threshold raise, read `reports/stryker-report.html`, add targeted tests for meaningful survivors. Leave acceptable survivors: logging-only paths, metrics increments, retry jitter, defensive impossible branches, error message wording.

**Test Infrastructure**

- R26. Test isolation: temp directories with unique suffixes per test, cleanup in `afterEach`. Real temp-file SQLite DBs (not `:memory:`).
- R27. Flake prevention: both good isolation patterns AND Vitest retry config for integration tests (`retry: 2`). Belt and suspenders.
- R28. New package.json scripts: `test:integration:sqlite`, `test:integration:contracts`, `test:integration:live`, `test:e2e:fullstack`, `test:all`.

**CI Pipeline**

- R29. PR gate adds: `test:integration` (SQLite, contracts, SSE, recovery) + `test:mutation:incremental`. No time ceiling — parallelize as needed.
- R30. Nightly adds: `fullstack` Playwright project, `visual` Playwright project, full mutation pass, live provider smoke tests (credential-gated).
- R31. Manual/release: existing `./scripts/run-e2e.sh` unchanged.

## Success Criteria

- SC1. 0 → ~50 true integration test cases across SQLite + contracts + SSE + recovery
- SC2. 0 → 4 full-stack E2E spec files (~15 test cases)
- SC3. 0 → 3 live provider smoke files (~20 test cases)
- SC4. 7 → ~25 visual baselines
- SC5. 27/27 API endpoints validated against OpenAPI schema
- SC6. Mutation break threshold enforced at 90% on curated targets
- SC7. All integration tests pass in PR gate without external credentials
- SC8. Nightly CI runs full-stack E2E, visual regression, full mutation, and live provider smoke

## Scope Boundaries

- **In scope**: integration tests, full-stack E2E, live provider smoke, visual expansion, mutation ratchet, CI pipeline updates, shared test harness, OpenAPI schema tightening
- **Out of scope**: responsive breakpoint visual tests, dark mode visual tests, log stream visual tests, Playwright mobile viewport tests, new unit tests (existing coverage is strong), CI runtime optimization beyond parallelization

## Key Decisions

- **Direct webhook injection** over mock Linear server: POST signed webhooks directly to `/webhooks/linear` in full-stack E2E. Simpler, less maintenance, tests the real webhook handler. (vs. building a tiny Express server to mimic Linear delivery)
- **Tighten schemas first**: fix untyped OpenAPI response schemas before writing contract tests. Testing `type: object` proves nothing.
- **90% mutation ceiling**: deliberately above Oracle's 85% recommendation. Accept test contortion cost for v1 ship confidence.
- **Max parallelism execution**: build shared harness first, then fan out all phases in a single integration branch.
- **No CI time ceiling**: gate on test value, parallelize in CI as needed. Don't sacrifice coverage for speed.
- **Belt-and-suspenders flake prevention**: test isolation (temp DBs, unique ports, cleanup) AND Vitest retry config for integration tests.

## Dependencies / Assumptions

- `tests/helpers/` directory does not exist — must be created for the shared HTTP server harness (R4)
- OpenAPI schema tightening (R2) blocks AJV contract tests (R5)
- HTTP server harness (R4) blocks R5, R6, R7, R8-R12
- GitHub Actions secrets (`LINEAR_API_KEY`, `GITHUB_TOKEN`, `LINEAR_TEST_TEAM_ID`, `GITHUB_TEST_REPO`, `DOCKER_TEST_ENABLED`) must be configured for nightly live provider tests
- Existing E2E mock layer, page objects, and fixtures remain unchanged — full-stack E2E adds a new Playwright project alongside the existing smoke/visual projects

## Outstanding Questions

### Deferred to Planning
- [Affects R4][Technical] What port allocation strategy prevents collisions when integration tests run in parallel? (dynamic port? atomic port counter?)
- [Affects R8][Technical] How should the fullstack Playwright project handle server lifecycle (global setup/teardown vs. per-test)? The plan suggests global setup — validate this against the real server bootstrap time.
- [Affects R5][Needs research] Which of the 27 endpoints currently have untyped `type: object` schemas? How many schemas need tightening?
- [Affects R9][Technical] How should webhook signature validation work in tests? Does the test need to sign payloads with the configured webhook secret?
- [Affects R22][Needs research] What is the current mutation score on the existing 47 files? This baseline determines how aggressive the 70 → 80 → 90 ratchet can be.
- [Affects R11][Technical] How to reliably simulate server restart in Playwright tests without flaking? (process restart vs. HTTP server stop/start)
