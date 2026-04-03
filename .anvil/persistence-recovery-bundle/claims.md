# Claims -- Persistence Recovery Bundle

- [passed] Dirty git-backed workspaces are no longer silently deleted during cleanup. Cleanup now probes for uncommitted changes, creates a rescue commit with `--no-verify` when possible, and preserves the workspace if the probe or rescue commit fails.
  Evidence: `src/workspace/manager.ts`, `src/git/manager.ts`, `tests/git/manager.test.ts`, `tests/workspace/manager.test.ts`, `tests/workspace/manager.integration.test.ts`
- [passed] Startup recovery classifies persisted `running` attempts into explicit outcomes (`resume`, `cleanup`, `escalate`, `skip`) and resumes viable work on the same attempt record instead of silently creating a replacement attempt.
  Evidence: `src/orchestrator/recovery.ts`, `src/orchestrator/orchestrator.ts`, `src/orchestrator/worker-launcher.ts`, `tests/orchestrator/recovery.test.ts`
- [passed] Operators can inspect the latest startup recovery report through `GET /api/v1/recovery`, and the response contract is reflected in the runtime schemas and checked-in OpenAPI artifact.
  Evidence: `src/http/routes.ts`, `src/http/response-schemas.ts`, `src/http/openapi-paths.ts`, `docs-site/openapi.json`, `tests/http/recovery-api.integration.test.ts`, `tests/http/response-schemas-core.test.ts`, `tests/http/openapi-paths.test.ts`, `tests/http/openapi-sync.test.ts`
