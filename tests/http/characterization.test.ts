import http from "node:http";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConfigOverlayStore } from "../../src/config/overlay.js";
import { registerFastifyHttpRoutes } from "../../src/http/fastify-routes.js";
import { createDataPlaneServer } from "../../src/dispatch/server.js";
import { registerSetupApi } from "../../src/setup/api.js";
import { SecretsStore } from "../../src/secrets/store.js";
import {
  buildCreateIssueMutation,
  buildCreateLabelMutation,
  buildCreateProjectMutation,
  buildProjectLookupQuery,
  buildTeamsQuery,
} from "../../src/linear/queries.js";
import { createMockLogger, createJsonResponse, createTextResponse } from "../helpers.js";
import { resetFlags, setFlag } from "../../src/core/feature-flags.js";

const deviceAuthMocks = vi.hoisted(() => {
  const state = {
    session: null as {
      codeVerifier: string;
      state: string;
      authUrl: string;
      redirectUri: string;
      createdAt: number;
      authCode: string | null;
      error: string | null;
      complete: boolean;
      callbackServer: null;
    } | null,
  };

  return {
    state,
    checkAuthEndpointReachable: vi.fn(),
    createPkceSession: vi.fn(),
    exchangePkceCode: vi.fn(),
    savePkceAuthTokens: vi.fn(),
    shutdownCallbackServer: vi.fn(),
    startCallbackServer: vi.fn(),
  };
});

vi.mock("../../src/setup/device-auth.js", () => ({
  checkAuthEndpointReachable: deviceAuthMocks.checkAuthEndpointReachable,
  createPkceSession: deviceAuthMocks.createPkceSession,
  exchangePkceCode: deviceAuthMocks.exchangePkceCode,
  savePkceAuthTokens: deviceAuthMocks.savePkceAuthTokens,
  shutdownCallbackServer: deviceAuthMocks.shutdownCallbackServer,
  startCallbackServer: deviceAuthMocks.startCallbackServer,
}));

vi.mock("../../src/agent-runner/index.js", () => ({
  AgentRunner: class MockAgentRunner {
    async runAttempt() {
      return {
        kind: "normal" as const,
        errorCode: null,
        errorMessage: null,
        threadId: "thread-1",
        turnId: "turn-1",
        turnCount: 1,
      };
    }
  },
}));

const originalEnv = { ...process.env };

let externalFetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

beforeEach(() => {
  process.env = { ...originalEnv };
  delete process.env.LINEAR_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.GITHUB_TOKEN;
  externalFetchMock = vi.fn<typeof fetch>(async () => {
    throw new Error("Unexpected external fetch");
  });
  vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    return externalFetchMock(input, init);
  });

  deviceAuthMocks.state.session = null;
  deviceAuthMocks.checkAuthEndpointReachable.mockReset();
  deviceAuthMocks.checkAuthEndpointReachable.mockResolvedValue(null);
  deviceAuthMocks.createPkceSession.mockReset();
  deviceAuthMocks.exchangePkceCode.mockReset();
  deviceAuthMocks.exchangePkceCode.mockResolvedValue({
    access_token: "access-token",
    refresh_token: "refresh-token",
    id_token: "id-token",
    token_type: "Bearer",
    expires_in: 3600,
  });
  deviceAuthMocks.savePkceAuthTokens.mockReset();
  deviceAuthMocks.savePkceAuthTokens.mockResolvedValue(undefined);
  deviceAuthMocks.shutdownCallbackServer.mockReset();
  deviceAuthMocks.startCallbackServer.mockReset();
  deviceAuthMocks.startCallbackServer.mockResolvedValue(undefined);
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

interface ControlPlaneHarness {
  app: FastifyInstance;
  cleanup: () => Promise<void>;
  orchestrator: ReturnType<typeof createControlPlaneOrchestrator>;
  configOverlayStore: ConfigOverlayStore;
  secretsStore: SecretsStore;
  workspaceRoot: string;
}

interface SetupHarness {
  app: FastifyInstance;
  cleanup: () => Promise<void>;
  archiveDir: string;
  orchestrator: {
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    requestRefresh: ReturnType<typeof vi.fn>;
  };
  configOverlayStore: ConfigOverlayStore;
  secretsStore: SecretsStore;
}

const fixedTimestamp = "2026-03-25T10:15:30.000Z";

