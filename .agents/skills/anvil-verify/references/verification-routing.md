# Verification Routing

If UI changed:

- run `visual-verify`
- run `ui-test` for critical or regression-prone flows
- run `pnpm exec playwright test --project=smoke` when operator-visible behavior changed
- run Impeccable skills only when findings exist

If backend or API changed:

- run relevant tests
- run API, CLI, or manual-flow verification
- confirm any user-visible wiring if the backend should surface in the UI

If the run touched real orchestration or lifecycle behavior:

- run `./scripts/run-e2e.sh --skip-build --keep-risoluto` when the environment is configured for live lifecycle testing
- inspect `e2e-reports/<run-id>/e2e-summary.json`, phase failures, and diagnostic output
- report both creation and teardown outcomes for transient artifacts such as the Linear issue, PR, and branch
- tell the operator whether the PR remains open, was closed by cleanup, or was preserved with `--keep`
- if the lifecycle E2E fails, observe the output, fix the underlying issue, and rerun until it passes
- record the E2E run id and verdict in `verification/summary.md`
- if the lifecycle E2E cannot run because credentials, Docker, or external fixtures are unavailable, record that as skipped / unavailable rather than silently omitting it

If docs impact exists:

- compare updated docs against claims

If tests impact exists:

- confirm required tests were added, updated, or deleted
