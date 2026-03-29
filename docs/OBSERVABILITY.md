# 📊 Symphony Observability

> How to monitor, trace, and alert on Symphony Orchestrator.

---

## Current Shipped Surface

The currently shipped operator surface includes:

- `GET /api/v1/state` with `codex_totals`, `rate_limits`, and `recent_events`
- `workflow_columns` in the state snapshot for dashboard-stage rendering
- `GET /metrics` with Prometheus-format service metrics
- Request tracing via `X-Request-ID` headers (auto-generated or preserved from client)
- Error tracking initialized on CLI startup (Sentry-compatible when `SENTRY_DSN` is set)
- Archived attempt and event history in `.symphony/symphony.db` (SQLite, WAL mode)
- Structured logger support used throughout the runtime

## Metrics Helper

`src/observability/metrics.ts` is now exposed by the default server at `GET /metrics`.

### Available Metrics

| Metric                                   | Type      | Description                              |
| ---------------------------------------- | --------- | ---------------------------------------- |
| `symphony_http_requests_total`           | Counter   | Total HTTP requests by method and status |
| `symphony_http_request_duration_seconds` | Histogram | Request latency distribution             |
| `symphony_orchestrator_polls_total`      | Counter   | Orchestrator poll cycles by status       |
| `symphony_agent_runs_total`              | Counter   | Agent run completions by outcome         |

These are the metrics the default server now emits.

---

## Request Tracing

`src/observability/tracing.ts` provides middleware that preserves or generates `X-Request-ID`. This middleware is **enabled by default** in the HTTP server.

The behavior is:

- **Incoming**: If the client sends `X-Request-ID`, it's preserved
- **Generated**: Otherwise a UUID v4 is generated
- **Response**: The ID is always returned in the response headers

The logger can be enriched with the request ID via `getRequestId(req)` from `src/observability/tracing.ts`.

---

## Error Tracking

`src/core/error-tracking.ts` is initialized on CLI startup. When `SENTRY_DSN` is set, it provides Sentry-compatible error tracking.

To enable Sentry integration:

```bash
export SENTRY_DSN=https://your-key@sentry.io/project-id
```

When enabled:

- Exceptions are captured with full stack traces
- Breadcrumbs track the last 100 operations
- Context (issue identifier, attempt count) is attached to errors
- DSN is redacted in log output for security

When `SENTRY_DSN` is not set, a no-op tracker is used with zero overhead.

---

## Feature Flags

Feature flags were removed in v0.5.0. The `/api/v1/runtime` endpoint returns an empty `feature_flags` object for backward compatibility.

---

## Example Alert Rules (Prometheus)

```yaml
groups:
  - name: symphony
    rules:
      - alert: HighErrorRate
        expr: rate(symphony_http_requests_total{status=~"5.."}[5m]) / rate(symphony_http_requests_total[5m]) > 0.05
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Symphony HTTP error rate above 5%"

      - alert: AgentRunFailures
        expr: rate(symphony_agent_runs_total{outcome="failed"}[15m]) > 0
        for: 15m
        labels:
          severity: critical
        annotations:
          summary: "Agent runs failing consistently"

      - alert: PollStalled
        expr: increase(symphony_orchestrator_polls_total[10m]) == 0
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Orchestrator hasn't polled in 10 minutes"
```

---

## Reality Check

- [x] Runtime snapshot includes token totals, rate limits, and recent events
- [x] Runtime snapshot includes workflow columns for configurable dashboard stages
- [x] Archived attempts preserve event history for postmortems
- [x] `/metrics` is exposed by the default server
- [x] `X-Request-ID` tracing is enabled in the default server
- [x] Error tracking is initialized on CLI startup (Sentry-compatible when `SENTRY_DSN` is set)
