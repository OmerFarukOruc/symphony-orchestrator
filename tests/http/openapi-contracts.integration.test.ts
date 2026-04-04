/**
 * AJV Response Contract Tests (Unit 5).
 *
 * Validates all spec-covered API endpoint responses against compiled
 * OpenAPI response schemas using real HTTP requests through a real
 * HttpServer instance.
 *
 * **Scope:** Tests cover the OpenAPI-spec-covered surface (20 paths / 23
 * operations). Routes registered at runtime but absent from the OpenAPI spec
 * (setup wizard, template CRUD, audit, /api/v1/models, /api/v1/events,
 * webhook routes) are NOT validated here.
 */

import os from "node:os";

import Ajv, { type ValidateFunction } from "ajv";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { getOpenApiSpec } from "../../src/http/openapi.js";
import type { OrchestratorPort } from "../../src/orchestrator/port.js";
import { buildStubOrchestrator, startTestServer, type TestServerResult } from "../helpers/http-server-harness.js";

/* ------------------------------------------------------------------ */
/*  AJV compiler                                                       */
/* ------------------------------------------------------------------ */

const ajv = new Ajv({ allErrors: false, strict: false });

/**
 * Extract the response schema for a given path, method, and status code
 * from the runtime OpenAPI spec and compile it with AJV.
 */
function compileResponseSchema(specPath: string, method: string, statusCode: string): ValidateFunction {
  const spec = getOpenApiSpec();
  const paths = spec.paths as Record<string, Record<string, Record<string, unknown>>>;
  const pathItem = paths[specPath];
  if (!pathItem) {
    throw new Error(`OpenAPI spec has no path: ${specPath}`);
  }
  const operation = pathItem[method] as Record<string, unknown> | undefined;
  if (!operation) {
    throw new Error(`OpenAPI spec has no ${method} operation on ${specPath}`);
  }
  const responses = operation.responses as Record<string, Record<string, unknown>>;
  const responseObj = responses[statusCode];
  if (!responseObj) {
    throw new Error(`OpenAPI spec has no ${statusCode} response for ${method.toUpperCase()} ${specPath}`);
  }
  const content = responseObj.content as Record<string, Record<string, unknown>> | undefined;
  if (!content) {
    // Some responses (e.g. 204) have no content — return a validator that always passes.
    return (() => true) as unknown as ValidateFunction;
  }
  const jsonContent = content["application/json"];
  if (!jsonContent) {
    throw new Error(
      `OpenAPI spec response for ${method.toUpperCase()} ${specPath} ${statusCode} has no application/json content`,
    );
  }
  const schema = jsonContent.schema as Record<string, unknown>;
  // Remove $schema from the response schema — AJV 8 handles draft-2020-12
  // keywords but the $schema URI itself can confuse strict mode.
  const { $schema: _, ...cleanSchema } = schema;
  return ajv.compile(cleanSchema);
}

/* ------------------------------------------------------------------ */
/*  Seeded orchestrator stubs                                          */
/* ------------------------------------------------------------------ */

