---
date: 2026-03-30
topic: e2e-ci-coverage-expansion
---

# E2E Lifecycle Test: CI/CD Integration & Coverage Expansion

## Problem Frame

The E2E lifecycle test (`./scripts/run-e2e.sh`) validates the full Symphony pipeline against real Linear, GitHub, and Codex APIs — coverage that unit tests and Playwright smoke tests cannot provide. It currently runs locally only, meaning regressions in the integration surface can ship undetected. The goal is to run it automatically in CI on every push to `main` and expand coverage to exercise the full API surface post-completion.

## Requirements

**CI/CD Integration**

- R1. Add a `e2e-lifecycle` job to the GitHub Actions CI workflow that runs on every push to `main`
- R2. The job must depend on the `build-and-test` gate — don't burn Codex tokens if quality gates fail
- R3. Use GitHub Actions concurrency groups to prevent parallel E2E runs (shared test repo would collide)
- R4. The job is always non-blocking (`continue-on-error: true`) — it reports status but never gates Docker push or other jobs
- R5. Codex auth is handled by injecting `auth.json` from a base64-encoded GitHub secret (`CODEX_AUTH_JSON`)
- R6. All other credentials (`LINEAR_API_KEY`, `GITHUB_TOKEN`, `OPENAI_API_KEY`) are injected as GitHub secrets via env vars
- R7. Create a separate `scripts/e2e-config.ci.yaml` that uses `$ENV_VAR` references for all credentials
- R8. Upload `e2e-reports/` as a GitHub Actions artifact on every run (pass or fail)

**Coverage Expansion**

- R9. Add a `verify-api-surface` phase that hits every relevant API endpoint after issue completion and validates response shapes
- R10. The phase must exercise at minimum: `/api/v1/state`, `/api/v1/{identifier}`, `/api/v1/{identifier}/attempts`, `/api/v1/attempts/{attempt_id}`, `/api/v1/runtime`, `/api/v1/models`, `/metrics`, `/api/v1/workspaces`, `/api/v1/git/context`, `/api/v1/events` (SSE)
- R11. The `verify-api-surface` phase runs after `monitorLifecycle` (issue is completed) and before `verify-pr`

**Reporting**

- R12. Add JUnit XML output generation so GitHub Actions renders phase-level results in the PR checks UI
- R13. JUnit output is written alongside `e2e-summary.json` in the report directory

## Success Criteria

- E2E lifecycle job runs automatically on every push to `main` after the quality gate passes
- A failing E2E test is visible as a red check on the commit but does not block any other job
- The `verify-api-surface` phase catches response shape regressions that unit tests miss
- JUnit results render in GitHub Actions for at-a-glance debugging

## Scope Boundaries

- No `verify-workspace`, `verify-attempt-persistence`, or `verify-dashboard` phases — these overlap with existing coverage (monitorLifecycle, collectArtifacts, Playwright smoke tests)
- No retry/failure scenario testing in CI — hard to make deterministic with real APIs
- No running on PRs — too expensive and slow; PRs are covered by unit + Playwright tests
- No changes to the existing `e2e-summary.json` format — JUnit is additive
- One test scenario per run — different scenarios can be rotated on a schedule later

## Key Decisions

- **Every push to main**: Maximum regression coverage; cost is non-issue with Codex subscription using a cheap/fast model
- **Non-blocking forever**: The E2E test hits real external APIs (Linear, GitHub, Codex) which can be flaky — never gate deployments on it
- **Separate CI config**: Avoids risk of breaking local dev workflow, even though the existing config supports env var expansion
- **verify-api-surface only**: The single highest-value new phase; workspace/persistence/dashboard checks overlap with existing coverage
- **JUnit XML**: GitHub Actions renders it natively, gives phase-level visibility without clicking into logs
- **Inject auth.json from secret**: Simpler than service account OAuth; tokens may need periodic refresh but that's manageable

## Dependencies / Assumptions

- GitHub secrets must be configured: `LINEAR_API_KEY`, `E2E_GITHUB_TOKEN` (PAT with repo scope), `OPENAI_API_KEY`, `CODEX_AUTH_JSON` (base64-encoded auth.json)
- The `sentinel-test-arena` test repo must remain available and writable
- Codex auth.json tokens stay valid long enough between refreshes (monitor for expiry failures)
- Ubuntu 24.04 runners have Docker pre-installed (confirmed: GitHub-hosted runners include Docker)

## Outstanding Questions

### Deferred to Planning

- [Affects R9][Technical] Exact response shape assertions for each API endpoint — need to read route handlers to determine expected fields
- [Affects R12][Technical] JUnit XML library choice — likely a lightweight writer (no heavy dependency needed for ~12 test cases)
- [Affects R5][Technical] How to handle auth.json token expiry gracefully — add a diagnostic category in reporting?
