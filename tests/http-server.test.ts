import { afterEach, describe, expect, it } from "vitest";

import { HttpServer } from "../src/http-server.js";
import { createLogger } from "../src/logger.js";
import { Orchestrator } from "../src/orchestrator.js";

describe("HttpServer", () => {
  let server: HttpServer | null = null;

  afterEach(async () => {
    await server?.stop();
    server = null;
  });

  it("serves dashboard and API routes in the expected order with 405 handling", async () => {
    const orchestrator = {
      getSnapshot: () => ({
        generatedAt: "2026-03-16T00:00:00Z",
        counts: { running: 0, retrying: 0 },
        running: [],
        retrying: [],
        queued: [],
        completed: [],
        codexTotals: {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          secondsRunning: 0,
        },
        rateLimits: null,
        recentEvents: [],
      }),
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

    server = new HttpServer({
      orchestrator,
      logger: createLogger(),
    });

    const started = await server.start(0);
    const baseUrl = `http://127.0.0.1:${started.port}`;

    const rootResponse = await fetch(`${baseUrl}/`);
    expect(rootResponse.status).toBe(200);
    const rootHtml = await rootResponse.text();
    expect(rootHtml).toContain("Symphony | AI Agent Orchestration");
    expect(rootHtml).toContain('id="boardScroll"');
    expect(rootHtml).toContain('id="queuedHeading"');
    expect(rootHtml).toContain('id="queuedColumn"');
    expect(rootHtml).toContain('id="runningHeading"');
    expect(rootHtml).toContain('id="runningColumn"');
    expect(rootHtml).toContain('id="retryingHeading"');
    expect(rootHtml).toContain('id="retryingColumn"');
    expect(rootHtml).toContain('id="completedHeading"');
    expect(rootHtml).toContain('id="completedColumn"');
    expect(rootHtml).toContain("Queued (0)");
    expect(rootHtml).toContain("Running (0)");
    expect(rootHtml).toContain("Retrying (0)");
    expect(rootHtml).toContain("Completed (0)");
    expect(rootHtml).toContain('id="detailPanel"');
    expect(rootHtml).toContain('id="detailIdentifier"');
    expect(rootHtml).toContain('id="detailTitle"');
    expect(rootHtml).toContain('id="detailRetryHistory"');
    expect(rootHtml).toContain('id="closeDetailButton"');
    expect(rootHtml).toContain('id="focusLogsButton"');
    expect(rootHtml).toContain('id="refreshDetailButton"');
    expect(rootHtml).toContain("Model Routing");
    expect(rootHtml).toContain('id="detailModelInput"');
    expect(rootHtml).toContain('id="detailReasoningSelect"');
    expect(rootHtml).toContain('id="detailModelSource"');
    expect(rootHtml).toContain('id="detailModelHelp"');
    expect(rootHtml).toContain('for="detailModelInput"');
    expect(rootHtml).toContain('for="detailReasoningSelect"');
    expect(rootHtml).toContain('id="pauseButton"');
    expect(rootHtml).toContain("Save Model");
    expect(rootHtml).toContain('id="refreshButton"');
    expect(rootHtml).toContain('id="searchInput"');
    expect(rootHtml).toContain('data-filter="running"');
    expect(rootHtml).toContain('data-filter="retrying"');
    expect(rootHtml).toContain('data-filter="completed"');

    const stateResponse = await fetch(`${baseUrl}/api/v1/state`);
    expect(stateResponse.status).toBe(200);
    expect(await stateResponse.json()).toMatchObject({
      generated_at: "2026-03-16T00:00:00Z",
      counts: { running: 0, retrying: 0 },
    });

    const metricsResponse = await fetch(`${baseUrl}/metrics`);
    expect(metricsResponse.status).toBe(200);
    expect(metricsResponse.headers.get("content-type")).toContain("text/plain");
    const metricsBody = await metricsResponse.text();
    expect(metricsBody).toContain("# TYPE symphony_http_requests_total counter");

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
    const body = await response.json();
    expect(body.error.code).toBe("invalid_reasoning_effort");
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
    const body = await response.json();
    expect(body.error.code).toBe("invalid_reasoning_effort");
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
});
