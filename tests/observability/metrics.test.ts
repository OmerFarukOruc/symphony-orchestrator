import { describe, expect, it } from "vitest";

import { MetricsCollector } from "../../src/observability/metrics.js";

describe("MetricsCollector", () => {
  it("serializes empty counters", () => {
    const metrics = new MetricsCollector();
    const output = metrics.serialize();

    expect(output).toContain("# TYPE risoluto_http_requests_total counter");
    expect(output).toContain("risoluto_http_requests_total 0");
  });

  it("increments counter with labels", () => {
    const metrics = new MetricsCollector();
    metrics.httpRequestsTotal.increment({ method: "GET", status: "200" });
    metrics.httpRequestsTotal.increment({ method: "GET", status: "200" });
    metrics.httpRequestsTotal.increment({ method: "POST", status: "202" });

    const output = metrics.serialize();
    expect(output).toContain('risoluto_http_requests_total{method="GET",status="200"} 2');
    expect(output).toContain('risoluto_http_requests_total{method="POST",status="202"} 1');
  });

  it("records histogram observations with buckets", () => {
    const metrics = new MetricsCollector();
    metrics.httpRequestDurationSeconds.observe(0.05);
    metrics.httpRequestDurationSeconds.observe(0.5);
    metrics.httpRequestDurationSeconds.observe(2.0);

    const output = metrics.serialize();
    expect(output).toContain("# TYPE risoluto_http_request_duration_seconds histogram");
    expect(output).toContain('le="0.05"} 1');
    expect(output).toContain('le="0.5"} 2');
    expect(output).toContain('le="+Inf"} 3');
    expect(output).toContain("risoluto_http_request_duration_seconds_count 3");
  });

  it("histogram tracks sum correctly", () => {
    const metrics = new MetricsCollector();
    metrics.httpRequestDurationSeconds.observe(0.1);
    metrics.httpRequestDurationSeconds.observe(0.3);
    metrics.httpRequestDurationSeconds.observe(1.6);

    const output = metrics.serialize();
    expect(output).toContain("risoluto_http_request_duration_seconds_sum 2");
  });

  it("histogram renders empty state correctly", () => {
    const metrics = new MetricsCollector();
    const output = metrics.serialize();

    expect(output).toContain("# HELP risoluto_http_request_duration_seconds");
    expect(output).toContain('risoluto_http_request_duration_seconds_bucket{le="+Inf"} 0');
    expect(output).toContain("risoluto_http_request_duration_seconds_sum 0");
    expect(output).toContain("risoluto_http_request_duration_seconds_count 0");
  });

  it("histogram counts all bucket boundaries correctly", () => {
    const metrics = new MetricsCollector();
    metrics.httpRequestDurationSeconds.observe(0.001);

    const output = metrics.serialize();
    expect(output).toContain('le="0.005"} 1');
    expect(output).toContain('le="0.01"} 1');
    expect(output).toContain('le="10"} 1');
    expect(output).toContain('le="+Inf"} 1');
  });

  it("histogram handles values exceeding all bucket boundaries", () => {
    const metrics = new MetricsCollector();
    metrics.httpRequestDurationSeconds.observe(999);

    const output = metrics.serialize();
    expect(output).toContain('le="10"} 0');
    expect(output).toContain('le="+Inf"} 1');
    expect(output).toContain("risoluto_http_request_duration_seconds_sum 999");
    expect(output).toContain("risoluto_http_request_duration_seconds_count 1");
  });

  it("histogram with labels formats output correctly", () => {
    const metrics = new MetricsCollector();
    metrics.httpRequestDurationSeconds.observe(0.05, { method: "GET" });
    metrics.httpRequestDurationSeconds.observe(1.0, { method: "GET" });

    const output = metrics.serialize();
    expect(output).toContain('risoluto_http_request_duration_seconds_bucket{method="GET",le="0.05"} 1');
    expect(output).toContain('risoluto_http_request_duration_seconds_bucket{method="GET",le="1"} 2');
    expect(output).toContain('risoluto_http_request_duration_seconds_bucket{method="GET",le="+Inf"} 2');
    expect(output).toContain('risoluto_http_request_duration_seconds_sum{method="GET"} 1.05');
    expect(output).toContain('risoluto_http_request_duration_seconds_count{method="GET"} 2');
  });

  it("histogram uses constant memory regardless of observation count", () => {
    const metrics = new MetricsCollector();

    // Observe 10,000 values -- with the old implementation this would store
    // 10,000 numbers; with streaming buckets the internal state stays fixed.
    for (let idx = 0; idx < 10_000; idx++) {
      metrics.httpRequestDurationSeconds.observe((idx % 200) * 0.1);
    }

    const output = metrics.serialize();
    expect(output).toContain("risoluto_http_request_duration_seconds_count 10000");
    expect(output).toContain('le="+Inf"} 10000');

    const histoLines = output.split("\n").filter((line) => line.startsWith("risoluto_http_request_duration_seconds"));
    expect(histoLines.length).toBe(14); // 11 buckets + +Inf + sum + count
  });

  it("tracks orchestrator polls and agent runs", () => {
    const metrics = new MetricsCollector();
    metrics.orchestratorPollsTotal.increment({ status: "ok" });
    metrics.agentRunsTotal.increment({ outcome: "normal" });
    metrics.agentRunsTotal.increment({ outcome: "failed" });

    const output = metrics.serialize();
    expect(output).toContain('risoluto_orchestrator_polls_total{status="ok"} 1');
    expect(output).toContain('risoluto_agent_runs_total{outcome="normal"} 1');
    expect(output).toContain('risoluto_agent_runs_total{outcome="failed"} 1');
  });
});
