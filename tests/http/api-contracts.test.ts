import { describe, expect, it, vi, beforeAll, afterAll } from "vitest";
import express from "express";
import http from "node:http";

import { registerHttpRoutes } from "../../src/http/routes.js";

/**
 * API Contract Snapshot Tests
 *
 * These tests freeze the response **structure** (keys, types, nesting)
 * of every major API endpoint using Vitest inline snapshots.
 * A structural change will break the snapshot, forcing a deliberate update.
 */

function makeOrchestrator() {
  return {
    getSnapshot: vi.fn().mockReturnValue({
      generatedAt: "2024-01-01T00:00:00Z",
      counts: { running: 2, retrying: 1, queued: 3, completed: 10 },
      running: [
        {
          id: "issue-1",
          identifier: "NIN-1",
          title: "Auth flow",
          state: "In Progress",
          runningAttemptId: "att-1",
          model: "o4-mini",
          startedAt: "2024-01-01T00:00:00Z",
        },
      ],
      retrying: [],
      completed: [],
      queued: [{ id: "issue-2", identifier: "NIN-2", title: "Dashboard", state: "Todo" }],
      workflowColumns: [
        { key: "backlog", label: "Backlog", terminal: false },
        { key: "in progress", label: "In Progress", terminal: false },
        { key: "done", label: "Done", terminal: true },
      ],
      codexTotals: {
        inputTokens: 15000,
        outputTokens: 8000,
        totalTokens: 23000,
        secondsRunning: 37,
        costUsd: 0.1944,
      },
      rateLimits: null,
      recentEvents: [{ type: "attempt_started", timestamp: "2024-01-01T00:00:00Z", issueIdentifier: "NIN-1" }],
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
    getSerializedState: vi.fn().mockReturnValue({
      generated_at: "2024-01-01T00:00:00Z",
      counts: { running: 2, retrying: 1, queued: 3, completed: 10 },
      running: [
        {
          id: "issue-1",
          identifier: "NIN-1",
          title: "Auth flow",
          state: "In Progress",
          runningAttemptId: "att-1",
          model: "o4-mini",
          startedAt: "2024-01-01T00:00:00Z",
        },
      ],
      retrying: [],
      completed: [],
      queued: [{ id: "issue-2", identifier: "NIN-2", title: "Dashboard", state: "Todo" }],
      workflow_columns: [
        { key: "backlog", label: "Backlog", terminal: false, count: 0, issues: [] },
        { key: "in progress", label: "In Progress", terminal: false, count: 0, issues: [] },
        { key: "done", label: "Done", terminal: true, count: 0, issues: [] },
      ],
      codex_totals: {
        input_tokens: 15000,
        output_tokens: 8000,
        total_tokens: 23000,
        seconds_running: 37,
        cost_usd: 0.1944,
      },
      rate_limits: null,
      recent_events: [{ issue_identifier: "NIN-1", content: null, metadata: null }],
    }),
  };
}

let server: http.Server;
let port: number;
let orchestrator: ReturnType<typeof makeOrchestrator>;

beforeAll(async () => {
  orchestrator = makeOrchestrator();
  const app = express();
  app.use(express.json());
  registerHttpRoutes(app, {
    orchestrator: orchestrator as never,
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

/** Extract structural keys (key → typeof value) recursively. */
function extractStructure(value: unknown): unknown {
  if (value === null) return "null";
  if (Array.isArray(value)) {
    return value.length > 0 ? [extractStructure(value[0])] : "[]";
  }
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      result[key] = extractStructure(val);
    }
    return result;
  }
  return typeof value;
}

describe("API Contract Snapshots", () => {
  describe("GET /api/v1/state", () => {
    it("response structure matches snapshot", async () => {
      const res = await fetchRoute("/api/v1/state");
      expect(res.status).toBe(200);

      const body = await res.json();
      const structure = extractStructure(body);

      expect(structure).toMatchInlineSnapshot(`
        {
          "codex_totals": {
            "cost_usd": "number",
            "input_tokens": "number",
            "output_tokens": "number",
            "seconds_running": "number",
            "total_tokens": "number",
          },
          "completed": "[]",
          "counts": {
            "completed": "number",
            "queued": "number",
            "retrying": "number",
            "running": "number",
          },
          "generated_at": "string",
          "queued": [
            {
              "id": "string",
              "identifier": "string",
              "state": "string",
              "title": "string",
            },
          ],
          "rate_limits": "null",
          "recent_events": [
            {
              "content": "null",
              "issue_identifier": "string",
              "metadata": "null",
            },
          ],
          "retrying": "[]",
          "running": [
            {
              "id": "string",
              "identifier": "string",
              "model": "string",
              "runningAttemptId": "string",
              "startedAt": "string",
              "state": "string",
              "title": "string",
            },
          ],
          "workflow_columns": [
            {
              "count": "number",
              "issues": "[]",
              "key": "string",
              "label": "string",
              "terminal": "boolean",
            },
          ],
        }
      `);
    });
  });

  describe("GET /api/v1/runtime", () => {
    it("response structure matches snapshot", async () => {
      const res = await fetchRoute("/api/v1/runtime");
      expect(res.status).toBe(200);

      const body = await res.json();
      const structure = extractStructure(body);

      expect(structure).toMatchInlineSnapshot(`
        {
          "data_dir": "string",
          "feature_flags": {},
          "provider_summary": "string",
          "version": "string",
        }
      `);
    });
  });

  describe("POST /api/v1/refresh", () => {
    it("response structure matches snapshot", async () => {
      const res = await fetchRoute("/api/v1/refresh", { method: "POST" });
      expect(res.status).toBe(202);

      const body = await res.json();
      const structure = extractStructure(body);

      expect(structure).toMatchInlineSnapshot(`
        {
          "coalesced": "boolean",
          "queued": "boolean",
          "requested_at": "string",
        }
      `);
    });
  });

  describe("POST /api/v1/:id/abort (success)", () => {
    it("response structure matches snapshot", async () => {
      orchestrator.abortIssue.mockReturnValueOnce({
        ok: true,
        alreadyStopping: false,
        requestedAt: "2024-01-01T00:00:00Z",
      });

      const res = await fetchRoute("/api/v1/NIN-1/abort", { method: "POST" });
      expect(res.status).toBe(202);

      const body = await res.json();
      const structure = extractStructure(body);

      expect(structure).toMatchInlineSnapshot(`
        {
          "already_stopping": "boolean",
          "ok": "boolean",
          "requested_at": "string",
          "status": "string",
        }
      `);
    });
  });

  describe("Error envelope", () => {
    it("404 error structure matches snapshot", async () => {
      const res = await fetchRoute("/api/nonexistent");
      expect(res.status).toBe(404);

      const body = await res.json();
      const structure = extractStructure(body);

      expect(structure).toMatchInlineSnapshot(`
        {
          "error": {
            "code": "string",
            "message": "string",
          },
        }
      `);
    });

    it("405 error structure matches snapshot", async () => {
      const res = await fetchRoute("/api/v1/state", { method: "DELETE" });
      expect(res.status).toBe(405);

      const body = await res.json();
      const structure = extractStructure(body);

      expect(structure).toMatchInlineSnapshot(`
        {
          "error": {
            "code": "string",
            "message": "string",
          },
        }
      `);
    });
  });

  describe("GET /metrics", () => {
    it("returns prometheus text format", async () => {
      const res = await fetchRoute("/metrics");
      expect(res.status).toBe(200);
      const contentType = res.headers.get("content-type");
      expect(contentType).toContain("text/plain");
    });
  });

  describe("GET /api/v1/:id/attempts (found)", () => {
    it("response structure matches snapshot", async () => {
      orchestrator.getIssueDetail.mockReturnValueOnce({
        issueId: "i1",
        attempts: [
          {
            attemptId: "a1",
            attemptNumber: 1,
            startedAt: "2024-01-01T00:00:00Z",
            endedAt: null,
            status: "running",
            model: "gpt-5.4",
            reasoningEffort: "medium",
            tokenUsage: null,
            costUsd: null,
            errorCode: null,
            errorMessage: null,
            appServerBadge: {
              effectiveProvider: "cliproxyapi",
              threadStatus: "active",
            },
          },
        ],
        currentAttemptId: "a1",
      });

      const res = await fetchRoute("/api/v1/NIN-1/attempts");
      expect(res.status).toBe(200);

      const body = await res.json();
      const structure = extractStructure(body);

      expect(structure).toMatchInlineSnapshot(`
        {
          "attempts": [
            {
              "appServerBadge": {
                "effectiveProvider": "string",
                "threadStatus": "string",
              },
              "attemptId": "string",
              "attemptNumber": "number",
              "costUsd": "null",
              "endedAt": "null",
              "errorCode": "null",
              "errorMessage": "null",
              "model": "string",
              "reasoningEffort": "string",
              "startedAt": "string",
              "status": "string",
              "tokenUsage": "null",
            },
          ],
          "current_attempt_id": "string",
        }
      `);
    });
  });
});
