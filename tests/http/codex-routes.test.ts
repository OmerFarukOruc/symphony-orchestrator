import http from "node:http";

import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CodexControlPlaneMethodUnsupportedError } from "../../src/codex/control-plane.js";
import { registerCodexRoutes } from "../../src/http/routes/codex.js";
import { registerSystemRoutes } from "../../src/http/routes/system.js";
import { createMockLogger } from "../helpers.js";

vi.mock("../../src/codex/model-list.js", () => ({
  fetchCodexModels: vi
    .fn()
    .mockResolvedValue([{ id: "fallback-model", displayName: "Fallback", hidden: false, isDefault: true }]),
}));

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
    getRecoveryReport: vi.fn().mockReturnValue(null),
    requestRefresh: vi.fn().mockReturnValue({
      queued: true,
      coalesced: false,
      requestedAt: "2024-01-01T00:00:00Z",
    }),
  };
}

async function withServer(
  register: (app: express.Express) => void,
  run: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const app = express();
  app.use(express.json());
  register(app);
  const server = await new Promise<http.Server>((resolve) => {
    const activeServer = app.listen(0, () => resolve(activeServer));
  });
  const port = (server.address() as { port: number }).port;
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Codex admin routes", () => {
  it("returns an aggregated Codex admin snapshot from the host-side control plane", async () => {
    const codexControlPlane = {
      getCapabilities: vi.fn().mockResolvedValue({
        connectedAt: "2026-04-08T10:55:04+03:00",
        initializationError: null,
        methods: { "thread/list": "supported", "model/list": "supported" },
        notifications: { "app/list/updated": "enabled" },
      }),
      request: vi.fn().mockImplementation(async (method: string) => {
        switch (method) {
          case "account/read":
            return { account: { type: "chatgpt", email: "user@example.com" }, requiresOpenaiAuth: true };
          case "account/rateLimits/read":
            return { rateLimits: { limitId: "codex" }, rateLimitsByLimitId: { codex: { limitId: "codex" } } };
          case "model/list":
            return { data: [{ id: "gpt-5.4", displayName: "GPT-5.4", isDefault: true }] };
          case "thread/list":
            return { data: [{ id: "thr-1", name: "Main thread" }], nextCursor: null };
          case "thread/loaded/list":
            return { data: ["thr-1"] };
          case "experimentalFeature/list":
            return { data: [{ name: "fast-mode", enabled: true }], nextCursor: null };
          case "collaborationMode/list":
            return [{ id: "default", displayName: "Default" }];
          case "mcpServerStatus/list":
            return { data: [{ name: "filesystem", status: "connected" }], nextCursor: null };
          default:
            throw new Error(`unexpected method ${method}`);
        }
      }),
      listPendingUserInputRequests: vi.fn().mockReturnValue([
        {
          requestId: "req-1",
          method: "item/tool/requestUserInput",
          threadId: "thr-1",
          turnId: "turn-1",
          questions: [{ id: "choice", question: "Pick one" }],
          createdAt: "2026-04-08T10:55:04+03:00",
        },
      ]),
    };

    await withServer(
      (app) =>
        registerCodexRoutes(app, {
          orchestrator: makeOrchestrator() as never,
          codexControlPlane: codexControlPlane as never,
          logger: createMockLogger(),
        }),
      async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/v1/codex/admin`);
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.account.email).toBe("user@example.com");
        expect(body.requiresOpenaiAuth).toBe(true);
        expect(body.models).toEqual([{ id: "gpt-5.4", displayName: "GPT-5.4", isDefault: true }]);
        expect(body.threads).toEqual([{ id: "thr-1", name: "Main thread" }]);
        expect(body.loadedThreadIds).toEqual(["thr-1"]);
        expect(body.pendingRequests).toHaveLength(1);
        expect(codexControlPlane.getCapabilities).toHaveBeenCalledOnce();
        expect(codexControlPlane.listPendingUserInputRequests).toHaveBeenCalledOnce();
      },
    );
  });

  it("returns capabilities from the host-side control plane", async () => {
    const codexControlPlane = {
      getCapabilities: vi.fn().mockResolvedValue({
        connectedAt: "2026-04-08T10:55:04+03:00",
        initializationError: null,
        methods: { "thread/list": "supported" },
        notifications: { "app/list/updated": "enabled" },
      }),
    };

    await withServer(
      (app) =>
        registerCodexRoutes(app, {
          orchestrator: makeOrchestrator() as never,
          codexControlPlane: codexControlPlane as never,
          logger: createMockLogger(),
        }),
      async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/v1/codex/capabilities`);
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.methods["thread/list"]).toBe("supported");
        expect(codexControlPlane.getCapabilities).toHaveBeenCalledOnce();
      },
    );
  });

  it("maps thread list query params onto thread/list", async () => {
    const codexControlPlane = {
      request: vi.fn().mockResolvedValue({ data: [], nextCursor: null }),
    };

    await withServer(
      (app) =>
        registerCodexRoutes(app, {
          orchestrator: makeOrchestrator() as never,
          codexControlPlane: codexControlPlane as never,
          logger: createMockLogger(),
        }),
      async (baseUrl) => {
        const response = await fetch(
          `${baseUrl}/api/v1/codex/threads?limit=7&sortKey=updated_at&archived=true&cwd=%2Ftmp&modelProviders=openai,azure&sourceKinds=cli,vscode`,
        );
        expect(response.status).toBe(200);
        expect(codexControlPlane.request).toHaveBeenCalledWith("thread/list", {
          cursor: null,
          limit: 7,
          sortKey: "updated_at",
          archived: true,
          cwd: undefined,
          modelProviders: ["openai", "azure"],
          sourceKinds: ["cli", "vscode"],
        });
      },
    );
  });

  it("returns 501 when the connected Codex build does not support a method", async () => {
    const codexControlPlane = {
      request: vi.fn().mockRejectedValue(new CodexControlPlaneMethodUnsupportedError("experimentalFeature/list")),
    };

    await withServer(
      (app) =>
        registerCodexRoutes(app, {
          orchestrator: makeOrchestrator() as never,
          codexControlPlane: codexControlPlane as never,
          logger: createMockLogger(),
        }),
      async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/v1/codex/features`);
        expect(response.status).toBe(501);
        const body = await response.json();
        expect(body.error.code).toBe("unsupported_method");
        expect(body.error.method).toBe("experimentalFeature/list");
      },
    );
  });

  it("lists and resolves pending user-input requests", async () => {
    const codexControlPlane = {
      listPendingUserInputRequests: vi.fn().mockReturnValue([
        {
          requestId: "req-1",
          method: "item/tool/requestUserInput",
          threadId: "thr-1",
          turnId: "turn-1",
          questions: [{ id: "choice", question: "Pick one" }],
          createdAt: "2026-04-08T10:55:04+03:00",
        },
      ]),
      respondToRequest: vi.fn().mockResolvedValue(true),
    };

    await withServer(
      (app) =>
        registerCodexRoutes(app, {
          orchestrator: makeOrchestrator() as never,
          codexControlPlane: codexControlPlane as never,
          logger: createMockLogger(),
        }),
      async (baseUrl) => {
        const listResponse = await fetch(`${baseUrl}/api/v1/codex/requests/user-input`);
        expect(listResponse.status).toBe(200);
        const listed = await listResponse.json();
        expect(listed.data).toHaveLength(1);

        const respondResponse = await fetch(`${baseUrl}/api/v1/codex/requests/user-input/req-1/respond`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ result: { answers: [{ id: "choice", value: "a" }] } }),
        });
        expect(respondResponse.status).toBe(200);
        expect(codexControlPlane.respondToRequest).toHaveBeenCalledWith("req-1", {
          answers: [{ id: "choice", value: "a" }],
        });
      },
    );
  });

  it("returns 404 when a pending user-input request does not exist", async () => {
    const codexControlPlane = {
      respondToRequest: vi.fn().mockResolvedValue(false),
    };

    await withServer(
      (app) =>
        registerCodexRoutes(app, {
          orchestrator: makeOrchestrator() as never,
          codexControlPlane: codexControlPlane as never,
          logger: createMockLogger(),
        }),
      async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/v1/codex/requests/user-input/missing/respond`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ result: null }),
        });
        expect(response.status).toBe(404);
      },
    );
  });

  it("returns 503 when codexControlPlane dependency is missing", async () => {
    await withServer(
      (app) =>
        registerCodexRoutes(app, {
          orchestrator: makeOrchestrator() as never,
          codexControlPlane: undefined as never,
          logger: createMockLogger(),
        }),
      async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/v1/codex/capabilities`);
        expect(response.status).toBe(503);
        const body = await response.json();
        expect(body.error.code).toBe("codex_control_plane_unavailable");
      },
    );
  });

  it("returns 502 when the control plane throws a generic error", async () => {
    const codexControlPlane = {
      request: vi.fn().mockRejectedValue(new Error("connection reset by peer")),
      getCapabilities: vi.fn().mockRejectedValue(new Error("connection reset by peer")),
    };

    await withServer(
      (app) =>
        registerCodexRoutes(app, {
          orchestrator: makeOrchestrator() as never,
          codexControlPlane: codexControlPlane as never,
          logger: createMockLogger(),
        }),
      async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/v1/codex/capabilities`);
        expect(response.status).toBe(502);
        const body = await response.json();
        expect(body.error.code).toBe("codex_request_failed");
        expect(body.error.message).toBe("connection reset by peer");
      },
    );
  });

  it("surfaces richer model metadata from the control plane through /api/v1/models", async () => {
    const codexControlPlane = {
      request: vi.fn().mockResolvedValue({
        data: [
          {
            id: "gpt-5.4",
            displayName: "GPT-5.4",
            hidden: false,
            supportedReasoningEfforts: [{ reasoningEffort: "high", description: "Deep" }],
            defaultReasoningEffort: "medium",
            inputModalities: ["text", "image"],
            supportsPersonality: true,
            isDefault: true,
          },
        ],
        nextCursor: null,
      }),
    };

    await withServer(
      (app) =>
        registerSystemRoutes(app, {
          orchestrator: makeOrchestrator() as never,
          codexControlPlane: codexControlPlane as never,
          logger: createMockLogger(),
        }),
      async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/v1/models`);
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.models[0].supportedReasoningEfforts[0].reasoningEffort).toBe("high");
        expect(codexControlPlane.request).toHaveBeenCalledWith("model/list", {
          limit: 50,
          includeHidden: true,
        });
      },
    );
  });

  it("falls back to fetchCodexModels when control plane throws on /api/v1/models", async () => {
    const codexControlPlane = {
      request: vi.fn().mockRejectedValue(new Error("connection lost")),
    };

    await withServer(
      (app) =>
        registerSystemRoutes(app, {
          orchestrator: makeOrchestrator() as never,
          codexControlPlane: codexControlPlane as never,
          logger: createMockLogger(),
        }),
      async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/v1/models`);
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.models[0].id).toBe("fallback-model");
      },
    );
  });

  it("uses fetchCodexModels when no control plane is configured for /api/v1/models", async () => {
    await withServer(
      (app) =>
        registerSystemRoutes(app, {
          orchestrator: makeOrchestrator() as never,
          logger: createMockLogger(),
        }),
      async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/v1/models`);
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.models[0].id).toBe("fallback-model");
      },
    );
  });
});
