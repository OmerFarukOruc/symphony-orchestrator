---
title: File-based observability snapshots with metrics, health, and traces
slug: issue-348-file-observability-snapshots
status: ready
created_at: 2026-04-06T16:15:28Z
source:
  kind: issue_url
  value: https://github.com/OmerFarukOruc/risoluto/issues/348
investigation:
  depth: standard
  files_read: 22
  completed_at: 2026-04-06T16:15:28Z
---

# File-based observability snapshots with metrics, health, and traces

## Summary

Risoluto already exposes runtime state at `/api/v1/state`, Prometheus text at `/metrics`, and request IDs via HTTP tracing middleware, but operators still need to stitch those surfaces together manually. This change adds a disk-backed observability snapshot layer that records per-component metrics, health surfaces, traces, and lightweight session state into JSON files under the archive directory, then exposes a unified `/api/v1/observability` endpoint that the dashboard can use directly.

## Current State

The backend has an in-memory `MetricsCollector` in `src/observability/metrics.ts`, request ID middleware in `src/observability/tracing.ts`, watchdog health in `src/orchestrator/watchdog.ts`, webhook health in `src/webhook/health-tracker.ts`, and a frontend observability page in `frontend/src/views/observability-view.ts`. The observability page currently fetches `/api/v1/state` and `/metrics` separately and has no unified JSON contract for traces or component health surfaces.

## Likely Touchpoints

- `src/observability/metrics.ts`
- `src/observability/tracing.ts`
- `src/observability/snapshot.ts`
- `src/observability/health.ts`
- `src/http/routes/system.ts`
- `src/http/openapi-paths.ts`
- `src/http/response-schemas.ts`
- `src/http/route-types.ts`
- `src/http/server.ts`
- `src/http/sse.ts`
- `src/orchestrator/orchestrator.ts`
- `src/orchestrator/orchestrator-delegates.ts`
- `src/cli/services.ts`
- `frontend/src/api.ts`
- `frontend/src/types.ts`
- `frontend/src/views/observability-view.ts`
- `frontend/src/views/observability-state.ts`
- `frontend/src/views/observability-sections.ts`
- `tests/http/routes.test.ts`
- `tests/http/openapi-paths.test.ts`
- `tests/http/server.test.ts`
- `tests/frontend/api.test.ts`

## Constraints

Keep `/metrics` and `/api/v1/state` intact because other operator surfaces and tests already depend on them. Reuse the existing archive directory wiring instead of inventing a separate service. Bound in-memory trace retention so the snapshot files do not grow without limit. Preserve the existing `LOG_LEVEL` behavior in `src/core/logger.ts` and prove it through documentation or tests instead of forking logger behavior.

## Acceptance Criteria

- A per-component observer records structured counters and traces for orchestrator poll cycles, worker launches and outcomes, HTTP requests, and SSE connections.
- Observer snapshots are written atomically to a configurable on-disk location rooted in the service archive directory.
- Health surfaces are queryable for at least orchestrator, HTTP, SSE, and persistence/database availability.
- `GET /api/v1/observability` returns an aggregated JSON summary that includes health, metrics, traces, runtime state, and raw Prometheus text.
- The observability dashboard reads health status from the new observability endpoint while keeping raw metrics visible.
- Unit and route tests cover snapshot persistence, aggregation, and API contract changes.

## References

- https://github.com/OmerFarukOruc/risoluto/issues/348
- src/observability/metrics.ts
- src/observability/tracing.ts
- src/http/routes/system.ts
- src/http/openapi-paths.ts
- src/orchestrator/orchestrator.ts
- src/orchestrator/orchestrator-delegates.ts
- src/http/sse.ts
- frontend/src/views/observability-view.ts