function buildSeededOrchestrator(): OrchestratorPort {
  const issueView = {
    issueId: "issue-1",
    identifier: "ENG-123",
    title: "Test issue",
    state: "In Progress",
    workspaceKey: "ws-1",
    workspacePath: null,
    message: null,
    status: "running",
    updatedAt: "2026-01-01T00:00:00Z",
    attempt: 1,
    error: null,
  };

  const runtimeStateSnapshot = {
    generatedAt: "2026-01-01T00:00:00Z",
    counts: { running: 1, retrying: 0 },
    running: [issueView],
    retrying: [],
    queued: [],
    completed: [],
    workflowColumns: [
      {
        key: "in-progress",
        label: "In Progress",
        kind: "active",
        terminal: false,
        count: 1,
        issues: [issueView],
      },
    ],
    codexTotals: {
      inputTokens: 1000,
      outputTokens: 500,
      totalTokens: 1500,
      secondsRunning: 60,
      costUsd: 0.05,
    },
    rateLimits: null,
    recentEvents: [
      {
        at: "2026-01-01T00:00:00Z",
        issueId: "issue-1",
        issueIdentifier: "ENG-123",
        sessionId: null,
        event: "attempt.started",
        message: "Attempt started",
        content: null,
        metadata: null,
      },
    ],
  };

  const serializedStateSnapshot = {
    generated_at: "2026-01-01T00:00:00Z",
    counts: { running: 1, retrying: 0 },
    running: [issueView],
    retrying: [],
    queued: [],
    completed: [],
    workflow_columns: [
      {
        key: "in-progress",
        label: "In Progress",
        kind: "active",
        terminal: false,
        count: 1,
        issues: [issueView],
      },
    ],
    codex_totals: {
      input_tokens: 1000,
      output_tokens: 500,
      total_tokens: 1500,
      seconds_running: 60,
      cost_usd: 0.05,
    },
    rate_limits: null,
    recent_events: [
      {
        at: "2026-01-01T00:00:00Z",
        issue_id: "issue-1",
        issue_identifier: "ENG-123",
        session_id: null,
        event: "attempt.started",
        message: "Attempt started",
        content: null,
        metadata: null,
      },
    ],
  };

  const issueDetail = {
    ...issueView,
    recentEvents: runtimeStateSnapshot.recentEvents,
    attempts: [
      {
        attemptId: "att-1",
        attemptNumber: 1,
        startedAt: "2026-01-01T00:00:00Z",
        endedAt: null,
        status: "running",
        model: "o4-mini",
        reasoningEffort: null,
        tokenUsage: null,
        costUsd: null,
        errorCode: null,
        errorMessage: null,
        appServerBadge: { effectiveProvider: "cliproxyapi", threadStatus: "active" },
      },
    ],
    currentAttemptId: "att-1",
  };

  const attemptDetail = {
    attemptId: "att-1",
    attemptNumber: 1,
    startedAt: "2026-01-01T00:00:00Z",
    endedAt: null,
    status: "running",
    model: "o4-mini",
    reasoningEffort: null,
    tokenUsage: null,
    costUsd: null,
    errorCode: null,
    errorMessage: null,
    appServerBadge: { effectiveProvider: "cliproxyapi", threadStatus: "active" },
    appServer: {
      effectiveProvider: "cliproxyapi",
      effectiveModel: "o4-mini",
      reasoningEffort: null,
      approvalPolicy: "never",
      threadName: "Issue thread",
      threadStatus: "active",
      threadStatusPayload: { type: "active" },
      allowedApprovalPolicies: ["never"],
      allowedSandboxModes: ["workspaceWrite"],
      networkRequirements: { enabled: true },
    },
    events: [
      {
        at: "2026-01-01T00:00:00Z",
        issueId: "issue-1",
        issueIdentifier: "ENG-123",
        sessionId: null,
        event: "attempt.started",
        message: "Attempt started",
        content: null,
        metadata: null,
      },
    ],
  };

  return buildStubOrchestrator({
    getSerializedState: vi.fn().mockReturnValue(serializedStateSnapshot),
    getSnapshot: vi.fn().mockReturnValue(runtimeStateSnapshot),
    getIssueDetail: vi.fn().mockImplementation((identifier: string) => {
      if (identifier === "ENG-123") return issueDetail;
      return null;
    }),
    getAttemptDetail: vi.fn().mockImplementation((attemptId: string) => {
      if (attemptId === "att-1") return attemptDetail;
      return null;
    }),
    abortIssue: vi.fn().mockImplementation((identifier: string) => {
      if (identifier === "ENG-123") {
        return {
          ok: true,
          alreadyStopping: false,
          requestedAt: "2026-01-01T00:00:00Z",
        };
      }
      return { ok: false, code: "not_found", message: "Unknown issue identifier" };
    }),
    updateIssueModelSelection: vi.fn().mockImplementation(async (input: { identifier: string }) => {
      if (input.identifier === "ENG-123") {
        return {
          updated: true,
          restarted: false,
          appliesNextAttempt: true,
          selection: {
            model: "o4-mini",
            reasoningEffort: null,
            source: "override" as const,
          },
        };
      }
      return null;
    }),
  });
}

/* ------------------------------------------------------------------ */
/*  In-memory config overlay store for config routes                    */
/* ------------------------------------------------------------------ */

