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
    expect(await rootResponse.text()).toContain("Symphony | AI Agent Orchestration");

    const stateResponse = await fetch(`${baseUrl}/api/v1/state`);
    expect(stateResponse.status).toBe(200);
    expect(await stateResponse.json()).toMatchObject({
      generated_at: "2026-03-16T00:00:00Z",
      counts: { running: 0, retrying: 0 },
    });

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
});
