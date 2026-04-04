import { describe, expect, it, vi, beforeAll, afterAll } from "vitest";
import express from "express";
import http from "node:http";

vi.mock("../../src/codex/model-list.js", () => ({
  fetchCodexModels: vi.fn().mockResolvedValue(null),
}));

import { fetchCodexModels } from "../../src/codex/model-list.js";
import { registerHttpRoutes } from "../../src/http/routes.js";
import { createMockLogger } from "../helpers.js";

function makeOrchestrator() {
  return {
    getSerializedState: vi.fn().mockReturnValue({
      generated_at: "2024-01-01T00:00:00Z",
      counts: { running: 0, retrying: 0, queued: 0, completed: 0 },
      running: [],
      retrying: [],
      completed: [],
      queued: [],
      workflow_columns: [],
      codex_totals: { input_tokens: 0, output_tokens: 0, total_tokens: 0, seconds_running: 0, cost_usd: 0 },
      rate_limits: null,
      recent_events: [],
    }),
    getSnapshot: vi.fn().mockReturnValue({
      generatedAt: "2024-01-01T00:00:00Z",
      counts: { running: 0, retrying: 0, queued: 0, completed: 0 },
      running: [],
      retrying: [],
      completed: [],
      queued: [],
      workflowColumns: [],
      codexTotals: { inputTokens: 0, outputTokens: 0, totalTokens: 0, secondsRunning: 0, costUsd: 0 },
      rateLimits: null,
      recentEvents: [],
    }),
    requestRefresh: vi.fn().mockReturnValue({
      queued: true,
      coalesced: false,
      requestedAt: "2024-01-01T00:00:00Z",
    }),
    getIssueDetail: vi.fn().mockReturnValue(null),
    getAttemptDetail: vi.fn().mockReturnValue(null),
    abortIssue: vi.fn().mockReturnValue({ ok: false, code: "not_found", message: "Unknown issue identifier" }),
    updateIssueModelSelection: vi.fn().mockResolvedValue(null),
    steerIssue: vi.fn().mockResolvedValue(null),
  };
}

function makeNotificationStore() {
  return {
    list: vi.fn().mockResolvedValue([]),
    countUnread: vi.fn().mockResolvedValue(0),
    countAll: vi.fn().mockResolvedValue(0),
    markRead: vi.fn().mockResolvedValue(null),
    markAllRead: vi.fn().mockResolvedValue({ updatedCount: 0, unreadCount: 0 }),
  };
}

function makeAutomationStore() {
  return {
    listRuns: vi.fn().mockResolvedValue([]),
    countRuns: vi.fn().mockResolvedValue(0),
  };
}

function makeAutomationScheduler() {
  return {
    listAutomations: vi.fn().mockReturnValue([]),
    runNow: vi.fn().mockResolvedValue(null),
  };
}

function makeAlertHistoryStore() {
  return {
    list: vi.fn().mockResolvedValue([]),
  };
}

let server: http.Server;
let port: number;
let orchestrator: ReturnType<typeof makeOrchestrator>;
let notificationStore: ReturnType<typeof makeNotificationStore>;
let automationStore: ReturnType<typeof makeAutomationStore>;
let automationScheduler: ReturnType<typeof makeAutomationScheduler>;
let alertHistoryStore: ReturnType<typeof makeAlertHistoryStore>;