function createControlPlaneOrchestrator(workspaceRoot: string) {
  const snapshot = {
    generatedAt: fixedTimestamp,
    counts: { running: 1, retrying: 1, queued: 1, completed: 1 },
    queued: [{ identifier: "MT-41", title: "Queued fixture" }],
    running: [
      {
        issueId: "issue-42",
        identifier: "MT-42",
        title: "Characterize HTTP routes",
        state: "Todo",
        workspaceKey: "MT-42",
        workspacePath: path.join(workspaceRoot, "MT-42"),
        branchName: "symphony/mt-42",
        pullRequestUrl: "https://github.com/acme/app/pull/42",
        status: "running",
      },
    ],
    retrying: [
      {
        issueId: "issue-43",
        identifier: "MT-43",
        title: "Retry fixture",
        state: "In Progress",
        workspaceKey: "MT-43",
        workspacePath: path.join(workspaceRoot, "MT-43"),
        branchName: "symphony/mt-43",
        pullRequestUrl: null,
        status: "retrying",
      },
    ],
    completed: [
      {
        issueId: "issue-44",
        identifier: "MT-44",
        title: "Completed fixture",
        state: "Done",
        workspaceKey: "MT-44",
        workspacePath: path.join(workspaceRoot, "MT-44"),
        status: "completed",
      },
    ],
    workflowColumns: [
      { key: "todo", label: "Todo", kind: "active", terminal: false, count: 1, issues: [{ identifier: "MT-42" }] },
      { key: "done", label: "Done", kind: "terminal", terminal: true, count: 1, issues: [{ identifier: "MT-44" }] },
    ],
    codexTotals: { inputTokens: 12, outputTokens: 7, totalTokens: 19, secondsRunning: 31 },
    rateLimits: { remaining: 99 },
    recentEvents: [
      {
        at: fixedTimestamp,
        issueId: "issue-42",
        issueIdentifier: "MT-42",
        sessionId: "session-1",
        event: "queued",
        message: "Queued by fixture",
        content: null,
        metadata: { source: "characterization" },
      },
    ],
    stallEvents: [
      {
        at: fixedTimestamp,
        issueId: "issue-43",
        issueIdentifier: "MT-43",
        silentMs: 1200,
        timeoutMs: 2400,
      },
    ],
    systemHealth: {
      status: "healthy",
      checkedAt: fixedTimestamp,
      runningCount: 1,
      message: "All systems nominal",
    },
  };

  const issueDetail = {
    issueId: "issue-42",
    identifier: "MT-42",
    title: "Characterize HTTP routes",
    state: "Todo",
    attempts: [{ attemptId: "attempt-1", status: "completed" }],
    currentAttemptId: "attempt-live",
  };

  return {
    getSnapshot: vi.fn().mockReturnValue(snapshot),
    requestRefresh: vi.fn().mockReturnValue({
      queued: true,
      coalesced: false,
      requestedAt: fixedTimestamp,
    }),
    getIssueDetail: vi.fn().mockImplementation((identifier: string) => (identifier === "MT-42" ? issueDetail : null)),
    getAttemptDetail: vi.fn().mockImplementation((attemptId: string) =>
      attemptId === "attempt-1"
        ? {
            attemptId: "attempt-1",
            status: "completed",
            events: [{ at: fixedTimestamp, event: "finished" }],
          }
        : null,
    ),
    abortIssue: vi
      .fn()
      .mockImplementation((identifier: string) =>
        identifier === "MT-42"
          ? { ok: true, alreadyStopping: false, requestedAt: fixedTimestamp }
          : { ok: false, code: "not_found", message: "Unknown issue identifier" },
      ),
    updateIssueModelSelection: vi
      .fn()
      .mockImplementation(async (input: { identifier: string; model: string; reasoningEffort: string | null }) =>
        input.identifier === "MT-42"
          ? {
              updated: true,
              restarted: false,
              appliesNextAttempt: true,
              selection: {
                model: input.model,
                reasoningEffort: input.reasoningEffort,
                source: "override",
              },
            }
          : null,
      ),
  };
}

function createControlPlaneConfigStore(workspaceRoot: string) {
  const getConfig = vi.fn().mockReturnValue({
    tracker: {
      activeStates: ["Todo", "In Progress"],
      terminalStates: ["Done"],
    },
    stateMachine: {
      stages: [
        { name: "Todo", kind: "backlog" as const },
        { name: "In Progress", kind: "active" as const },
        { name: "Done", kind: "terminal" as const },
      ],
      transitions: {
        Todo: ["Todo", "In Progress"],
        "In Progress": ["In Progress", "Done"],
        Done: ["Done"],
      },
    },
    repos: [
      {
        repoUrl: "https://github.com/acme/app.git",
        defaultBranch: "main",
        identifierPrefix: "MT",
        githubOwner: "acme",
        githubRepo: "app",
      },
    ],
    workspace: {
      root: workspaceRoot,
      strategy: "directory",
      hooks: {},
    },
    polling: { intervalMs: 60_000 },
    agent: {},
    codex: {},
    server: { port: 4000 },
  });

  const getMergedConfigMap = vi.fn().mockReturnValue({
    tracker: { kind: "linear", project_slug: "symphony" },
    codex: {
      auth: { mode: "api_key" },
      provider: { env_key: "OPENAI_API_KEY", auth_header: "Bearer secret-value" },
    },
    notification: {
      slack: { webhook: "https://hooks.slack.test/secret" },
    },
    github: {
      token: "ghp_secret",
    },
    workspace: { root: workspaceRoot, strategy: "directory" },
  });

  return {
    getConfig,
    getMergedConfigMap,
  };
}

