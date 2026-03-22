import type { Server } from "node:http";

import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConfigOverlayStore } from "../../src/config/overlay.js";
import { AttemptStore } from "../../src/core/attempt-store.js";
import type { RunAttemptDispatcher } from "../../src/dispatch/types.js";
import { ConfigStore } from "../../src/config/store.js";
import { LinearClient } from "../../src/linear/client.js";
import { Orchestrator } from "../../src/orchestrator/orchestrator.js";
import { SecretsStore } from "../../src/secrets/store.js";
import { registerSetupApi } from "../../src/setup/api.js";
import { WorkspaceManager } from "../../src/workspace/manager.js";
import {
  createMockLogger,
  createJsonResponse as jsonResponse,
  createTextResponse as textResponse,
} from "../helpers.js";

const { existsSyncMock, mkdirMock, writeFileMock, startDeviceAuthMock, pollDeviceAuthMock, saveDeviceAuthTokensMock } =
  vi.hoisted(() => ({
    existsSyncMock: vi.fn<(filePath: string) => boolean>(),
    mkdirMock: vi.fn<(filePath: string, options?: { recursive?: boolean }) => Promise<void>>(),
    writeFileMock:
      vi.fn<
        (filePath: string, data: string, options?: { encoding?: BufferEncoding; mode?: number }) => Promise<void>
      >(),
    startDeviceAuthMock: vi.fn<
      () => Promise<{
        user_code: string;
        verification_uri: string;
        verification_uri_complete?: string;
        device_code: string;
        expires_in: number;
        interval: number;
      }>
    >(),
    pollDeviceAuthMock:
      vi.fn<(deviceCode: string) => Promise<{ status: "pending" | "complete" | "expired"; error?: string }>>(),
    saveDeviceAuthTokensMock:
      vi.fn<
        (
          deviceCode: string,
          archiveDir: string,
          configOverlayStore: ConfigOverlayStore,
        ) => Promise<{ ok: boolean; error?: string }>
      >(),
  }));

vi.mock("node:fs", () => ({
  existsSync: existsSyncMock,
}));

vi.mock("node:fs/promises", () => ({
  mkdir: mkdirMock,
  writeFile: writeFileMock,
}));

vi.mock("../../src/setup/device-auth.js", () => ({
  startDeviceAuth: startDeviceAuthMock,
  pollDeviceAuth: pollDeviceAuthMock,
  saveDeviceAuthTokens: saveDeviceAuthTokensMock,
}));

type FetchStub = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const originalEnv = { ...process.env };
const realFetch = globalThis.fetch.bind(globalThis);

let externalFetchMock = vi.fn<FetchStub>();
const servers: Server[] = [];

function createSecretsStoreMock(): SecretsStore {
  const store = new SecretsStore("/secrets-store", createMockLogger());
  vi.spyOn(store, "start").mockResolvedValue(undefined);
  vi.spyOn(store, "startDeferred").mockResolvedValue(undefined);
  vi.spyOn(store, "initializeWithKey").mockResolvedValue(undefined);
  vi.spyOn(store, "set").mockResolvedValue(undefined);
  vi.spyOn(store, "delete").mockResolvedValue(true);
  return store;
}

function createConfigOverlayStoreMock(): ConfigOverlayStore {
  const store = new ConfigOverlayStore("/overlay/config.yaml", createMockLogger());
  vi.spyOn(store, "start").mockResolvedValue(undefined);
  vi.spyOn(store, "stop").mockResolvedValue(undefined);
  vi.spyOn(store, "replace").mockResolvedValue(true);
  vi.spyOn(store, "applyPatch").mockResolvedValue(true);
  vi.spyOn(store, "set").mockResolvedValue(true);
  vi.spyOn(store, "delete").mockResolvedValue(true);
  return store;
}

function createAgentRunnerMock(): RunAttemptDispatcher {
  return {
    runAttempt: vi.fn(async () => {
      throw new Error("not used in setup api tests");
    }),
  };
}

function createOrchestratorMock(): Orchestrator {
  const logger = createMockLogger();
  const orchestrator = new Orchestrator({
    attemptStore: new AttemptStore("/attempt-store", logger),
    configStore: new ConfigStore("/workflow.md", logger),
    linearClient: new LinearClient(() => {
      throw new Error("not used in setup api tests");
    }, logger),
    workspaceManager: new WorkspaceManager(() => {
      throw new Error("not used in setup api tests");
    }, logger),
    agentRunner: createAgentRunnerMock(),
    logger,
  });
  vi.spyOn(orchestrator, "start").mockResolvedValue(undefined);
  vi.spyOn(orchestrator, "stop").mockResolvedValue(undefined);
  vi.spyOn(orchestrator, "requestRefresh").mockReturnValue({
    queued: true,
    coalesced: false,
    requestedAt: "2026-03-22T00:00:00Z",
  });
  vi.spyOn(orchestrator, "getSnapshot").mockImplementation(() => {
    throw new Error("not used in setup api tests");
  });
  vi.spyOn(orchestrator, "getIssueDetail").mockReturnValue(null);
  vi.spyOn(orchestrator, "getAttemptDetail").mockReturnValue(null);
  vi.spyOn(orchestrator, "updateIssueModelSelection").mockResolvedValue(null);
  return orchestrator;
}

