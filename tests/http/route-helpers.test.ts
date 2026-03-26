import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

import {
  methodNotAllowed,
  serializeSnapshot,
  sanitizeConfigValue,
  refreshReason,
} from "../../src/http/route-helpers.js";
import type { RuntimeSnapshot } from "../../src/core/types.js";

function makeResponse(): Response & { _status: number; _body: unknown } {
  const res = {
    _status: 200,
    _body: null as unknown,
    status(code: number) {
      res._status = code;
      return res;
    },
    json(data: unknown) {
      res._body = data;
      return res;
    },
  };
  return res as unknown as Response & { _status: number; _body: unknown };
}

describe("methodNotAllowed", () => {
  it("returns 405 with error JSON", () => {
    const res = makeResponse();
    methodNotAllowed(res);
    expect(res._status).toBe(405);
    expect((res._body as Record<string, { code: string }>).error.code).toBe("method_not_allowed");
  });
});

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
});

describe("sanitizeConfigValue", () => {
  it("redacts keys containing 'api_key'", () => {
    const result = sanitizeConfigValue({ api_key: "secret123" });
    expect(result).toEqual({ api_key: "[REDACTED]" });
  });

  it("redacts keys containing 'token'", () => {
    const result = sanitizeConfigValue({ access_token: "abc" });
    expect(result).toEqual({ access_token: "[REDACTED]" });
  });

  it("redacts keys containing 'secret'", () => {
    const result = sanitizeConfigValue({ client_secret: "xyz" });
    expect(result).toEqual({ client_secret: "[REDACTED]" });
  });

  it("redacts keys containing 'webhook'", () => {
    const result = sanitizeConfigValue({ webhookUrl: "https://hooks.slack.com/xxx" });
    expect(result).toEqual({ webhookUrl: "[REDACTED]" });
  });

  it("redacts keys containing 'password'", () => {
    const result = sanitizeConfigValue({ password: "hunter2" });
    expect(result).toEqual({ password: "[REDACTED]" });
  });

  it("does not redact safe keys", () => {
    const result = sanitizeConfigValue({ model: "gpt-4o", port: 4000 });
    expect(result).toEqual({ model: "gpt-4o", port: 4000 });
  });

  it("redacts nested values under sensitive branches like 'headers'", () => {
    const result = sanitizeConfigValue({
      http: { headers: { authorization: "Bearer xyz" } },
    });
    const http = (result as Record<string, unknown>).http as Record<string, unknown>;
    // The entire headers branch is redacted because 'headers' matches the sensitive-branch pattern
    expect(http.headers).toBe("[REDACTED]");
  });

  it("handles arrays recursively", () => {
    const result = sanitizeConfigValue({ items: [{ name: "ok" }, { apiKey: "secret" }] });
    const items = (result as Record<string, unknown[]>).items;
    expect((items[0] as Record<string, string>).name).toBe("ok");
    expect((items[1] as Record<string, string>).apiKey).toBe("[REDACTED]");
  });

  it("handles empty objects and arrays", () => {
    expect(sanitizeConfigValue({})).toEqual({});
    expect(sanitizeConfigValue([])).toEqual([]);
  });

  it("returns primitives unchanged for non-sensitive paths", () => {
    expect(sanitizeConfigValue("hello")).toBe("hello");
    expect(sanitizeConfigValue(42)).toBe(42);
    expect(sanitizeConfigValue(true)).toBe(true);
    expect(sanitizeConfigValue(null)).toBe(null);
  });
});

describe("refreshReason", () => {
  it("returns custom header when present", () => {
    const req = { get: vi.fn().mockReturnValue("manual_trigger") } as unknown as Request;
    expect(refreshReason(req)).toBe("manual_trigger");
  });

  it("returns default when header is absent", () => {
    const req = { get: vi.fn().mockReturnValue(undefined) } as unknown as Request;
    expect(refreshReason(req)).toBe("http_refresh");
  });
});