async function createControlPlaneHarness(): Promise<ControlPlaneHarness> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "symphony-http-char-"));
  const workspaceRoot = path.join(tempDir, "workspaces");
  const archiveDir = path.join(tempDir, "archive");
  const secretsDir = path.join(tempDir, "secrets");
  const overlayPath = path.join(tempDir, "config", "overlay.yaml");

  await mkdir(path.join(workspaceRoot, "MT-42"), { recursive: true });
  await mkdir(path.join(workspaceRoot, "MT-43"), { recursive: true });
  await mkdir(path.join(workspaceRoot, "MT-44"), { recursive: true });
  await mkdir(path.join(workspaceRoot, "ORPHAN"), { recursive: true });
  await writeFile(path.join(workspaceRoot, "MT-42", "artifact.txt"), "fixture-content", "utf8");

  process.env.MASTER_KEY = "characterization-master-key";
  process.env.npm_package_version = "9.9.9-characterization";
  process.env.SYMPHONY_WORKFLOW_PATH = "/tmp/WORKFLOW.fixture.md";
  process.env.SYMPHONY_DATA_DIR = "/tmp/symphony-data";

  const configOverlayStore = new ConfigOverlayStore(overlayPath, createMockLogger());
  await configOverlayStore.start();

  const secretsStore = new SecretsStore(secretsDir, createMockLogger());
  await secretsStore.start();
  await secretsStore.set("OPENAI_API_KEY", "sk-control-plane");

  const orchestrator = createControlPlaneOrchestrator(workspaceRoot);
  const configStore = createControlPlaneConfigStore(workspaceRoot);
  const linearClient = {
    resolveStateId: vi.fn().mockResolvedValue("linear-state-1"),
    runGraphQL: vi.fn().mockResolvedValue({ data: { issueUpdate: { success: true } } }),
  };

  const app = Fastify({ logger: false });
  registerFastifyHttpRoutes(app, {
    orchestrator: orchestrator as never,
    configStore: configStore as never,
    configOverlayStore,
    secretsStore,
    linearClient: linearClient as never,
    archiveDir,
    frontendDir: tempDir,
  });
  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith("/api/") || request.url === "/metrics") {
      reply.status(404).send({ error: { code: "not_found", message: "Not found" } });
      return;
    }
    reply.status(404).send({ error: { code: "not_found", message: "Not found" } });
  });

  return {
    app,
    orchestrator,
    configOverlayStore,
    secretsStore,
    workspaceRoot,
    cleanup: async () => {
      await app.close();
      await configOverlayStore.stop();
      await rm(tempDir, { recursive: true, force: true });
    },
  };
}

async function createSetupHarness(options?: {
  initializeSecrets?: boolean;
  seedSecrets?: Array<{ key: string; value: string }>;
  overlayEntries?: Array<{ path: string; value: unknown }>;
  createAuthFile?: boolean;
}): Promise<SetupHarness> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "symphony-setup-char-"));
  const archiveDir = path.join(tempDir, "archive");
  const overlayPath = path.join(tempDir, "config", "overlay.yaml");
  const secretsDir = path.join(tempDir, "secrets");

  await mkdir(archiveDir, { recursive: true });

  const configOverlayStore = new ConfigOverlayStore(overlayPath, createMockLogger());
  await configOverlayStore.start();

  const secretsStore = new SecretsStore(secretsDir, createMockLogger());
  if (options?.initializeSecrets) {
    process.env.MASTER_KEY = "setup-characterization-master-key";
    await secretsStore.start();
    for (const entry of options.seedSecrets ?? []) {
      await secretsStore.set(entry.key, entry.value);
    }
  } else {
    await secretsStore.startDeferred();
  }

  if (options?.overlayEntries?.length) {
    await configOverlayStore.setBatch(options.overlayEntries);
  }

  if (options?.createAuthFile) {
    const authDir = path.join(archiveDir, "codex-auth");
    await mkdir(authDir, { recursive: true });
    await writeFile(path.join(authDir, "auth.json"), JSON.stringify({ access_token: "fixture-auth" }), "utf8");
  }

  const orchestrator = {
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    requestRefresh: vi.fn().mockReturnValue({ queued: true, coalesced: false, requestedAt: fixedTimestamp }),
  };

  const app = Fastify({ logger: false });
  registerSetupApi(app, {
    secretsStore,
    configOverlayStore,
    orchestrator: orchestrator as never,
    archiveDir,
  });

  return {
    app,
    archiveDir,
    orchestrator,
    configOverlayStore,
    secretsStore,
    cleanup: async () => {
      await app.close();
      await configOverlayStore.stop();
      await rm(tempDir, { recursive: true, force: true });
    },
  };
}

function createPkceSessionFixture() {
  return {
    codeVerifier: "fixture-code-verifier",
    state: "fixture-state",
    authUrl: "https://auth.example.test/start",
    redirectUri: "http://localhost:1455/auth/callback",
    createdAt: Date.now(),
    authCode: null as string | null,
    error: null as string | null,
    complete: false,
    callbackServer: null,
  };
}

async function makeDataPlaneRequest(
  app: ReturnType<typeof createDataPlaneServer>,
  method: string,
  routePath: string,
  options: { body?: unknown; headers?: Record<string, string> } = {},
): Promise<{ status: number; body: unknown; headers: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const address = server.address();
      if (typeof address !== "object" || !address) {
        server.close();
        reject(new Error("Failed to resolve data-plane server address"));
        return;
      }

      const payload = options.body ? JSON.stringify(options.body) : "";
      const request = http.request(
        {
          hostname: "127.0.0.1",
          port: address.port,
          path: routePath,
          method,
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload),
            ...options.headers,
          },
        },
        (response) => {
          let data = "";
          response.on("data", (chunk) => {
            data += chunk;
          });
          response.on("end", () => {
            const headers: Record<string, string> = {};
            for (const [key, value] of Object.entries(response.headers)) {
              headers[key] = Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
            }
            try {
              resolve({
                status: response.statusCode ?? 0,
                body: data ? JSON.parse(data) : null,
                headers,
              });
            } catch {
              resolve({ status: response.statusCode ?? 0, body: data, headers });
            } finally {
              server.close();
            }
          });
        },
      );

      request.on("error", (error) => {
        server.close();
        reject(error);
      });

      request.write(payload);
      request.end();
    });
  });
}

