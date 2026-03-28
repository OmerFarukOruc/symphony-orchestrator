import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { ConfigOverlayStore } from "../../src/config/overlay.js";
import { HttpServer } from "../../src/http/server.js";
import { createLogger } from "../../src/core/logger.js";
import { Orchestrator } from "../../src/orchestrator/orchestrator.js";

const SPA_HTML = `<!doctype html><html><head><title>Symphony</title></head><body><div id="app"></div></body></html>`;

describe("HttpServer", () => {
  let server: HttpServer | null = null;
  const tempDirs: string[] = [];

  afterEach(async () => {
    await server?.stop();
    server = null;
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  async function createTempDir(): Promise<string> {
    const dir = await mkdtemp(path.join(os.tmpdir(), "symphony-http-server-test-"));
    tempDirs.push(dir);
    return dir;
  }

  async function createFrontendDir(): Promise<string> {
    const dir = await createTempDir();
    await writeFile(path.join(dir, "index.html"), SPA_HTML, "utf8");
    return dir;
  }

  it("serves SPA and API routes in the expected order with 405 handling", async () => {
    const snapshotData = {
      generatedAt: "2026-03-16T00:00:00Z",
      counts: { running: 0, retrying: 0 },
      running: [],
      retrying: [],
      queued: [],
      completed: [],
      workflowColumns: [
        {
          key: "todo",
          label: "Todo",
          kind: "todo",
          terminal: false,
          count: 0,
          issues: [],
        },
      ],
      codexTotals: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        secondsRunning: 0,
        costUsd: 0,
      },
      rateLimits: null,
      recentEvents: [],
    };
    const serializedState = {
      generated_at: "2026-03-16T00:00:00Z",
      counts: { running: 0, retrying: 0 },
      running: [],
      retrying: [],
      queued: [],
      completed: [],
      workflow_columns: [
        {
          key: "todo",
          label: "Todo",
          kind: "todo",
          terminal: false,
          count: 0,
          issues: [],
        },
      ],
      codex_totals: {
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
        seconds_running: 0,
        cost_usd: 0,
      },
      rate_limits: null,
      recent_events: [],
    };
    const orchestrator = {
      getSnapshot: () => snapshotData,
      getSerializedState: () => serializedState,
      requestRefresh: () => ({
        queued: true,
        coalesced: false,
        requestedAt: "2026-03-16T00:00:00Z",
      }),
      updateIssueModelSelection: async () => ({
        updated: true,
        restarted: false,
        appliesNextAttempt: true,
        selection: {
          model: "gpt-5.4",
          reasoningEffort: "high",
          source: "override",
        },
      }),
      getIssueDetail: (identifier: string) =>
        identifier === "MT-42"
          ? {
              identifier,
              title: "Issue detail",
              attempts: [
                {
                  attemptId: "attempt-1",
                  status: "completed",
                },
              ],
              currentAttemptId: "attempt-live",
            }
          : null,
      getAttemptDetail: (attemptId: string) =>
        attemptId === "attempt-1"
          ? {
              attemptId,
              status: "completed",
              events: [],
            }
          : null,
    } as unknown as Orchestrator;

    const frontendDir = await createFrontendDir();
    server = new HttpServer({
      orchestrator,
      logger: createLogger(),
      frontendDir,
    });

    const started = await server.start(0);
    const baseUrl = `http://127.0.0.1:${started.port}`;

    const rootResponse = await fetch(`${baseUrl}/`);
    expect(rootResponse.status).toBe(200);
    expect(rootResponse.headers.get("x-request-id")).toBeTruthy();
    const rootHtml = await rootResponse.text();
    expect(rootHtml).toContain('<div id="app">');
    expect(rootHtml).toContain("<title>Symphony</title>");

    const stateResponse = await fetch(`${baseUrl}/api/v1/state`);
    expect(stateResponse.status).toBe(200);
    expect(await stateResponse.json()).toMatchObject({
      generated_at: "2026-03-16T00:00:00Z",
      counts: { running: 0, retrying: 0 },
      workflow_columns: [
        expect.objectContaining({
          key: "todo",
          label: "Todo",
          kind: "todo",
          terminal: false,
          count: 0,
        }),
      ],
    });

    const metricsResponse = await fetch(`${baseUrl}/metrics`);
    expect(metricsResponse.status).toBe(200);
    expect(metricsResponse.headers.get("content-type")).toContain("text/plain");
    const metricsBody = await metricsResponse.text();
    expect(metricsBody).toContain("# TYPE symphony_http_requests_total counter");
    expect(metricsBody).toContain('symphony_http_requests_total{method="GET",status="200"}');

    const methodResponse = await fetch(`${baseUrl}/api/v1/state`, { method: "POST" });
    expect(methodResponse.status).toBe(405);

    const refreshResponse = await fetch(`${baseUrl}/api/v1/refresh`, { method: "POST" });
    expect(refreshResponse.status).toBe(202);
    expect(await refreshResponse.json()).toMatchObject({
      queued: true,
      coalesced: false,
    });

    const detailResponse = await fetch(`${baseUrl}/api/v1/MT-42`);
    expect(detailResponse.status).toBe(200);
    expect(await detailResponse.json()).toMatchObject({
      identifier: "MT-42",
    });

    const attemptsResponse = await fetch(`${baseUrl}/api/v1/MT-42/attempts`);
    expect(attemptsResponse.status).toBe(200);
    expect(await attemptsResponse.json()).toMatchObject({
      attempts: [expect.objectContaining({ attemptId: "attempt-1" })],
      current_attempt_id: "attempt-live",
    });

    const attemptDetailResponse = await fetch(`${baseUrl}/api/v1/attempts/attempt-1`);
    expect(attemptDetailResponse.status).toBe(200);
    expect(await attemptDetailResponse.json()).toMatchObject({
      attemptId: "attempt-1",
      status: "completed",
    });

    const modelResponse = await fetch(`${baseUrl}/api/v1/MT-42/model`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5.4",
        reasoning_effort: "high",
      }),
    });
    expect(modelResponse.status).toBe(202);
    expect(await modelResponse.json()).toMatchObject({
      updated: true,
      restarted: false,
      applies_next_attempt: true,
      selection: {
        model: "gpt-5.4",
        reasoning_effort: "high",
        source: "override",
      },
    });
  });

  it("serves /api/v1/runtime with version and config info", async () => {
    const frontendDir = await createFrontendDir();
    server = new HttpServer({
      orchestrator: {} as unknown as Orchestrator,
      logger: createLogger(),
      frontendDir,
    });
    const started = await server.start(0);
    const response = await fetch(`http://127.0.0.1:${started.port}/api/v1/runtime`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      version: expect.any(String),
      workflow_path: expect.any(String),
      data_dir: expect.any(String),
      feature_flags: expect.any(Object),
      provider_summary: expect.any(String),
    });
  });

  it("returns JSON 404 for unknown /api/ paths", async () => {
    server = new HttpServer({
      orchestrator: {} as unknown as Orchestrator,
      logger: createLogger(),
    });
    const started = await server.start(0);
    const response = await fetch(`http://127.0.0.1:${started.port}/api/v99/state`);
    expect(response.status).toBe(404);
    const body = (await response.json()) as Record<string, unknown>;
    expect((body as { error: { code: string } }).error.code).toBe("not_found");
  });

  it("serves SPA index.html for unknown non-API paths", async () => {
    const frontendDir = await createFrontendDir();
    server = new HttpServer({
      orchestrator: {} as unknown as Orchestrator,
      logger: createLogger(),
      frontendDir,
    });
    const started = await server.start(0);
    const response = await fetch(`http://127.0.0.1:${started.port}/dashboard`);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('<div id="app">');
  });

  it("rejects invalid reasoning_effort string with 400", async () => {
    const orchestrator = {
      updateIssueModelSelection: async () => ({
        updated: true,
        restarted: false,
        appliesNextAttempt: true,
        selection: { model: "gpt-5.4", reasoningEffort: "high", source: "override" },
      }),
      getIssueDetail: () => ({ identifier: "MT-42", title: "test" }),
    } as unknown as Orchestrator;

    server = new HttpServer({ orchestrator, logger: createLogger() });
    const started = await server.start(0);
    const baseUrl = `http://127.0.0.1:${started.port}`;

    const response = await fetch(`${baseUrl}/api/v1/MT-42/model`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-5.4", reasoning_effort: "ultra" }),
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string; details: Array<{ path: PropertyKey[] }> };
    expect(body.error).toBe("validation_error");
    expect(body.details.some((d) => d.path.includes("reasoning_effort"))).toBe(true);
  });

  it("rejects non-string reasoning_effort with 400", async () => {
    const orchestrator = {
      updateIssueModelSelection: async () => ({
        updated: true,
        restarted: false,
        appliesNextAttempt: true,
        selection: { model: "gpt-5.4", reasoningEffort: "high", source: "override" },
      }),
      getIssueDetail: () => ({ identifier: "MT-42", title: "test" }),
    } as unknown as Orchestrator;

    server = new HttpServer({ orchestrator, logger: createLogger() });
    const started = await server.start(0);
    const baseUrl = `http://127.0.0.1:${started.port}`;

    const response = await fetch(`${baseUrl}/api/v1/MT-42/model`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-5.4", reasoning_effort: 123 }),
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string; details: Array<{ path: PropertyKey[] }> };
    expect(body.error).toBe("validation_error");
    expect(body.details.some((d) => d.path.includes("reasoning_effort"))).toBe(true);
  });

  it("accepts omitted reasoning_effort", async () => {
    const orchestrator = {
      updateIssueModelSelection: async () => ({
        updated: true,
        restarted: false,
        appliesNextAttempt: true,
        selection: { model: "gpt-5.4", reasoningEffort: null, source: "override" },
      }),
      getIssueDetail: () => ({ identifier: "MT-42", title: "test" }),
    } as unknown as Orchestrator;

    server = new HttpServer({ orchestrator, logger: createLogger() });
    const started = await server.start(0);
    const baseUrl = `http://127.0.0.1:${started.port}`;

    const response = await fetch(`${baseUrl}/api/v1/MT-42/model`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-5.4" }),
    });
    expect(response.status).toBe(202);
  });

  it("accepts explicit null reasoning_effort", async () => {
    const orchestrator = {
      updateIssueModelSelection: async () => ({
        updated: true,
        restarted: false,
        appliesNextAttempt: true,
        selection: { model: "gpt-5.4", reasoningEffort: null, source: "override" },
      }),
      getIssueDetail: () => ({ identifier: "MT-42", title: "test" }),
    } as unknown as Orchestrator;

    server = new HttpServer({ orchestrator, logger: createLogger() });
    const started = await server.start(0);
    const baseUrl = `http://127.0.0.1:${started.port}`;

    const response = await fetch(`${baseUrl}/api/v1/MT-42/model`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-5.4", reasoning_effort: null }),
    });
    expect(response.status).toBe(202);
  });

  it("accepts camelCase reasoningEffort alias", async () => {
    const orchestrator = {
      updateIssueModelSelection: async () => ({
        updated: true,
        restarted: false,
        appliesNextAttempt: true,
        selection: { model: "gpt-5.4", reasoningEffort: "medium", source: "override" },
      }),
      getIssueDetail: () => ({ identifier: "MT-42", title: "test" }),
    } as unknown as Orchestrator;

    server = new HttpServer({ orchestrator, logger: createLogger() });
    const started = await server.start(0);
    const baseUrl = `http://127.0.0.1:${started.port}`;

    const response = await fetch(`${baseUrl}/api/v1/MT-42/model`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-5.4", reasoningEffort: "medium" }),
    });
    expect(response.status).toBe(202);
  });

  it("redacts nested secret values in /api/v1/config", async () => {
    const dir = await createTempDir();
    const overlayStore = new ConfigOverlayStore(path.join(dir, "config", "overlay.yaml"), createLogger());
    await overlayStore.start();

    const orchestrator = {
      getSnapshot: () => ({
        generatedAt: "2026-03-16T00:00:00Z",
        counts: { running: 0, retrying: 0 },
        running: [],
        retrying: [],
        queued: [],
        completed: [],
        workflowColumns: [],
        codexTotals: {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          secondsRunning: 0,
          costUsd: 0,
        },
        rateLimits: null,
        recentEvents: [],
      }),
      requestRefresh: () => ({
        queued: true,
        coalesced: false,
        requestedAt: "2026-03-16T00:00:00Z",
      }),
      getIssueDetail: () => null,
      getAttemptDetail: () => null,
      updateIssueModelSelection: async () => null,
    } as unknown as Orchestrator;

    server = new HttpServer({
      orchestrator,
      logger: createLogger(),
      configStore: {
        getMergedConfigMap: () => ({
          tracker: { kind: "linear" },
          provider: {
            http_headers: {
              Authorization: "Bearer live-secret-token",
            },
            metadata: {
              callback_url: "https://user:password@example.com/webhook",
            },
          },
        }),
      } as never,
      configOverlayStore: overlayStore,
    });

    const started = await server.start(0);
    const response = await fetch(`http://127.0.0.1:${started.port}/api/v1/config`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      tracker: { kind: "linear" },
      provider: {
        http_headers: "[REDACTED]",
        metadata: {
          callback_url: "https://[REDACTED]@example.com/webhook",
        },
      },
    });

    await overlayStore.stop();
  });
});
