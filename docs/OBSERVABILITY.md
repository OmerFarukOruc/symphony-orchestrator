# 📊 Symphony Observability

> How to monitor, trace, and alert on Symphony Orchestrator.

---

## Current Shipped Surface

The currently shipped operator surface includes:

- `GET /api/v1/state` with `codex_totals`, `rate_limits`, and `recent_events`
- Archived attempt and event history under `.symphony/`
- Structured logger support used throughout the runtime

The repository also contains observability helper modules for metrics, request tracing, and error tracking, but they are **not yet wired into the default HTTP server or CLI startup path**.

## Metrics Helper

`src/metrics.ts` includes a Prometheus-style collector, but the default server does **not** currently expose `GET /metrics`.

### Available Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `symphony_http_requests_total` | Counter | Total HTTP requests by method and status |
| `symphony_http_request_duration_seconds` | Histogram | Request latency distribution |
| `symphony_orchestrator_polls_total` | Counter | Orchestrator poll cycles by status |
| `symphony_agent_runs_total` | Counter | Agent run completions by outcome |

If you wire the collector into a custom server build later, these are the metrics it is designed to emit.

---

## Request Tracing Helper

`src/tracing.ts` provides middleware that preserves or generates `X-Request-ID`, but the default `HttpServer` does **not** currently attach it to all responses.

If you integrate the middleware, the behavior is:

- **Incoming**: If the client sends `X-Request-ID`, it's preserved
- **Generated**: Otherwise a UUID v4 is generated
- **Response**: The ID is always returned in the response headers

The logger can be enriched with the request ID via `getRequestId(req)` from `src/tracing.ts`.

---

## Error Tracking Helper

`src/error-tracking.ts` can initialize a Sentry-compatible tracker when `SENTRY_DSN` is set, but the default CLI does **not** currently call it during startup.

If you opt into that integration later:

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

Control runtime behavior via `SYMPHONY_FLAGS` env var or a `flags.json` file:

```bash
# Environment
export SYMPHONY_FLAGS="new_dashboard,parallel_agents"

# File (placed in working directory)
echo '{"experimental_retry": true}' > flags.json
```

Check flag state via `isEnabled("flag_name")` from `src/feature-flags.ts`.

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
- [x] Archived attempts preserve event history for postmortems
- [ ] `/metrics` is exposed by the default server
- [ ] `X-Request-ID` tracing is enabled in the default server
- [ ] `SENTRY_DSN` is wired into the default CLI startup path