describe("HTTP characterization", () => {
  describe("control plane + config + secrets surfaces", () => {
    it("captures state, runtime, metrics, refresh, transitions, issue, git, and workspace endpoint behavior", async () => {
      const harness = await createControlPlaneHarness();

      try {
        const stateResponse = await harness.app.inject({ method: "GET", url: "/api/v1/state" });
        expect(stateResponse.statusCode).toBe(200);
        expect(stateResponse.headers["content-type"]).toContain("application/json");
        expect(stateResponse.json()).toMatchObject({
          generated_at: fixedTimestamp,
          counts: { running: 1, retrying: 1, queued: 1, completed: 1 },
          codex_totals: {
            input_tokens: 12,
            output_tokens: 7,
            total_tokens: 19,
            seconds_running: 31,
          },
          system_health: {
            status: "healthy",
            checked_at: fixedTimestamp,
            running_count: 1,
            message: "All systems nominal",
          },
        });

        resetFlags();
        setFlag("DUAL_WRITE", true);
        const runtimeResponse = await harness.app.inject({ method: "GET", url: "/api/v1/runtime" });
        expect(runtimeResponse.statusCode).toBe(200);
        expect(runtimeResponse.json()).toEqual({
          version: "9.9.9-characterization",
          workflow_path: "/tmp/WORKFLOW.fixture.md",
          data_dir: "/tmp/symphony-data",
          feature_flags: { DUAL_WRITE: true },
          provider_summary: "Codex",
        });
        resetFlags();

        const metricsResponse = await harness.app.inject({ method: "GET", url: "/metrics" });
        expect(metricsResponse.statusCode).toBe(200);
        expect(metricsResponse.headers["content-type"]).toContain("text/plain");
        expect(metricsResponse.body).toContain("symphony_http_requests_total");
        expect(metricsResponse.body).toContain("symphony_http_request_duration_seconds");

        const refreshResponse = await harness.app.inject({ method: "POST", url: "/api/v1/refresh" });
        expect(refreshResponse.statusCode).toBe(202);
        expect(refreshResponse.json()).toEqual({
          queued: true,
          coalesced: false,
          requested_at: fixedTimestamp,
        });

        const transitionsResponse = await harness.app.inject({ method: "GET", url: "/api/v1/transitions" });
        expect(transitionsResponse.statusCode).toBe(200);
        expect(transitionsResponse.json()).toEqual({
          transitions: {
            todo: ["todo", "in progress"],
            "in progress": ["in progress", "done"],
            done: ["done"],
          },
        });

        const issueResponse = await harness.app.inject({ method: "GET", url: "/api/v1/MT-42" });
        expect(issueResponse.statusCode).toBe(200);
        expect(issueResponse.json()).toMatchObject({ identifier: "MT-42", currentAttemptId: "attempt-live" });

        const missingIssueResponse = await harness.app.inject({ method: "GET", url: "/api/v1/MT-999" });
        expect(missingIssueResponse.statusCode).toBe(404);
        expect(missingIssueResponse.json()).toEqual({
          error: { code: "not_found", message: "Unknown issue identifier" },
        });

        const attemptsResponse = await harness.app.inject({ method: "GET", url: "/api/v1/MT-42/attempts" });
        expect(attemptsResponse.statusCode).toBe(200);
        expect(attemptsResponse.json()).toEqual({
          attempts: [{ attemptId: "attempt-1", status: "completed" }],
          current_attempt_id: "attempt-live",
        });

        const attemptDetailResponse = await harness.app.inject({ method: "GET", url: "/api/v1/attempts/attempt-1" });
        expect(attemptDetailResponse.statusCode).toBe(200);
        expect(attemptDetailResponse.json()).toMatchObject({
          attemptId: "attempt-1",
          status: "completed",
        });

        const abortResponse = await harness.app.inject({ method: "POST", url: "/api/v1/MT-42/abort" });
        expect(abortResponse.statusCode).toBe(202);
        expect(abortResponse.json()).toEqual({
          ok: true,
          status: "stopping",
          already_stopping: false,
          requested_at: fixedTimestamp,
        });

        const modelResponse = await harness.app.inject({
          method: "POST",
          url: "/api/v1/MT-42/model",
          payload: { model: "gpt-5.4", reasoning_effort: "high" },
        });
        expect(modelResponse.statusCode).toBe(202);
        expect(modelResponse.json()).toEqual({
          updated: true,
          restarted: false,
          applies_next_attempt: true,
          selection: {
            model: "gpt-5.4",
            reasoning_effort: "high",
            source: "override",
          },
        });

        const transitionResponse = await harness.app.inject({
          method: "POST",
          url: "/api/v1/MT-42/transition",
          payload: { target_state: "In Progress" },
        });
        expect(transitionResponse.statusCode).toBe(200);
        expect(transitionResponse.json()).toEqual({ ok: true, from: "Todo", to: "In Progress" });

        const gitContextResponse = await harness.app.inject({ method: "GET", url: "/api/v1/git/context" });
        expect(gitContextResponse.statusCode).toBe(200);
        expect(gitContextResponse.json()).toMatchObject({
          githubAvailable: false,
          repos: [
            {
              repoUrl: "https://github.com/acme/app.git",
              defaultBranch: "main",
              identifierPrefix: "MT",
              githubOwner: "acme",
              githubRepo: "app",
              configured: true,
            },
          ],
        });

        const workspacesResponse = await harness.app.inject({ method: "GET", url: "/api/v1/workspaces" });
        expect(workspacesResponse.statusCode).toBe(200);
        expect(workspacesResponse.json()).toMatchObject({
          total: 4,
          active: 2,
          orphaned: 1,
        });

        const deleteWorkspaceResponse = await harness.app.inject({
          method: "DELETE",
          url: "/api/v1/workspaces/ORPHAN",
        });
        expect(deleteWorkspaceResponse.statusCode).toBe(204);

        const removedWorkspacePath = path.join(harness.workspaceRoot, "ORPHAN");
        await expect(readFile(removedWorkspacePath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
      } finally {
        await harness.cleanup();
      }
    });

    it("captures config and secrets extension API behavior and sanitization", async () => {
      const harness = await createControlPlaneHarness();

      try {
        const configResponse = await harness.app.inject({ method: "GET", url: "/api/v1/config" });
        expect(configResponse.statusCode).toBe(200);
        expect(configResponse.json()).toEqual({
          tracker: { kind: "linear", project_slug: "symphony" },
          codex: {
            auth: "[REDACTED]",
            provider: { env_key: "OPENAI_API_KEY", auth_header: "[REDACTED]" },
          },
          notification: {
            slack: { webhook: "[REDACTED]" },
          },
          github: {
            token: "[REDACTED]",
          },
          workspace: { root: harness.workspaceRoot, strategy: "directory" },
        });

        const configSchemaResponse = await harness.app.inject({ method: "GET", url: "/api/v1/config/schema" });
        expect(configSchemaResponse.statusCode).toBe(200);
        expect(configSchemaResponse.json()).toMatchObject({
          routes: {
            get_effective_config: "GET /api/v1/config",
            put_overlay: "PUT /api/v1/config/overlay",
          },
        });

        const putOverlayResponse = await harness.app.inject({
          method: "PUT",
          url: "/api/v1/config/overlay",
          payload: { codex: { model: "gpt-5.4" } },
        });
        expect(putOverlayResponse.statusCode).toBe(200);
        expect(putOverlayResponse.json()).toEqual({
          updated: true,
          overlay: { codex: { model: "gpt-5.4" } },
        });

        const patchOverlayResponse = await harness.app.inject({
          method: "PATCH",
          url: "/api/v1/config/overlay/server.port",
          payload: { value: 4010 },
        });
        expect(patchOverlayResponse.statusCode).toBe(200);
        expect(patchOverlayResponse.json()).toEqual({
          updated: true,
          overlay: {
            codex: { model: "gpt-5.4" },
            server: { port: 4010 },
          },
        });

        const overlayResponse = await harness.app.inject({ method: "GET", url: "/api/v1/config/overlay" });
        expect(overlayResponse.statusCode).toBe(200);
        expect(overlayResponse.json()).toEqual({
          overlay: {
            codex: { model: "gpt-5.4" },
            server: { port: 4010 },
          },
        });

        const deleteOverlayResponse = await harness.app.inject({
          method: "DELETE",
          url: "/api/v1/config/overlay/codex.model",
        });
        expect(deleteOverlayResponse.statusCode).toBe(204);

        const initialSecretsResponse = await harness.app.inject({ method: "GET", url: "/api/v1/secrets" });
        expect(initialSecretsResponse.statusCode).toBe(200);
        expect(initialSecretsResponse.json()).toEqual({ keys: ["OPENAI_API_KEY"] });

        const setSecretResponse = await harness.app.inject({
          method: "POST",
          url: "/api/v1/secrets/GITHUB_TOKEN",
          payload: { value: "ghp-characterization" },
        });
        expect(setSecretResponse.statusCode).toBe(204);

        const listedSecretsResponse = await harness.app.inject({ method: "GET", url: "/api/v1/secrets" });
        expect(listedSecretsResponse.json()).toEqual({ keys: ["GITHUB_TOKEN", "OPENAI_API_KEY"] });

        const deleteSecretResponse = await harness.app.inject({
          method: "DELETE",
          url: "/api/v1/secrets/GITHUB_TOKEN",
        });
        expect(deleteSecretResponse.statusCode).toBe(204);
      } finally {
        await harness.cleanup();
      }
    });

    it("captures invalid method and unknown route behavior", async () => {
      const harness = await createControlPlaneHarness();

      try {
        const invalidMethodResponse = await harness.app.inject({ method: "POST", url: "/api/v1/state" });
        expect(invalidMethodResponse.statusCode).toBe(404);
        expect(invalidMethodResponse.json()).toEqual({
          error: { code: "not_found", message: "Not found" },
        });

        const unknownRouteResponse = await harness.app.inject({ method: "GET", url: "/api/v1/unknown/route" });
        expect(unknownRouteResponse.statusCode).toBe(404);
        expect(unknownRouteResponse.json()).toEqual({
          error: { code: "not_found", message: "Not found" },
        });
      } finally {
        await harness.cleanup();
      }
    });
  });

  describe("setup API surface", () => {
    it("captures setup status, master key creation, and reset behavior", async () => {
      const pendingHarness = await createSetupHarness();
      try {
        const statusResponse = await pendingHarness.app.inject({ method: "GET", url: "/api/v1/setup/status" });
        expect(statusResponse.statusCode).toBe(200);
        expect(statusResponse.json()).toEqual({
          configured: false,
          steps: {
            masterKey: { done: false },
            linearProject: { done: false },
            repoRoute: { done: false },
            openaiKey: { done: false },
            githubToken: { done: false },
          },
        });

        const masterKeyResponse = await pendingHarness.app.inject({
          method: "POST",
          url: "/api/v1/setup/master-key",
          payload: {},
        });
        expect(masterKeyResponse.statusCode).toBe(200);
        expect(masterKeyResponse.json()).toMatchObject({ key: expect.stringMatching(/^[a-f0-9]{64}$/u) });
      } finally {
        await pendingHarness.cleanup();
      }

      const resetHarness = await createSetupHarness({
        initializeSecrets: true,
        seedSecrets: [
          { key: "LINEAR_API_KEY", value: "linear-secret" },
          { key: "GITHUB_TOKEN", value: "gh-token" },
        ],
      });

      try {
        process.env.GITHUB_TOKEN = "gh-token";
        const resetResponse = await resetHarness.app.inject({
          method: "POST",
          url: "/api/v1/setup/reset",
          payload: {},
        });
        expect(resetResponse.statusCode).toBe(200);
        expect(resetResponse.json()).toEqual({ ok: true });
        expect(resetHarness.orchestrator.stop).toHaveBeenCalledTimes(1);
        expect(resetHarness.secretsStore.list()).toEqual([]);
      } finally {
        await resetHarness.cleanup();
      }
    });

    it("captures Linear project discovery and project selection behavior", async () => {
      const harness = await createSetupHarness({
        initializeSecrets: true,
        seedSecrets: [{ key: "LINEAR_API_KEY", value: "linear-secret" }],
      });

      try {
        externalFetchMock.mockResolvedValueOnce(
          createJsonResponse(200, {
            data: {
              projects: {
                nodes: [
                  { id: "project-1", name: "Symphony", slugId: "symphony", teams: { nodes: [{ key: "ENG" }] } },
                  { id: "project-2", name: "Platform", slugId: "platform", teams: { nodes: [] } },
                ],
              },
            },
          }),
        );

        const projectsResponse = await harness.app.inject({ method: "GET", url: "/api/v1/setup/linear-projects" });
        expect(projectsResponse.statusCode).toBe(200);
        expect(projectsResponse.json()).toEqual({
          projects: [
            { id: "project-1", name: "Symphony", slugId: "symphony", teamKey: "ENG" },
            { id: "project-2", name: "Platform", slugId: "platform", teamKey: null },
          ],
        });

        const selectProjectResponse = await harness.app.inject({
          method: "POST",
          url: "/api/v1/setup/linear-project",
          payload: { slugId: "symphony" },
        });
        expect(selectProjectResponse.statusCode).toBe(200);
        expect(selectProjectResponse.json()).toEqual({ ok: true });
        expect(harness.orchestrator.start).toHaveBeenCalledTimes(1);
        expect(harness.orchestrator.requestRefresh).toHaveBeenCalledWith("setup");
        expect(harness.configOverlayStore.toMap()).toMatchObject({ tracker: { project_slug: "symphony" } });
      } finally {
        await harness.cleanup();
      }
    });

    it("captures OpenAI key, Codex auth, PKCE auth, and GitHub token behavior", async () => {
      const harness = await createSetupHarness({ initializeSecrets: true });

      try {
        externalFetchMock.mockResolvedValueOnce(createTextResponse(200, "ok"));
        const openAiKeyResponse = await harness.app.inject({
          method: "POST",
          url: "/api/v1/setup/openai-key",
          payload: { key: "sk-valid" },
        });
        expect(openAiKeyResponse.statusCode).toBe(200);
        expect(openAiKeyResponse.json()).toEqual({ valid: true });
        expect(harness.secretsStore.get("OPENAI_API_KEY")).toBe("sk-valid");

        const authJson = JSON.stringify({ access_token: "token", email: "user@example.com" });
        const codexAuthResponse = await harness.app.inject({
          method: "POST",
          url: "/api/v1/setup/codex-auth",
          payload: { authJson },
        });
        expect(codexAuthResponse.statusCode).toBe(200);
        expect(codexAuthResponse.json()).toEqual({ ok: true });
        const savedAuthJson = JSON.parse(
          await readFile(path.join(harness.archiveDir, "codex-auth", "auth.json"), "utf8"),
        ) as Record<string, unknown>;
        expect(savedAuthJson).toMatchObject({ email: "user@example.com", auth_mode: "chatgpt" });

        const session = createPkceSessionFixture();
        deviceAuthMocks.state.session = session;
        deviceAuthMocks.createPkceSession.mockReturnValue(session);

        const pkceStartResponse = await harness.app.inject({
          method: "POST",
          url: "/api/v1/setup/pkce-auth/start",
          payload: {},
        });
        expect(pkceStartResponse.statusCode).toBe(200);
        expect(pkceStartResponse.json()).toEqual({ authUrl: session.authUrl });

        const pendingPkceResponse = await harness.app.inject({ method: "GET", url: "/api/v1/setup/pkce-auth/status" });
        expect(pendingPkceResponse.statusCode).toBe(200);
        expect(pendingPkceResponse.json()).toEqual({ status: "pending" });

        session.authCode = "fixture-auth-code";
        const completePkceResponse = await harness.app.inject({ method: "GET", url: "/api/v1/setup/pkce-auth/status" });
        expect(completePkceResponse.statusCode).toBe(200);
        expect(completePkceResponse.json()).toEqual({ status: "complete" });
        expect(deviceAuthMocks.exchangePkceCode).toHaveBeenCalledWith(
          "fixture-auth-code",
          "fixture-code-verifier",
          "http://localhost:1455/auth/callback",
        );
        expect(deviceAuthMocks.savePkceAuthTokens).toHaveBeenCalledWith(
          expect.any(Object),
          harness.archiveDir,
          harness.configOverlayStore,
        );

        const cancelPkceResponse = await harness.app.inject({
          method: "POST",
          url: "/api/v1/setup/pkce-auth/cancel",
          payload: {},
        });
        expect(cancelPkceResponse.statusCode).toBe(200);
        expect(cancelPkceResponse.json()).toEqual({ ok: true });

        externalFetchMock.mockResolvedValueOnce(createTextResponse(200, "ok"));
        const githubTokenResponse = await harness.app.inject({
          method: "POST",
          url: "/api/v1/setup/github-token",
          payload: { token: "ghp-good" },
        });
        expect(githubTokenResponse.statusCode).toBe(200);
        expect(githubTokenResponse.json()).toEqual({ valid: true });
        expect(harness.secretsStore.get("GITHUB_TOKEN")).toBe("ghp-good");
      } finally {
        await harness.cleanup();
      }
    });

    it("captures repo route CRUD and default-branch detection behavior", async () => {
      const harness = await createSetupHarness({ initializeSecrets: true });

      try {
        const createRouteResponse = await harness.app.inject({
          method: "POST",
          url: "/api/v1/setup/repo-route",
          payload: {
            repoUrl: "https://github.com/acme/app",
            defaultBranch: "main",
            identifierPrefix: "MT",
          },
        });
        expect(createRouteResponse.statusCode).toBe(200);
        expect(createRouteResponse.json()).toEqual({
          ok: true,
          route: {
            repo_url: "https://github.com/acme/app",
            default_branch: "main",
            identifier_prefix: "MT",
          },
        });

        const listRoutesResponse = await harness.app.inject({ method: "GET", url: "/api/v1/setup/repo-routes" });
        expect(listRoutesResponse.statusCode).toBe(200);
        expect(listRoutesResponse.json()).toEqual({
          routes: [
            {
              repo_url: "https://github.com/acme/app",
              default_branch: "main",
              identifier_prefix: "MT",
            },
          ],
        });

        externalFetchMock.mockResolvedValueOnce(createJsonResponse(200, { default_branch: "trunk" }));
        const detectBranchResponse = await harness.app.inject({
          method: "POST",
          url: "/api/v1/setup/detect-default-branch",
          payload: { repoUrl: "https://github.com/acme/app" },
        });
        expect(detectBranchResponse.statusCode).toBe(200);
        expect(detectBranchResponse.json()).toEqual({ defaultBranch: "trunk" });

        const deleteRouteResponse = await harness.app.inject({
          method: "DELETE",
          url: "/api/v1/setup/repo-route",
          payload: { index: 0 },
        });
        expect(deleteRouteResponse.statusCode).toBe(200);
        expect(deleteRouteResponse.json()).toEqual({ ok: true, routes: [] });
      } finally {
        await harness.cleanup();
      }
    });

    it("captures Linear-backed create-test-issue, create-label, and create-project behavior", async () => {
      const harness = await createSetupHarness({
        initializeSecrets: true,
        seedSecrets: [{ key: "LINEAR_API_KEY", value: "linear-secret" }],
        overlayEntries: [{ path: "tracker.project_slug", value: "symphony" }],
      });

      try {
        externalFetchMock
          .mockResolvedValueOnce(
            createJsonResponse(200, {
              data: {
                projects: {
                  nodes: [
                    {
                      id: "project-1",
                      name: "Symphony",
                      slugId: "symphony",
                      teams: { nodes: [{ id: "team-1", key: "ENG" }] },
                    },
                  ],
                },
              },
            }),
          )
          .mockResolvedValueOnce(
            createJsonResponse(200, {
              data: {
                team: {
                  states: {
                    nodes: [
                      { id: "state-1", name: "In Progress" },
                      { id: "state-2", name: "Done" },
                    ],
                  },
                },
              },
            }),
          )
          .mockResolvedValueOnce(
            createJsonResponse(200, {
              data: {
                team: {
                  labels: {
                    nodes: [{ id: "label-existing", name: "symphony" }],
                  },
                },
              },
            }),
          )
          .mockResolvedValueOnce(
            createJsonResponse(200, {
              data: {
                issueCreate: {
                  success: true,
                  issue: { identifier: "ENG-101", url: "https://linear.app/issue/ENG-101" },
                },
              },
            }),
          )
          .mockResolvedValueOnce(
            createJsonResponse(200, {
              data: {
                projects: {
                  nodes: [
                    {
                      id: "project-1",
                      name: "Symphony",
                      slugId: "symphony",
                      teams: { nodes: [{ id: "team-1", key: "ENG" }] },
                    },
                  ],
                },
              },
            }),
          )
          .mockResolvedValueOnce(
            createJsonResponse(200, {
              data: {
                issueLabelCreate: {
                  success: true,
                  issueLabel: { id: "label-1", name: "symphony" },
                },
              },
            }),
          )
          .mockResolvedValueOnce(
            createJsonResponse(200, {
              data: {
                teams: {
                  nodes: [{ id: "team-1", name: "Engineering", key: "ENG" }],
                },
              },
            }),
          )
          .mockResolvedValueOnce(
            createJsonResponse(200, {
              data: {
                projectCreate: {
                  success: true,
                  project: {
                    id: "project-2",
                    name: "New Symphony",
                    slugId: "new-symphony",
                    url: "https://linear.app/project/new-symphony",
                    teams: { nodes: [{ key: "ENG" }] },
                  },
                },
              },
            }),
          );

        const createIssueResponse = await harness.app.inject({
          method: "POST",
          url: "/api/v1/setup/create-test-issue",
          payload: {},
        });
        expect(createIssueResponse.statusCode).toBe(200);
        expect(createIssueResponse.json()).toEqual({
          ok: true,
          issueIdentifier: "ENG-101",
          issueUrl: "https://linear.app/issue/ENG-101",
        });

        const createLabelResponse = await harness.app.inject({
          method: "POST",
          url: "/api/v1/setup/create-label",
          payload: {},
        });
        expect(createLabelResponse.statusCode).toBe(200);
        expect(createLabelResponse.json()).toEqual({
          ok: true,
          labelId: "label-1",
          labelName: "symphony",
          alreadyExists: false,
        });

        const createProjectResponse = await harness.app.inject({
          method: "POST",
          url: "/api/v1/setup/create-project",
          payload: { name: "New Symphony" },
        });
        expect(createProjectResponse.statusCode).toBe(200);
        expect(createProjectResponse.json()).toEqual({
          ok: true,
          project: {
            id: "project-2",
            name: "New Symphony",
            slugId: "new-symphony",
            url: "https://linear.app/project/new-symphony",
            teamKey: "ENG",
          },
        });

        const fetchBodies = externalFetchMock.mock.calls.map(
          ([, init]) => JSON.parse(String(init?.body ?? "{}")) as { query?: string },
        );
        expect(fetchBodies[0]?.query).toBe(buildProjectLookupQuery());
        expect(fetchBodies[3]?.query).toBe(buildCreateIssueMutation());
        expect(fetchBodies[5]?.query).toBe(buildCreateLabelMutation());
        expect(fetchBodies[6]?.query).toBe(buildTeamsQuery());
        expect(fetchBodies[7]?.query).toBe(buildCreateProjectMutation());
      } finally {
        await harness.cleanup();
      }
    });
  });

  describe("data-plane HTTP surface", () => {
    it("captures GET /health behavior", async () => {
      const app = createDataPlaneServer("test-secret");
      const response = await makeDataPlaneRequest(app, "GET", "/health");
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: "ok", activeDispatches: 0 });
    });

    it("captures POST /dispatch auth, validation, and success stream behavior", async () => {
      const app = createDataPlaneServer("test-secret");

      const unauthorizedResponse = await makeDataPlaneRequest(app, "POST", "/dispatch", { body: {} });
      expect(unauthorizedResponse.status).toBe(401);

      const invalidResponse = await makeDataPlaneRequest(app, "POST", "/dispatch", {
        body: {},
        headers: { Authorization: "Bearer test-secret" },
      });
      expect(invalidResponse.status).toBe(400);
      expect(invalidResponse.body).toEqual({ error: "missing required fields: issue, config, workspace" });

      const successResponse = await makeDataPlaneRequest(app, "POST", "/dispatch", {
        headers: { Authorization: "Bearer test-secret" },
        body: {
          issue: { id: "issue-1", identifier: "MT-42", title: "Dispatch fixture" },
          attempt: 1,
          modelSelection: { model: "gpt-5.4", reasoningEffort: "high", source: "override" },
          promptTemplate: "You are a coding agent",
          workspace: { key: "MT-42", path: "/tmp/mt-42" },
          config: {
            tracker: {},
            polling: { intervalMs: 60_000 },
            workspace: { root: "/tmp", strategy: "directory", hooks: {} },
            agent: {},
            codex: {},
            server: { port: 4000 },
            repos: [],
          },
          codexRuntimeConfigToml: "model = 'gpt-5.4'",
          codexRuntimeAuthJsonBase64: null,
          codexRequiredEnvNames: [],
        },
      });
      expect(successResponse.status).toBe(200);
      expect(successResponse.headers["content-type"]).toContain("text/event-stream");
      expect(String(successResponse.body)).toContain('"type":"outcome"');
      expect(String(successResponse.body)).toContain('"kind":"normal"');
    });

    it("captures POST /dispatch/:runId/abort behavior for unknown runs", async () => {
      const app = createDataPlaneServer("test-secret");
      const response = await makeDataPlaneRequest(app, "POST", "/dispatch/unknown-run-id/abort", {
        headers: { Authorization: "Bearer test-secret" },
      });
      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: "run not found" });
    });
  });
});
