import { describe, expect, it, vi, beforeAll, afterAll } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

import { registerHttpRoutes } from "../../src/http/routes.js";
import { resetFlags, setFlag } from "../../src/core/feature-flags.js";

function makeOrchestrator() {
  return {
    getSnapshot: vi.fn().mockReturnValue({
      generatedAt: "2024-01-01T00:00:00Z",
      counts: { running: 0, retrying: 0, queued: 0, completed: 0 },
      running: [],
      retrying: [],
      completed: [],
      queued: [],
      workflowColumns: [],
      codexTotals: { inputTokens: 0, outputTokens: 0, totalTokens: 0, secondsRunning: 0 },
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
  };
}

let app: FastifyInstance;
let port: number;
let orchestrator: ReturnType<typeof makeOrchestrator>;

beforeAll(async () => {
  resetFlags();
  setFlag("DUAL_WRITE", true);
  orchestrator = makeOrchestrator();
  app = Fastify({ logger: false });

  registerHttpRoutes(app, {
    orchestrator: orchestrator as never,
    frontendDir: "/tmp",
  });

  // Configure a 404 handler for API routes (mirrors server.ts behavior)
  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith("/api/")) {
      reply.status(404).send({ error: { code: "not_found", message: "Not found" } });
      return;
    }
    reply.status(404).send({ error: { code: "not_found", message: "Not found" } });
  });

  const address = await app.listen({ port: 0, host: "127.0.0.1" });
  const match = /:(\d+)$/.exec(address);
  port = match ? Number(match[1]) : 0;
});

afterAll(async () => {
  resetFlags();
  await app.close();
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
  });

  it("GET /api/v1/runtime returns runtime info", async () => {
    const res = await fetchRoute("/api/v1/runtime");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("provider_summary", "Codex");
    expect(body).toHaveProperty("feature_flags", { DUAL_WRITE: true });
  });

  it("POST /api/v1/refresh returns 202", async () => {
    const res = await fetchRoute("/api/v1/refresh", { method: "POST" });
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.queued).toBe(true);
  });

  it("GET /api/v1/state with wrong method returns 404", async () => {
    // Fastify returns 404 for unregistered method/route combos by default
    const res = await fetchRoute("/api/v1/state", { method: "DELETE" });
    expect(res.status).toBe(404);
  });

  it("GET /api/v1/runtime with wrong method returns 404", async () => {
    const res = await fetchRoute("/api/v1/runtime", { method: "PUT" });
    expect(res.status).toBe(404);
  });

  it("GET /api/v1/refresh with wrong method returns 404", async () => {
    const res = await fetchRoute("/api/v1/refresh", { method: "GET" });
    expect(res.status).toBe(404);
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
});
