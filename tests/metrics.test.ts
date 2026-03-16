import { describe, expect, it } from "vitest";

import { MetricsCollector } from "../src/metrics.js";

describe("MetricsCollector", () => {
  it("serializes empty counters", () => {
    const metrics = new MetricsCollector();
    const output = metrics.serialize();

    expect(output).toContain("# TYPE symphony_http_requests_total counter");
    expect(output).toContain("symphony_http_requests_total 0");
  });

  it("increments counter with labels", () => {
    const metrics = new MetricsCollector();
    metrics.httpRequestsTotal.increment({ method: "GET", status: "200" });
    metrics.httpRequestsTotal.increment({ method: "GET", status: "200" });
    metrics.httpRequestsTotal.increment({ method: "POST", status: "202" });

    const output = metrics.serialize();
    expect(output).toContain('symphony_http_requests_total{method="GET",status="200"} 2');
    expect(output).toContain('symphony_http_requests_total{method="POST",status="202"} 1');
  });

  it("records histogram observations with buckets", () => {
    const metrics = new MetricsCollector();
    metrics.httpRequestDurationSeconds.observe(0.05);
    metrics.httpRequestDurationSeconds.observe(0.5);
    metrics.httpRequestDurationSeconds.observe(2.0);

    const output = metrics.serialize();
    expect(output).toContain("# TYPE symphony_http_request_duration_seconds histogram");
    expect(output).toContain('le="0.05"} 1');
    expect(output).toContain('le="0.5"} 2');
    expect(output).toContain('le="+Inf"} 3');
    expect(output).toContain("symphony_http_request_duration_seconds_count 3");
  });

  it("tracks orchestrator polls and agent runs", () => {
    const metrics = new MetricsCollector();
    metrics.orchestratorPollsTotal.increment({ status: "ok" });
    metrics.agentRunsTotal.increment({ outcome: "normal" });
    metrics.agentRunsTotal.increment({ outcome: "failed" });

    const output = metrics.serialize();
    expect(output).toContain('symphony_orchestrator_polls_total{status="ok"} 1');
    expect(output).toContain('symphony_agent_runs_total{outcome="normal"} 1');
    expect(output).toContain('symphony_agent_runs_total{outcome="failed"} 1');
  });
});
