import { describe, expect, it } from "vitest";

import { serializeSnapshot } from "../../src/orchestrator/snapshot-serialization.js";
import type { RuntimeSnapshot } from "../../src/core/types.js";

describe("serializeSnapshot", () => {
  it("serializes snapshot with snake_case keys", () => {
    const snapshot = {
      generatedAt: "2024-01-01T00:00:00Z",
      counts: { running: 1, retrying: 0, queued: 2, completed: 3 },
      running: [{ id: "r1" }],
      retrying: [],
      completed: [{ id: "c1" }],
      queued: [{ id: "q1" }],
      workflowColumns: [{ key: "todo", label: "Todo", kind: "active", terminal: false, count: 1, issues: [] }],
      codexTotals: { inputTokens: 100, outputTokens: 50, totalTokens: 150, secondsRunning: 30, costUsd: 0.000625 },
      rateLimits: null,
      recentEvents: [
        {
          at: "2024-01-01T00:00:00Z",
          issueId: "i1",
          issueIdentifier: "MT-1",
          sessionId: "s1",
          event: "test",
          message: "hello",
          content: null,
          metadata: { stage: "workspace" },
        },
      ],
    } as unknown as RuntimeSnapshot & Record<string, unknown>;

    const result = serializeSnapshot(snapshot);
    expect(result.generated_at).toBe("2024-01-01T00:00:00Z");
    expect(result.codex_totals).toEqual({
      input_tokens: 100,
      output_tokens: 50,
      total_tokens: 150,
      seconds_running: 30,
      cost_usd: 0.000625,
    });
    expect((result.workflow_columns as Array<Record<string, unknown>>)[0].terminal).toBe(false);
    const events = result.recent_events as Array<Record<string, unknown>>;
    expect(events[0].issue_id).toBe("i1");
    expect(events[0].issue_identifier).toBe("MT-1");
    expect(events[0].metadata).toEqual({ stage: "workspace" });
  });

  it("defaults missing workflow column issues to an empty array", () => {
    const snapshot = {
      generatedAt: "2024-01-01T00:00:00Z",
      counts: { running: 0, retrying: 0, queued: 0, completed: 0 },
      running: [],
      retrying: [],
      completed: [],
      queued: [],
      workflowColumns: [
        {
          key: "todo",
          label: "Todo",
          kind: "todo",
          terminal: false,
          count: undefined,
          issues: undefined,
        },
      ],
      codexTotals: { inputTokens: 0, outputTokens: 0, totalTokens: 0, secondsRunning: 0, costUsd: null },
      rateLimits: null,
      recentEvents: [],
    } as unknown as RuntimeSnapshot & Record<string, unknown>;

    const result = serializeSnapshot(snapshot);
    const column = (result.workflow_columns as Array<Record<string, unknown>>)[0];
    expect(column.issues).toEqual([]);
    expect(column.count).toBe(0);
  });

  it("serializes optional snapshot sections and event fallbacks", () => {
    const snapshot = {
      generatedAt: "2024-01-02T00:00:00Z",
      counts: { running: 2, retrying: 1, queued: 0, completed: 4 },
      running: [{ id: "r2" }],
      retrying: [{ id: "retry-1" }],
      completed: undefined,
      queued: undefined,
      workflowColumns: undefined,
      codexTotals: { inputTokens: 20, outputTokens: 10, totalTokens: 30, secondsRunning: 5, costUsd: 0.25 },
      rateLimits: { remaining: 10 },
      recentEvents: [
        {
          at: "2024-01-02T00:00:00Z",
          issueId: "i2",
          issueIdentifier: "MT-2",
          sessionId: "s2",
          event: "queued",
          message: "queued",
          content: undefined,
          metadata: undefined,
        },
      ],
      stallEvents: [
        {
          at: "2024-01-02T00:01:00Z",
          issueId: "i2",
          issueIdentifier: "MT-2",
          silentMs: 5000,
          timeoutMs: 10000,
        },
      ],
      systemHealth: {
        status: "healthy",
        checkedAt: "2024-01-02T00:02:00Z",
        runningCount: 2,
        message: "ok",
      },
      webhookHealth: {
        status: "healthy",
        effectiveIntervalMs: 30000,
        stats: {
          deliveriesReceived: 3,
          lastDeliveryAt: "2024-01-02T00:03:00Z",
          lastEventType: "issues.update",
        },
        lastDeliveryAt: "2024-01-02T00:03:00Z",
        lastEventType: "issues.update",
      },
    } as unknown as RuntimeSnapshot & Record<string, unknown>;

    const result = serializeSnapshot(snapshot);

    expect(result.queued).toEqual([]);
    expect(result.completed).toEqual([]);
    expect(result.workflow_columns).toEqual([]);
    expect((result.recent_events as Array<Record<string, unknown>>)[0]).toMatchObject({
      content: null,
      metadata: null,
    });
    expect(result.stall_events).toEqual([
      {
        at: "2024-01-02T00:01:00Z",
        issue_id: "i2",
        issue_identifier: "MT-2",
        silent_ms: 5000,
        timeout_ms: 10000,
      },
    ]);
    expect(result.system_health).toEqual({
      status: "healthy",
      checked_at: "2024-01-02T00:02:00Z",
      running_count: 2,
      message: "ok",
    });
    expect(result.webhook_health).toEqual({
      status: "healthy",
      effective_interval_ms: 30000,
      stats: {
        deliveries_received: 3,
        last_delivery_at: "2024-01-02T00:03:00Z",
        last_event_type: "issues.update",
      },
      last_delivery_at: "2024-01-02T00:03:00Z",
      last_event_type: "issues.update",
    });
  });

  it("derives workflow column count from issues length when count is missing", () => {
    const snapshot = {
      generatedAt: "2024-01-01T00:00:00Z",
      counts: { running: 0, retrying: 0, queued: 0, completed: 0 },
      running: [],
      retrying: [],
      completed: [],
      queued: [],
      workflowColumns: [
        {
          key: "triage",
          label: "Triage",
          kind: "active",
          terminal: true,
          count: undefined,
          issues: [{ id: "a" }, { id: "b" }],
        },
      ],
      codexTotals: { inputTokens: 0, outputTokens: 0, totalTokens: 0, secondsRunning: 0, costUsd: null },
      rateLimits: null,
      recentEvents: [],
    } as unknown as RuntimeSnapshot & Record<string, unknown>;

    const result = serializeSnapshot(snapshot);
    expect((result.workflow_columns as Array<Record<string, unknown>>)[0]).toMatchObject({
      terminal: true,
      count: 2,
      issues: [{ id: "a" }, { id: "b" }],
    });
  });
});