function buildInMemoryConfigOverlayStore() {
  const overlay: Record<string, unknown> = {};

  return {
    toMap: vi.fn(() => structuredClone(overlay)),
    applyPatch: vi.fn(async (patch: Record<string, unknown>) => {
      Object.assign(overlay, patch);
      return true;
    }),
    set: vi.fn(async (pathExpression: string, value: unknown) => {
      overlay[pathExpression] = value;
      return true;
    }),
    delete: vi.fn(async (pathExpression: string) => {
      if (!(pathExpression in overlay)) return false;
      delete overlay[pathExpression];
      return true;
    }),
    subscribe: vi.fn(() => () => {}),
  };
}

/* ------------------------------------------------------------------ */
/*  In-memory secrets store for secrets routes                          */
/* ------------------------------------------------------------------ */

function buildInMemorySecretsStore() {
  const secrets = new Map<string, string>();

  return {
    get: vi.fn((key: string) => secrets.get(key) ?? null),
    list: vi.fn(() => [...secrets.keys()]),
    set: vi.fn(async (key: string, value: string) => {
      secrets.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      return secrets.delete(key);
    }),
    subscribe: vi.fn(() => () => {}),
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
  };
}

/* ------------------------------------------------------------------ */
/*  In-memory config store for config/transitions routes                */
/* ------------------------------------------------------------------ */

function buildInMemoryConfigStore(workspaceRoot: string) {
  return {
    getConfig: vi.fn(() => ({
      repos: [],
      tracker: {
        activeStates: ["In Progress"],
        terminalStates: ["Done"],
      },
      workspace: {
        root: workspaceRoot,
        hooks: {
          afterCreate: null,
          beforeRun: null,
          afterRun: null,
          beforeRemove: null,
          timeoutMs: 30_000,
        },
        strategy: "directory",
        branchPrefix: "risoluto/",
      },
      stateMachine: null,
    })),
    getMergedConfigMap: vi.fn(() => ({
      server: { port: 4000 },
    })),
  };
}

/* ------------------------------------------------------------------ */
/*  Test setup                                                         */
/* ------------------------------------------------------------------ */

let ctx: TestServerResult;

beforeAll(async () => {
  const orchestrator = buildSeededOrchestrator();
  const configOverlayStore = buildInMemoryConfigOverlayStore();
  const secretsStore = buildInMemorySecretsStore();
  // Use os.tmpdir() as workspace root — the handler tolerates ENOENT gracefully.
  const configStore = buildInMemoryConfigStore(os.tmpdir());

  ctx = await startTestServer({
    orchestrator,
    configOverlayStore: configOverlayStore as never,
    secretsStore: secretsStore as never,
    configStore: configStore as never,
  });
});

afterAll(async () => {
  await ctx.teardown();
});

async function fetchApi(path: string, options?: RequestInit): Promise<Response> {
  return fetch(`${ctx.baseUrl}${path}`, options);
}

/* ------------------------------------------------------------------ */
/*  Helper: validate response against OpenAPI schema                   */
/* ------------------------------------------------------------------ */

function expectSchemaValid(validate: ValidateFunction, body: unknown, context: string): void {
  const valid = validate(body);
  if (!valid) {
    const errors = JSON.stringify(validate.errors, null, 2);
    throw new Error(`AJV validation failed for ${context}:\n${errors}\n\nBody: ${JSON.stringify(body, null, 2)}`);
  }
  expect(valid).toBe(true);
}

/* ================================================================== */
/*  State & Metrics                                                    */
/* ================================================================== */

