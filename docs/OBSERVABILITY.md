# 📊 Symphony Observability

> How to monitor, trace, and alert on Symphony Orchestrator.

---

## Metrics

Symphony exposes Prometheus-format metrics at `GET /metrics` (when the metrics module is integrated into the HTTP server).

### Available Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `symphony_http_requests_total` | Counter | Total HTTP requests by method and status |
| `symphony_http_request_duration_seconds` | Histogram | Request latency distribution |
| `symphony_orchestrator_polls_total` | Counter | Orchestrator poll cycles by status |
| `symphony_agent_runs_total` | Counter | Agent run completions by outcome |

### Grafana Setup

1. Add Prometheus data source pointing at `http://<host>:4000/metrics`
2. Import or build dashboards using the metrics above

---

## Distributed Tracing

Every HTTP request gets an `X-Request-ID` header:

- **Incoming**: If the client sends `X-Request-ID`, it's preserved
- **Generated**: Otherwise a UUID v4 is generated
- **Response**: The ID is always returned in the response headers

Use this to correlate log entries across services. The logger can be enriched with the request ID via `getRequestId(req)` from `src/tracing.ts`.

---

## Error Tracking

Set the `SENTRY_DSN` environment variable to enable Sentry-compatible error tracking.

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

## Deployment Observability Checklist

- [ ] Prometheus scraping `/metrics` endpoint
- [ ] Grafana dashboard with HTTP, poll, and agent run panels
- [ ] Alert rules loaded for error rate, poll stalls, agent failures
- [ ] `SENTRY_DSN` configured for error tracking (optional)
- [ ] Log aggregation collecting Winston JSON output
