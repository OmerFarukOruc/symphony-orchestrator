---
paths:
  - "src/**/*"
---

# Common Modification Patterns

## Adding a New API Endpoint

1. **Define request/response schema** in `src/http/request-schemas.ts` (Zod)
2. **Create handler** in `src/http/<feature>-handler.ts`
3. **Register route** in the appropriate domain module under `src/http/routes/`
4. **Update OpenAPI spec** in `src/http/openapi.ts`
5. **Wire deps** — handler receives `OrchestratorPort` and other ports via `HttpRouteDeps`
6. **Test** — add unit test in `tests/http/` + smoke E2E in `tests/e2e/specs/smoke/`

## Adding a New Tracker Adapter

1. **Implement `TrackerPort`** in `src/tracker/<name>-adapter.ts`
2. **Create client** in `src/<name>/client.ts`; use `src/utils/retry.ts` for retry logic
3. **Add factory branch** in `src/tracker/factory.ts` → `createTracker()`
4. **Extend `ServiceConfig`** in `src/core/types/config.ts` with new tracker kind
5. **Update config validation** in `src/config/builders.ts`
6. **Test** — mock TrackerPort methods in `tests/orchestrator/orchestrator-fixtures.ts`

## Extending the Orchestrator

1. **Add to `OrchestratorDeps`** in `src/orchestrator/runtime-types.ts` if new dependency
2. **Wire in `createServices()`** in `src/cli/services.ts`
3. **Tick behavior** → modify `lifecycle.ts` (reconcile/queue) or `worker-launcher.ts` (launch)
4. **New state** → add to `OrchestratorState` in `orchestrator-delegates.ts`
5. **New snapshot data** → update `snapshot-builder.ts` and `src/http/route-helpers.ts`
6. **Test** — use `tests/orchestrator/orchestrator-fixtures.ts` factories

## Adding a New Event

1. **Define event** in `src/core/risoluto-events.ts` → add to `RisolutoEventMap`
2. **Emit** via `eventBus.emit("eventName", payload)` at the source
3. **Consume** — subscribe in the relevant service (`httpServer`, `notificationManager`, etc.)
4. **Test** — use `TypedEventBus` directly in tests, no mocking needed