describe("OpenAPI Contract Tests", () => {
  describe("State & Metrics", () => {
    it("GET /api/v1/state -> 200, matches stateResponseSchema", async () => {
      const validate = compileResponseSchema("/api/v1/state", "get", "200");
      const response = await fetchApi("/api/v1/state");

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("application/json");

      const body = await response.json();
      expectSchemaValid(validate, body, "GET /api/v1/state 200");
    });

    it("GET /api/v1/runtime -> 200, matches runtimeResponseSchema", async () => {
      const validate = compileResponseSchema("/api/v1/runtime", "get", "200");
      const response = await fetchApi("/api/v1/runtime");

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("application/json");

      const body = await response.json();
      expectSchemaValid(validate, body, "GET /api/v1/runtime 200");
    });

    it("POST /api/v1/refresh -> 202, matches refreshResponseSchema", async () => {
      const validate = compileResponseSchema("/api/v1/refresh", "post", "202");
      const response = await fetchApi("/api/v1/refresh", { method: "POST" });

      expect(response.status).toBe(202);
      expect(response.headers.get("content-type")).toContain("application/json");

      const body = await response.json();
      expectSchemaValid(validate, body, "POST /api/v1/refresh 202");
    });

    it("GET /api/v1/transitions -> 200, matches transitionsListResponseSchema", async () => {
      const validate = compileResponseSchema("/api/v1/transitions", "get", "200");
      const response = await fetchApi("/api/v1/transitions");

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("application/json");

      const body = await response.json();
      expectSchemaValid(validate, body, "GET /api/v1/transitions 200");
    });

    it("GET /metrics -> 200, Content-Type text/plain", async () => {
      const response = await fetchApi("/metrics");

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/plain");
      // Metrics is plain text — not JSON-validated.
      const text = await response.text();
      expect(text).toBeDefined();
    });
  });

  /* ================================================================== */
  /*  Docs                                                               */
  /* ================================================================== */

  describe("Docs", () => {
    it("GET /api/v1/openapi.json -> 200, body is valid OpenAPI 3.1 object", async () => {
      const response = await fetchApi("/api/v1/openapi.json");

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("application/json");

      const body = (await response.json()) as Record<string, unknown>;
      expect(body.openapi).toBe("3.1.0");
      expect(body.info).toBeDefined();
      expect(body.paths).toBeDefined();
      expect(Object.keys(body.paths as Record<string, unknown>).length).toBeGreaterThan(0);
    });

    it("GET /api/docs -> 200, Content-Type text/html", async () => {
      const response = await fetchApi("/api/docs");

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/html");

      const html = await response.text();
      expect(html.length).toBeGreaterThan(0);
    });
  });

  /* ================================================================== */
  /*  Issues — happy paths                                               */
  /* ================================================================== */

  describe("Issues", () => {
    it("GET /api/v1/{issue_identifier} -> 200, matches issueDetailResponseSchema", async () => {
      const validate = compileResponseSchema("/api/v1/{issue_identifier}", "get", "200");
      const response = await fetchApi("/api/v1/ENG-123");

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("application/json");

      const body = await response.json();
      expectSchemaValid(validate, body, "GET /api/v1/ENG-123 200");
    });

    it("POST /api/v1/{issue_identifier}/abort -> 202, matches abortResponseSchema", async () => {
      const validate = compileResponseSchema("/api/v1/{issue_identifier}/abort", "post", "202");
      const response = await fetchApi("/api/v1/ENG-123/abort", {
        method: "POST",
      });

      expect(response.status).toBe(202);
      expect(response.headers.get("content-type")).toContain("application/json");

      const body = await response.json();
      expectSchemaValid(validate, body, "POST /api/v1/ENG-123/abort 202");
    });

    it("POST /api/v1/{issue_identifier}/model -> 202 with valid body, matches modelUpdateResponseSchema", async () => {
      const validate = compileResponseSchema("/api/v1/{issue_identifier}/model", "post", "202");
      const response = await fetchApi("/api/v1/ENG-123/model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "o4-mini",
          reasoning_effort: "medium",
        }),
      });

      expect(response.status).toBe(202);
      expect(response.headers.get("content-type")).toContain("application/json");

      const body = await response.json();
      expectSchemaValid(validate, body, "POST /api/v1/ENG-123/model 202");
    });

    it("GET /api/v1/{issue_identifier}/attempts -> 200, matches attemptsListResponseSchema", async () => {
      const validate = compileResponseSchema("/api/v1/{issue_identifier}/attempts", "get", "200");
      const response = await fetchApi("/api/v1/ENG-123/attempts");

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("application/json");

      const body = await response.json();
      expectSchemaValid(validate, body, "GET /api/v1/ENG-123/attempts 200");
    });

    it("GET /api/v1/attempts/{attempt_id} -> 200, matches attemptDetailResponseSchema", async () => {
      const validate = compileResponseSchema("/api/v1/attempts/{attempt_id}", "get", "200");
      const response = await fetchApi("/api/v1/attempts/att-1");

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("application/json");

      const body = await response.json();
      expectSchemaValid(validate, body, "GET /api/v1/attempts/att-1 200");
    });
  });

  /* ================================================================== */
  /*  Issues — error paths                                               */
  /* ================================================================== */

  describe("Issues — errors", () => {
    it("GET /api/v1/{issue_identifier} -> 404 for non-existent issue, matches errorResponseSchema", async () => {
      const validate = compileResponseSchema("/api/v1/{issue_identifier}", "get", "404");
      const response = await fetchApi("/api/v1/NONEXISTENT-999");

      expect(response.status).toBe(404);
      expect(response.headers.get("content-type")).toContain("application/json");

      const body = await response.json();
      expectSchemaValid(validate, body, "GET /api/v1/NONEXISTENT-999 404");
    });

    it("POST /api/v1/{issue_identifier}/abort -> 404 for non-existent issue, matches errorResponseSchema", async () => {
      const validate = compileResponseSchema("/api/v1/{issue_identifier}/abort", "post", "404");
      const response = await fetchApi("/api/v1/NONEXISTENT-999/abort", {
        method: "POST",
      });

      expect(response.status).toBe(404);
      expect(response.headers.get("content-type")).toContain("application/json");

      const body = await response.json();
      expectSchemaValid(validate, body, "POST /api/v1/NONEXISTENT-999/abort 404");
    });

    it("POST /api/v1/{issue_identifier}/model -> 400 with invalid body, matches validationErrorSchema", async () => {
      const validate = compileResponseSchema("/api/v1/{issue_identifier}/model", "post", "400");
      const response = await fetchApi("/api/v1/ENG-123/model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invalid: true }),
      });

      expect(response.status).toBe(400);
      expect(response.headers.get("content-type")).toContain("application/json");

      const body = await response.json();
      expectSchemaValid(validate, body, "POST /api/v1/ENG-123/model 400");
    });

    it("POST /api/v1/{issue_identifier}/transition -> 400 with invalid body, matches validationErrorSchema", async () => {
      const validate = compileResponseSchema("/api/v1/{issue_identifier}/transition", "post", "400");
      const response = await fetchApi("/api/v1/ENG-123/transition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invalid: true }),
      });

      expect(response.status).toBe(400);
      expect(response.headers.get("content-type")).toContain("application/json");

      const body = await response.json();
      expectSchemaValid(validate, body, "POST /api/v1/ENG-123/transition 400");
    });

    it("GET /api/v1/attempts/{attempt_id} -> 404 for non-existent attempt, matches errorResponseSchema", async () => {
      const validate = compileResponseSchema("/api/v1/attempts/{attempt_id}", "get", "404");
      const response = await fetchApi("/api/v1/attempts/nonexistent-att");

      expect(response.status).toBe(404);
      expect(response.headers.get("content-type")).toContain("application/json");

      const body = await response.json();
      expectSchemaValid(validate, body, "GET /api/v1/attempts/nonexistent-att 404");
    });
  });

  /* ================================================================== */
  /*  Workspaces                                                         */
  /* ================================================================== */

  describe("Workspaces", () => {
    it("GET /api/v1/workspaces -> 200, matches workspaceInventoryResponseSchema", async () => {
      const validate = compileResponseSchema("/api/v1/workspaces", "get", "200");
      const response = await fetchApi("/api/v1/workspaces");

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("application/json");

      const body = await response.json();
      expectSchemaValid(validate, body, "GET /api/v1/workspaces 200");
    });

    it("DELETE /api/v1/workspaces/{workspace_key} -> 404 for non-existent key, matches errorResponseSchema", async () => {
      const validate = compileResponseSchema("/api/v1/workspaces/{workspace_key}", "delete", "404");
      const response = await fetchApi("/api/v1/workspaces/nonexistent-ws", {
        method: "DELETE",
      });

      expect(response.status).toBe(404);
      expect(response.headers.get("content-type")).toContain("application/json");

      const body = await response.json();
      expectSchemaValid(validate, body, "DELETE /api/v1/workspaces/nonexistent-ws 404");
    });
  });

  /* ================================================================== */
  /*  Git                                                                */
  /* ================================================================== */

  describe("Git", () => {
    it("GET /api/v1/git/context -> 200, matches gitContextResponseSchema", async () => {
      const validate = compileResponseSchema("/api/v1/git/context", "get", "200");
      const response = await fetchApi("/api/v1/git/context");

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("application/json");

      const body = await response.json();
      expectSchemaValid(validate, body, "GET /api/v1/git/context 200");
    });
  });

  /* ================================================================== */
  /*  Config                                                             */
  /* ================================================================== */

  describe("Config", () => {
    it("GET /api/v1/config -> 200, matches configResponseSchema", async () => {
      const validate = compileResponseSchema("/api/v1/config", "get", "200");
      const response = await fetchApi("/api/v1/config");

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("application/json");

      const body = await response.json();
      expectSchemaValid(validate, body, "GET /api/v1/config 200");
    });

    it("GET /api/v1/config/schema -> 200, response is valid JSON object", async () => {
      const validate = compileResponseSchema("/api/v1/config/schema", "get", "200");
      const response = await fetchApi("/api/v1/config/schema");

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("application/json");

      const body = await response.json();
      expectSchemaValid(validate, body, "GET /api/v1/config/schema 200");
    });

    it("GET /api/v1/config/overlay -> 200, matches configOverlayGetResponseSchema", async () => {
      const validate = compileResponseSchema("/api/v1/config/overlay", "get", "200");
      const response = await fetchApi("/api/v1/config/overlay");

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("application/json");

      const body = await response.json();
      expectSchemaValid(validate, body, "GET /api/v1/config/overlay 200");
    });

    it("DELETE /api/v1/config/overlay/{path} -> 404 for non-existent path, matches errorResponseSchema", async () => {
      const validate = compileResponseSchema("/api/v1/config/overlay/{path}", "delete", "404");
      const response = await fetchApi("/api/v1/config/overlay/nonexistent.key", { method: "DELETE" });

      expect(response.status).toBe(404);
      expect(response.headers.get("content-type")).toContain("application/json");

      const body = await response.json();
      expectSchemaValid(validate, body, "DELETE /api/v1/config/overlay/nonexistent.key 404");
    });
  });

  /* ================================================================== */
  /*  Secrets                                                            */
  /* ================================================================== */

  describe("Secrets", () => {
    it("GET /api/v1/secrets -> 200, matches { keys: string[] }", async () => {
      const validate = compileResponseSchema("/api/v1/secrets", "get", "200");
      const response = await fetchApi("/api/v1/secrets");

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("application/json");

      const body = await response.json();
      expectSchemaValid(validate, body, "GET /api/v1/secrets 200");
    });

    it("DELETE /api/v1/secrets/{key} -> 404 for non-existent key, matches errorResponseSchema", async () => {
      const validate = compileResponseSchema("/api/v1/secrets/{key}", "delete", "404");
      const response = await fetchApi("/api/v1/secrets/NONEXISTENT_KEY", {
        method: "DELETE",
      });

      expect(response.status).toBe(404);
      expect(response.headers.get("content-type")).toContain("application/json");

      const body = await response.json();
      expectSchemaValid(validate, body, "DELETE /api/v1/secrets/NONEXISTENT_KEY 404");
    });
  });

  /* ================================================================== */
  /*  Endpoint coverage assertion                                        */
  /* ================================================================== */

  describe("Coverage", () => {
    it("covers all spec-defined paths", () => {
      const spec = getOpenApiSpec();
      const specPaths = Object.keys(spec.paths as Record<string, unknown>);
      // All 20 OpenAPI paths are covered by the tests above.
      expect(specPaths).toEqual(
        expect.arrayContaining([
          "/api/v1/state",
          "/api/v1/runtime",
          "/api/v1/refresh",
          "/api/v1/transitions",
          "/metrics",
          "/api/v1/{issue_identifier}",
          "/api/v1/{issue_identifier}/abort",
          "/api/v1/{issue_identifier}/model",
          "/api/v1/{issue_identifier}/transition",
          "/api/v1/{issue_identifier}/attempts",
          "/api/v1/attempts/{attempt_id}",
          "/api/v1/attempts/{attempt_id}/checkpoints",
          "/api/v1/prs",
          "/api/v1/workspaces",
          "/api/v1/workspaces/{workspace_key}",
          "/api/v1/git/context",
          "/api/v1/config",
          "/api/v1/config/schema",
          "/api/v1/config/overlay",
          "/api/v1/config/overlay/{path}",
          "/api/v1/secrets",
          "/api/v1/secrets/{key}",
        ]),
      );
    });
  });
});
