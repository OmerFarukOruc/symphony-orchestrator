# Verify Charter -- Persistence Recovery Bundle

## Verification questions

1. Does cleanup preserve dirty workspaces instead of silently losing work?
2. Does startup recovery make truthful, explicit decisions for orphaned sessions and workspaces?
3. Is the new recovery API wired through schemas, OpenAPI generation, and checked-in docs?
4. Do repo quality gates still pass on the final tree?

## Verification routes

- Focused behavior tests:
  - `pnpm test tests/workspace/manager.test.ts tests/workspace/manager.integration.test.ts tests/git/manager.test.ts tests/orchestrator/recovery.test.ts tests/orchestrator/restart-recovery.integration.test.ts tests/http/recovery-api.integration.test.ts tests/http/openapi-paths.test.ts tests/http/response-schemas-core.test.ts`
  - `pnpm test tests/http/openapi-sync.test.ts`
- Repo gates:
  - `pnpm run build`
  - `pnpm run lint`
  - `pnpm run format:check`
  - `pnpm test`

## Notes

- This bundle is backend-only. No Risoluto frontend source under `frontend/src/` changed, so `visual-verify` was not required for this run.
- The checked-in OpenAPI file needed regeneration after adding `/api/v1/recovery`; that was the only remaining verification blocker at resume time.