async function startSetupApiServer(options?: {
  archiveDir?: string;
  secretsStore?: SecretsStore;
  configOverlayStore?: ConfigOverlayStore;
  orchestrator?: Orchestrator;
}): Promise<{
  baseUrl: string;
  secretsStore: SecretsStore;
  configOverlayStore: ConfigOverlayStore;
  orchestrator: Orchestrator;
}> {
  const app = express();
  app.use(express.json());

  const secretsStore = options?.secretsStore ?? createSecretsStoreMock();
  const configOverlayStore = options?.configOverlayStore ?? createConfigOverlayStoreMock();
  const orchestrator = options?.orchestrator ?? createOrchestratorMock();

  registerSetupApi(app, {
    secretsStore,
    configOverlayStore,
    orchestrator,
    archiveDir: options?.archiveDir ?? "/archive-root",
  });

  const server = await new Promise<Server>((resolve) => {
    const startedServer = app.listen(0, "127.0.0.1", () => resolve(startedServer));
  });
  servers.push(server);

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new TypeError("Expected HTTP server to bind to an address object");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    secretsStore,
    configOverlayStore,
    orchestrator,
  };
}

async function postJson(baseUrl: string, route: string, body?: unknown): Promise<Response> {
  return fetch(`${baseUrl}${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  process.env = { ...originalEnv };
  delete process.env.LINEAR_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.GITHUB_TOKEN;

  existsSyncMock.mockReset();
  existsSyncMock.mockReturnValue(false);
  mkdirMock.mockReset();
  mkdirMock.mockResolvedValue(undefined);
  writeFileMock.mockReset();
  writeFileMock.mockResolvedValue(undefined);
  startDeviceAuthMock.mockReset();
  pollDeviceAuthMock.mockReset();
  saveDeviceAuthTokensMock.mockReset();

  externalFetchMock = vi.fn<FetchStub>();
  vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("http://127.0.0.1:")) {
      return realFetch(input, init);
    }
    return externalFetchMock(input, init);
  });
});

afterEach(async () => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error) {
              reject(error);
              return;
            }
            resolve();
          });
        }),
    ),
  );
});

describe("registerSetupApi", () => {
  it("reports setup status when no steps are complete", async () => {
    const { baseUrl } = await startSetupApiServer();

    const response = await fetch(`${baseUrl}/api/v1/setup/status`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      configured: false,
      steps: {
        masterKey: { done: false },
        linearProject: { done: false },
        openaiKey: { done: false },
        githubToken: { done: false },
      },
    });
  });

  it("reports setup status when steps are completed from store, env, and auth file sources", async () => {
    const secretsStore = createSecretsStoreMock();
    vi.spyOn(secretsStore, "isInitialized").mockReturnValue(true);
    vi.spyOn(secretsStore, "get").mockImplementation((key) => {
      if (key === "LINEAR_API_KEY") return null;
      if (key === "OPENAI_API_KEY") return null;
      if (key === "GITHUB_TOKEN") return null;
      return null;
    });
    existsSyncMock.mockReturnValue(true);
    process.env.LINEAR_API_KEY = "linear-from-env";
    process.env.GITHUB_TOKEN = "gh-from-env";

    const { baseUrl } = await startSetupApiServer({ secretsStore });

    const response = await fetch(`${baseUrl}/api/v1/setup/status`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      configured: true,
      steps: {
        masterKey: { done: true },
        linearProject: { done: true },
        openaiKey: { done: true },
        githubToken: { done: true },
      },
    });
    expect(existsSyncMock).toHaveBeenCalledWith("/archive-root/codex-auth/auth.json");
  });

  it("resets setup state successfully", async () => {
    const secretsStore = createSecretsStoreMock();
    const configOverlayStore = createConfigOverlayStoreMock();
    vi.spyOn(secretsStore, "list").mockReturnValue(["GITHUB_TOKEN", "LINEAR_API_KEY"]);

    const { baseUrl } = await startSetupApiServer({ secretsStore, configOverlayStore });
    const response = await postJson(baseUrl, "/api/v1/setup/reset");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(secretsStore.delete).toHaveBeenCalledTimes(2);
    expect(secretsStore.delete).toHaveBeenNthCalledWith(1, "GITHUB_TOKEN");
    expect(secretsStore.delete).toHaveBeenNthCalledWith(2, "LINEAR_API_KEY");
    expect(configOverlayStore.set).toHaveBeenNthCalledWith(1, "codex.auth.mode", "");
    expect(configOverlayStore.set).toHaveBeenNthCalledWith(2, "codex.auth.source_home", "");
  });

  it("returns reset_failed when reset throws", async () => {
    const secretsStore = createSecretsStoreMock();
    vi.spyOn(secretsStore, "list").mockReturnValue(["OPENAI_API_KEY"]);
    vi.spyOn(secretsStore, "delete").mockRejectedValue(new Error("delete failed"));

    const { baseUrl } = await startSetupApiServer({ secretsStore });
    const response = await postJson(baseUrl, "/api/v1/setup/reset");

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: {
        code: "reset_failed",
        message: "delete failed",
      },
    });
  });

  it("creates a master key and initializes the secrets store", async () => {
    const secretsStore = createSecretsStoreMock();
    const { baseUrl } = await startSetupApiServer({ secretsStore });

    const response = await postJson(baseUrl, "/api/v1/setup/master-key", {});
    const body = (await response.json()) as { key: string };

    expect(response.status).toBe(200);
    expect(body.key).toMatch(/^[a-f0-9]{64}$/u);
    expect(writeFileMock).toHaveBeenCalledWith("/archive-root/master.key", body.key, {
      encoding: "utf8",
      mode: 0o600,
    });
    expect(secretsStore.initializeWithKey).toHaveBeenCalledWith(body.key);
  });

  it("rejects master key creation when already initialized", async () => {
    const secretsStore = createSecretsStoreMock();
    vi.spyOn(secretsStore, "isInitialized").mockReturnValue(true);

    const { baseUrl } = await startSetupApiServer({ secretsStore });
    const response = await postJson(baseUrl, "/api/v1/setup/master-key", { key: "provided-key" });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: {
        code: "already_initialized",
        message: "Master key is already set",
      },
    });
  });

  it("returns setup_error when master key persistence fails", async () => {
    writeFileMock.mockRejectedValueOnce(new Error("disk full"));

    const { baseUrl } = await startSetupApiServer();
    const response = await postJson(baseUrl, "/api/v1/setup/master-key", { key: "provided-key" });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: {
        code: "setup_error",
        message: "Error: disk full",
      },
    });
  });

  it("returns missing_api_key when listing Linear projects without credentials", async () => {
    const { baseUrl } = await startSetupApiServer();

    const response = await fetch(`${baseUrl}/api/v1/setup/linear-projects`);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: "missing_api_key",
        message: "LINEAR_API_KEY not configured",
      },
    });
  });

  it("lists Linear projects successfully", async () => {
    const secretsStore = createSecretsStoreMock();
    vi.spyOn(secretsStore, "get").mockImplementation((key) => (key === "LINEAR_API_KEY" ? "linear-secret" : null));
    externalFetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        data: {
          projects: {
            nodes: [
              {
                id: "project-1",
                name: "Symphony",
                slugId: "symphony",
                teams: { nodes: [{ key: "ENG" }] },
              },
              {
                id: "project-2",
                name: "Platform",
                slugId: "platform",
                teams: { nodes: [] },
              },
            ],
          },
        },
      }),
    );

    const { baseUrl } = await startSetupApiServer({ secretsStore });
    const response = await fetch(`${baseUrl}/api/v1/setup/linear-projects`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      projects: [
        { id: "project-1", name: "Symphony", slugId: "symphony", teamKey: "ENG" },
        { id: "project-2", name: "Platform", slugId: "platform", teamKey: null },
      ],
    });
    expect(externalFetchMock).toHaveBeenCalledWith("https://api.linear.app/graphql", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "linear-secret",
      },
      body: JSON.stringify({
        query: "{ projects(first: 50) { nodes { id name slugId teams { nodes { key } } } } }",
      }),
    });
  });

  it("returns linear_api_error when the Linear API responds with a failure status", async () => {
    const secretsStore = createSecretsStoreMock();
    vi.spyOn(secretsStore, "get").mockImplementation((key) => (key === "LINEAR_API_KEY" ? "linear-secret" : null));
    externalFetchMock.mockResolvedValueOnce(textResponse(503, "unavailable"));

    const { baseUrl } = await startSetupApiServer({ secretsStore });
    const response = await fetch(`${baseUrl}/api/v1/setup/linear-projects`);

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: {
        code: "linear_api_error",
        message: "Linear API returned 503",
      },
    });
  });

  it("returns linear_api_error when the Linear API request throws", async () => {
    const secretsStore = createSecretsStoreMock();
    vi.spyOn(secretsStore, "get").mockImplementation((key) => (key === "LINEAR_API_KEY" ? "linear-secret" : null));
    externalFetchMock.mockRejectedValueOnce(new Error("network offline"));

    const { baseUrl } = await startSetupApiServer({ secretsStore });
    const response = await fetch(`${baseUrl}/api/v1/setup/linear-projects`);

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: {
        code: "linear_api_error",
        message: "Error: network offline",
      },
    });
  });

  it("returns missing_slug_id when selecting a Linear project without slugId", async () => {
    const { baseUrl } = await startSetupApiServer();
    const response = await postJson(baseUrl, "/api/v1/setup/linear-project", {});

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: "missing_slug_id",
        message: "slugId is required",
      },
    });
  });

  it("stores the selected Linear project and refreshes the orchestrator", async () => {
    const configOverlayStore = createConfigOverlayStoreMock();
    const orchestrator = createOrchestratorMock();
    const { baseUrl } = await startSetupApiServer({ configOverlayStore, orchestrator });

    const response = await postJson(baseUrl, "/api/v1/setup/linear-project", { slugId: "sym-42" });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(configOverlayStore.set).toHaveBeenCalledWith("tracker.project_slug", "sym-42");
    expect(orchestrator.start).toHaveBeenCalledTimes(1);
    expect(orchestrator.requestRefresh).toHaveBeenCalledWith("setup");
  });

  it("returns missing_key when setting an OpenAI key without a key", async () => {
    const { baseUrl } = await startSetupApiServer();
    const response = await postJson(baseUrl, "/api/v1/setup/openai-key", {});

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: "missing_key",
        message: "key is required",
      },
    });
  });

  it("validates and stores a valid OpenAI key", async () => {
    const secretsStore = createSecretsStoreMock();
    externalFetchMock.mockResolvedValueOnce(textResponse(200, "ok"));

    const { baseUrl } = await startSetupApiServer({ secretsStore });
    const response = await postJson(baseUrl, "/api/v1/setup/openai-key", { key: "sk-valid" });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ valid: true });
    expect(externalFetchMock).toHaveBeenCalledWith("https://api.openai.com/v1/models", {
      headers: { authorization: "Bearer sk-valid" },
    });
    expect(secretsStore.set).toHaveBeenCalledWith("OPENAI_API_KEY", "sk-valid");
  });

  it("rejects an invalid OpenAI key", async () => {
    const secretsStore = createSecretsStoreMock();
    externalFetchMock.mockResolvedValueOnce(textResponse(401, "unauthorized"));

    const { baseUrl } = await startSetupApiServer({ secretsStore });
    const response = await postJson(baseUrl, "/api/v1/setup/openai-key", { key: "sk-invalid" });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ valid: false });
    expect(secretsStore.set).not.toHaveBeenCalled();
  });

  it("returns missing_auth_json when Codex auth payload is missing", async () => {
    const { baseUrl } = await startSetupApiServer();
    const response = await postJson(baseUrl, "/api/v1/setup/codex-auth", {});

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: "missing_auth_json",
        message: "authJson is required",
      },
    });
  });

  it("returns invalid_json when Codex auth payload is not valid JSON", async () => {
    const { baseUrl } = await startSetupApiServer();
    const response = await postJson(baseUrl, "/api/v1/setup/codex-auth", { authJson: "{nope" });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: "invalid_json",
        message: "authJson must be valid JSON",
      },
    });
  });

  it("stores valid Codex auth JSON and updates overlay config", async () => {
    const configOverlayStore = createConfigOverlayStoreMock();
    const authJson = JSON.stringify({ access_token: "token" });
    const { baseUrl } = await startSetupApiServer({ configOverlayStore });

    const response = await postJson(baseUrl, "/api/v1/setup/codex-auth", { authJson });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(mkdirMock).toHaveBeenCalledWith("/archive-root/codex-auth", { recursive: true });
    expect(writeFileMock).toHaveBeenCalledWith("/archive-root/codex-auth/auth.json", authJson, {
      encoding: "utf8",
      mode: 0o600,
    });
    expect(configOverlayStore.set).toHaveBeenNthCalledWith(1, "codex.auth.mode", "openai_login");
    expect(configOverlayStore.set).toHaveBeenNthCalledWith(2, "codex.auth.source_home", "/archive-root/codex-auth");
  });

  it("returns save_error when Codex auth persistence fails", async () => {
    writeFileMock.mockRejectedValueOnce(new Error("write failed"));

    const { baseUrl } = await startSetupApiServer();
    const response = await postJson(baseUrl, "/api/v1/setup/codex-auth", {
      authJson: JSON.stringify({ access_token: "token" }),
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: {
        code: "save_error",
        message: "Error: write failed",
      },
    });
  });
});
