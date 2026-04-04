import { describe, expect, it } from "vitest";
import type { Request } from "express";

import { handleListAlertHistory } from "../../src/http/alerts-handler.js";
import { AlertHistoryStore } from "../../src/alerts/history-store.js";
import { makeMockResponse } from "../helpers.js";

function makeRequest(query: Record<string, unknown> = {}): Request {
  return { query } as unknown as Request;
}

describe("handleListAlertHistory", () => {
  it("lists stored alert history entries", async () => {
    const store = AlertHistoryStore.create(null);
    await store.create({
      ruleName: "worker-failures",
      eventType: "worker.failed",
      severity: "critical",
      status: "delivered",
      channels: ["ops-webhook"],
      deliveredChannels: ["ops-webhook"],
      failedChannels: [],
      message: "ENG-1 matched worker-failures",
      createdAt: "2026-04-04T11:30:00.000Z",
    });
    const res = makeMockResponse();

    await handleListAlertHistory({ alertHistoryStore: store }, makeRequest({ limit: "5" }), res);

    expect(res._status).toBe(200);
    expect((res._body as { history: unknown[] }).history).toHaveLength(1);
  });
});