beforeAll(async () => {
  orchestrator = makeOrchestrator();
  notificationStore = makeNotificationStore();
  automationStore = makeAutomationStore();
  automationScheduler = makeAutomationScheduler();
  alertHistoryStore = makeAlertHistoryStore();
  const app = express();
  app.use(express.json());
  registerHttpRoutes(app, {
    orchestrator: orchestrator as never,
    notificationStore: notificationStore as never,
    automationStore: automationStore as never,
    automationScheduler: automationScheduler as never,
    alertHistoryStore: alertHistoryStore as never,
    logger: createMockLogger(),
    frontendDir: "/tmp",
  });
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      port = (server.address() as { port: number }).port;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

async function fetchRoute(path: string, options?: RequestInit): Promise<Response> {
  return fetch(`http://127.0.0.1:${port}${path}`, options);
}

describe("HTTP routes", () => {
  it("GET /api/v1/state returns serialized snapshot", async () => {
    const res = await fetchRoute("/api/v1/state");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("generated_at");
    expect(body).toHaveProperty("counts");
    expect(body).toHaveProperty("running");
    expect(body).toHaveProperty("codex_totals");
    expect(body).toHaveProperty("recent_events");
    expect(orchestrator.getSerializedState).toHaveBeenCalledOnce();
    expect(orchestrator.getSnapshot).not.toHaveBeenCalled();
  });

  it("GET /api/v1/runtime returns runtime info", async () => {
    const res = await fetchRoute("/api/v1/runtime");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("provider_summary", "Codex");
    expect(body).toHaveProperty("feature_flags");
  });

  it("POST /api/v1/refresh returns 202", async () => {
    const res = await fetchRoute("/api/v1/refresh", { method: "POST" });
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.queued).toBe(true);
  });

  it("GET /api/v1/state with wrong method returns 405", async () => {
    const res = await fetchRoute("/api/v1/state", { method: "DELETE" });
    expect(res.status).toBe(405);
  });

  it("GET /api/v1/runtime with wrong method returns 405", async () => {
    const res = await fetchRoute("/api/v1/runtime", { method: "PUT" });
    expect(res.status).toBe(405);
  });

  it("GET /api/v1/refresh with wrong method returns 405", async () => {
    const res = await fetchRoute("/api/v1/refresh", { method: "GET" });
    expect(res.status).toBe(405);
  });

  it("GET /api/v1/:identifier returns 404 for unknown issue", async () => {
    const res = await fetchRoute("/api/v1/MT-999");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("not_found");
  });

  it("GET /api/v1/:identifier/attempts returns 404 for unknown issue", async () => {
    const res = await fetchRoute("/api/v1/MT-999/attempts");
    expect(res.status).toBe(404);
  });

  it("GET /api/v1/attempts/:attempt_id returns 404 for unknown attempt", async () => {
    const res = await fetchRoute("/api/v1/attempts/unknown-id");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("not_found");
  });

  it("POST /api/v1/:identifier/model returns 404 for unknown issue", async () => {
    const res = await fetchRoute("/api/v1/MT-999/model", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-4o" }),
    });
    expect(res.status).toBe(404);
  });

  it("POST /api/v1/:identifier/abort returns 202 for active issue", async () => {
    orchestrator.abortIssue.mockReturnValueOnce({
      ok: true,
      alreadyStopping: false,
      requestedAt: "2024-01-01T00:00:00Z",
    });
    const res = await fetchRoute("/api/v1/MT-1/abort", { method: "POST" });
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.status).toBe("stopping");
    expect(body.already_stopping).toBe(false);
  });

  it("POST /api/v1/:identifier/abort returns 409 for non-running issue", async () => {
    orchestrator.abortIssue.mockReturnValueOnce({
      ok: false,
      code: "conflict",
      message: "Issue is not currently running",
    });
    const res = await fetchRoute("/api/v1/MT-1/abort", { method: "POST" });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("conflict");
  });

  it("POST /api/v1/:identifier/abort returns 404 for unknown issue", async () => {
    const res = await fetchRoute("/api/v1/MT-999/abort", { method: "POST" });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("not_found");
  });

  it("GET /api/v1/:identifier returns detail when found", async () => {
    orchestrator.getIssueDetail.mockReturnValueOnce({
      issueId: "i1",
      identifier: "MT-1",
      state: "In Progress",
    });
    const res = await fetchRoute("/api/v1/MT-1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.identifier).toBe("MT-1");
  });

  it("GET /api/v1/:identifier/attempts returns attempts when found", async () => {
    orchestrator.getIssueDetail.mockReturnValueOnce({
      issueId: "i1",
      attempts: [{ id: "a1" }],
      currentAttemptId: "a1",
    });
    const res = await fetchRoute("/api/v1/MT-1/attempts");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.attempts.length).toBe(1);
    expect(body.current_attempt_id).toBe("a1");
  });

  it("POST /api/v1/:identifier/steer returns 200 when steer succeeds", async () => {
    orchestrator.steerIssue.mockResolvedValueOnce({ ok: true });
    const res = await fetchRoute("/api/v1/MT-42/steer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "focus on tests" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.message).toBe("steer sent");
  });

  it("POST /api/v1/:identifier/steer returns 400 with empty body", async () => {
    const res = await fetchRoute("/api/v1/MT-42/steer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("POST /api/v1/:identifier/steer returns 404 for unknown issue", async () => {
    const res = await fetchRoute("/api/v1/UNKNOWN/steer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "focus on tests" }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("not_found");
  });

  it("API 404 path returns JSON error", async () => {
    const res = await fetchRoute("/api/nonexistent");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("not_found");
  });

  it("GET /metrics returns prometheus text format", async () => {
    const res = await fetchRoute("/metrics");
    expect(res.status).toBe(200);
    const contentType = res.headers.get("content-type");
    expect(contentType).toContain("text/plain");
  });

  it("GET /api/v1/models returns null when no models available", async () => {
    vi.mocked(fetchCodexModels).mockResolvedValueOnce(null);
    const res = await fetchRoute("/api/v1/models");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ models: null });
  });

  it("GET /api/v1/models returns model list when available", async () => {
    vi.mocked(fetchCodexModels).mockResolvedValueOnce(["gpt-5.4", "o3"]);
    const res = await fetchRoute("/api/v1/models");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ models: ["gpt-5.4", "o3"] });
  });

  it("GET /api/v1/models with wrong method returns 405", async () => {
    const res = await fetchRoute("/api/v1/models", { method: "DELETE" });
    expect(res.status).toBe(405);
  });

  it("GET /api/v1/notifications returns the notification timeline", async () => {
    notificationStore.list.mockResolvedValueOnce([
      {
        id: "notif-1",
        type: "worker_failed",
        severity: "critical",
        title: "Worker failed",
        message: "MT-1 crashed",
        source: "MT-1",
        href: null,
        read: false,
        dedupeKey: "notif-1",
        metadata: { issueIdentifier: "MT-1" },
        deliverySummary: null,
        createdAt: "2026-04-04T09:00:00.000Z",
        updatedAt: "2026-04-04T09:00:00.000Z",
      },
    ]);
    notificationStore.countUnread.mockResolvedValueOnce(1);
    notificationStore.countAll.mockResolvedValueOnce(1);

    const res = await fetchRoute("/api/v1/notifications?limit=10&unread=true");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.unreadCount).toBe(1);
    expect(body.totalCount).toBe(1);
    expect(body.notifications).toHaveLength(1);
    expect(notificationStore.list).toHaveBeenCalledWith({ limit: 10, unreadOnly: true });
  });

  it("POST /api/v1/notifications/:id/read marks one notification as read", async () => {
    notificationStore.markRead.mockResolvedValueOnce({
      id: "notif-1",
      type: "worker_failed",
      severity: "critical",
      title: "Worker failed",
      message: "MT-1 crashed",
      source: "MT-1",
      href: null,
      read: true,
      dedupeKey: "notif-1",
      metadata: null,
      deliverySummary: null,
      createdAt: "2026-04-04T09:00:00.000Z",
      updatedAt: "2026-04-04T09:05:00.000Z",
    });
    notificationStore.countUnread.mockResolvedValueOnce(0);

    const res = await fetchRoute("/api/v1/notifications/notif-1/read", { method: "POST" });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.notification.read).toBe(true);
  });

  it("POST /api/v1/notifications/read-all marks all notifications as read", async () => {
    notificationStore.markAllRead.mockResolvedValueOnce({ updatedCount: 3, unreadCount: 0 });

    const res = await fetchRoute("/api/v1/notifications/read-all", { method: "POST" });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, updatedCount: 3, unreadCount: 0 });
  });

  it("GET /api/v1/automations returns scheduler state", async () => {
    automationScheduler.listAutomations.mockReturnValueOnce([
      {
        name: "nightly-report",
        schedule: "0 2 * * *",
        mode: "report",
        enabled: true,
        repoUrl: "https://github.com/acme/app",
        valid: true,
        nextRun: "2026-04-05T00:00:00.000Z",
        lastError: null,
      },
    ]);

    const res = await fetchRoute("/api/v1/automations");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.automations).toHaveLength(1);
  });

  it("GET /api/v1/automations/runs returns persisted runs", async () => {
    automationStore.listRuns.mockResolvedValueOnce([
      {
        id: "run-1",
        automationName: "nightly-report",
        mode: "report",
        trigger: "schedule",
        repoUrl: "https://github.com/acme/app",
        status: "completed",
        output: "ok",
        details: null,
        issueId: null,
        issueIdentifier: null,
        issueUrl: null,
        error: null,
        startedAt: "2026-04-04T11:00:00.000Z",
        finishedAt: "2026-04-04T11:01:00.000Z",
      },
    ]);
    automationStore.countRuns.mockResolvedValueOnce(1);

    const res = await fetchRoute("/api/v1/automations/runs");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totalCount).toBe(1);
    expect(body.runs).toHaveLength(1);
  });

  it("POST /api/v1/automations/:name/run triggers a manual run", async () => {
    automationScheduler.runNow.mockResolvedValueOnce({
      id: "run-1",
      automationName: "nightly-report",
      mode: "report",
      trigger: "manual",
      repoUrl: "https://github.com/acme/app",
      status: "completed",
      output: "ok",
      details: null,
      issueId: null,
      issueIdentifier: null,
      issueUrl: null,
      error: null,
      startedAt: "2026-04-04T11:00:00.000Z",
      finishedAt: "2026-04-04T11:01:00.000Z",
    });

    const res = await fetchRoute("/api/v1/automations/nightly-report/run", { method: "POST" });
    expect(res.status).toBe(202);
    expect(automationScheduler.runNow).toHaveBeenCalledWith("nightly-report");
  });

  it("GET /api/v1/alerts/history returns stored alert history", async () => {
    alertHistoryStore.list.mockResolvedValueOnce([
      {
        id: "alert-1",
        ruleName: "worker-failures",
        eventType: "worker.failed",
        severity: "critical",
        status: "delivered",
        channels: ["ops-webhook"],
        deliveredChannels: ["ops-webhook"],
        failedChannels: [],
        message: "ENG-1 matched worker-failures",
        createdAt: "2026-04-04T11:30:00.000Z",
      },
    ]);

    const res = await fetchRoute("/api/v1/alerts/history");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.history).toHaveLength(1);
  });
});
