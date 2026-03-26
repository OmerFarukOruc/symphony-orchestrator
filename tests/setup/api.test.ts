import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConfigOverlayStore } from "../../src/config/overlay.js";
import {
  createConfigOverlayStoreMock,
  createOrchestratorMock,
  createSecretsStoreMock,
  getExternalFetchMock,
  type HoistedMocks,
  postJson,
  setupAfterEach,
  setupBeforeEach,
  startSetupApiServer,
} from "./setup-fixtures.js";
import { createJsonResponse as jsonResponse, createTextResponse as textResponse } from "../helpers.js";

/* ── hoisted mocks (must remain in each test file) ─────────────────── */

const mocks: HoistedMocks = vi.hoisted(() => ({
  existsSyncMock: vi.fn<(filePath: string) => boolean>(),
  mkdirMock: vi.fn<(filePath: string, options?: { recursive?: boolean }) => Promise<void>>(),
  writeFileMock:
    vi.fn<(filePath: string, data: string, options?: { encoding?: BufferEncoding; mode?: number }) => Promise<void>>(),
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

vi.mock("node:fs", () => ({ existsSync: mocks.existsSyncMock }));
vi.mock("node:fs/promises", () => ({ mkdir: mocks.mkdirMock, writeFile: mocks.writeFileMock }));
vi.mock("../../src/setup/device-auth.js", () => ({
  startDeviceAuth: mocks.startDeviceAuthMock,
  pollDeviceAuth: mocks.pollDeviceAuthMock,
  saveDeviceAuthTokens: mocks.saveDeviceAuthTokensMock,
}));

beforeEach(() => setupBeforeEach(mocks));
afterEach(setupAfterEach);

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
        repoRoute: { done: false },
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
    mocks.existsSyncMock.mockReturnValue(true);
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
        repoRoute: { done: false },
        openaiKey: { done: true },
        githubToken: { done: true },
      },
    });
    expect(mocks.existsSyncMock).toHaveBeenCalledWith("/archive-root/codex-auth/auth.json");
  });

  it("resets setup state successfully", async () => {
    const secretsStore = createSecretsStoreMock();
    const configOverlayStore = createConfigOverlayStoreMock();
    vi.spyOn(secretsStore, "list").mockReturnValue(["GITHUB_TOKEN", "LINEAR_API_KEY"]);
    process.env.GITHUB_TOKEN = "gh-from-env";

    const { baseUrl } = await startSetupApiServer({ secretsStore, configOverlayStore });
    const response = await postJson(baseUrl, "/api/v1/setup/reset");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(secretsStore.delete).toHaveBeenCalledTimes(2);
    expect(secretsStore.delete).toHaveBeenNthCalledWith(1, "GITHUB_TOKEN");
    expect(secretsStore.delete).toHaveBeenNthCalledWith(2, "LINEAR_API_KEY");
    expect(configOverlayStore.set).toHaveBeenNthCalledWith(1, "codex.auth.mode", "");
    expect(configOverlayStore.set).toHaveBeenNthCalledWith(2, "codex.auth.source_home", "");
    expect(process.env.GITHUB_TOKEN).toBeUndefined();
  });

  it("returns reset_failed when reset throws", async () => {
    const secretsStore = createSecretsStoreMock();
    vi.spyOn(secretsStore, "list").mockReturnValue(["OPENAI_API_KEY"]);
    vi.spyOn(secretsStore, "delete").mockRejectedValue(new Error("delete failed"));

    const { baseUrl } = await startSetupApiServer({ secretsStore });
    const response = await postJson(baseUrl, "/api/v1/setup/reset");

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: { code: "reset_failed", message: "delete failed" },
    });
  });

  it("creates a master key and initializes the secrets store", async () => {
    const secretsStore = createSecretsStoreMock();
    const { baseUrl } = await startSetupApiServer({ secretsStore });

    const response = await postJson(baseUrl, "/api/v1/setup/master-key", {});
    const body = (await response.json()) as { key: string };

    expect(response.status).toBe(200);
    expect(body.key).toMatch(/^[a-f0-9]{64}$/u);
    expect(mocks.writeFileMock).toHaveBeenCalledWith("/archive-root/master.key", body.key, {
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
      error: { code: "already_initialized", message: "Master key is already set" },
    });
  });

  it("returns setup_error when master key persistence fails", async () => {
    mocks.writeFileMock.mockRejectedValueOnce(new Error("disk full"));

    const { baseUrl } = await startSetupApiServer();
    const response = await postJson(baseUrl, "/api/v1/setup/master-key", { key: "provided-key" });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: { code: "setup_error", message: "Error: disk full" },
    });
  });

  it("returns missing_api_key when listing Linear projects without credentials", async () => {
    const { baseUrl } = await startSetupApiServer();
    const response = await fetch(`${baseUrl}/api/v1/setup/linear-projects`);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "missing_api_key", message: "LINEAR_API_KEY not configured" },
    });
  });

  it("lists Linear projects successfully", async () => {
    const secretsStore = createSecretsStoreMock();
    vi.spyOn(secretsStore, "get").mockImplementation((key) => (key === "LINEAR_API_KEY" ? "linear-secret" : null));
    getExternalFetchMock().mockResolvedValueOnce(
      jsonResponse(200, {
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

    const { baseUrl } = await startSetupApiServer({ secretsStore });
    const response = await fetch(`${baseUrl}/api/v1/setup/linear-projects`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      projects: [
        { id: "project-1", name: "Symphony", slugId: "symphony", teamKey: "ENG" },
        { id: "project-2", name: "Platform", slugId: "platform", teamKey: null },
      ],
    });
    expect(getExternalFetchMock()).toHaveBeenCalledWith("https://api.linear.app/graphql", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "linear-secret" },
      body: JSON.stringify({
        query: "{ projects(first: 50) { nodes { id name slugId teams { nodes { key } } } } }",
        variables: {},
      }),
    });
  });

  it("returns linear_api_error when the Linear API responds with a failure status", async () => {
    const secretsStore = createSecretsStoreMock();
    vi.spyOn(secretsStore, "get").mockImplementation((key) => (key === "LINEAR_API_KEY" ? "linear-secret" : null));
    getExternalFetchMock().mockResolvedValueOnce(textResponse(503, "unavailable"));

    const { baseUrl } = await startSetupApiServer({ secretsStore });
    const response = await fetch(`${baseUrl}/api/v1/setup/linear-projects`);

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: { code: "linear_api_error", message: expect.stringContaining("503") },
    });
  });

  it("returns linear_api_error when the Linear API request throws", async () => {
    const secretsStore = createSecretsStoreMock();
    vi.spyOn(secretsStore, "get").mockImplementation((key) => (key === "LINEAR_API_KEY" ? "linear-secret" : null));
    getExternalFetchMock().mockRejectedValueOnce(new Error("network offline"));

    const { baseUrl } = await startSetupApiServer({ secretsStore });
    const response = await fetch(`${baseUrl}/api/v1/setup/linear-projects`);

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: { code: "linear_api_error", message: "Error: network offline" },
    });
  });

  it("returns missing_slug_id when selecting a Linear project without slugId", async () => {
    const { baseUrl } = await startSetupApiServer();
    const response = await postJson(baseUrl, "/api/v1/setup/linear-project", {});

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "missing_slug_id", message: "slugId is required" },
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
      error: { code: "missing_key", message: "key is required" },
    });
  });

  it("validates and stores a valid OpenAI key with CLIProxyAPI provider when no provider exists", async () => {
    const secretsStore = createSecretsStoreMock();
    const configOverlayStore = createConfigOverlayStoreMock();
    getExternalFetchMock().mockResolvedValueOnce(textResponse(200, "ok"));

    const { baseUrl } = await startSetupApiServer({ secretsStore, configOverlayStore });
    const response = await postJson(baseUrl, "/api/v1/setup/openai-key", { key: "sk-valid" });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ valid: true });
    expect(getExternalFetchMock()).toHaveBeenCalledWith("https://api.openai.com/v1/models", {
      headers: { authorization: "Bearer sk-valid" },
    });
    expect(secretsStore.set).toHaveBeenCalledWith("OPENAI_API_KEY", "sk-valid");
    expect(configOverlayStore.set).toHaveBeenCalledWith("codex.auth.mode", "api_key");
    expect(configOverlayStore.set).toHaveBeenCalledWith("codex.provider.name", "CLIProxyAPI");
    expect(configOverlayStore.set).toHaveBeenCalledWith("codex.provider.base_url", "http://localhost:8317/v1");
    expect(configOverlayStore.set).toHaveBeenCalledWith("codex.provider.env_key", "OPENAI_API_KEY");
    expect(configOverlayStore.set).toHaveBeenCalledWith("codex.provider.wire_api", "responses");
  });

  it("preserves custom provider config when saving a valid OpenAI key", async () => {
    const secretsStore = createSecretsStoreMock();
    const configOverlayStore = createConfigOverlayStoreMock();
    vi.spyOn(configOverlayStore, "toMap").mockReturnValue({
      codex: {
        provider: {
          name: "MyCustomProvider",
          base_url: "https://custom-llm.example.com/v1",
          env_key: "CUSTOM_API_KEY",
          wire_api: "chat",
        },
      },
    });
    getExternalFetchMock().mockResolvedValueOnce(textResponse(200, "ok"));

    const { baseUrl } = await startSetupApiServer({ secretsStore, configOverlayStore });
    const response = await postJson(baseUrl, "/api/v1/setup/openai-key", { key: "sk-valid" });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ valid: true });
    expect(secretsStore.set).toHaveBeenCalledWith("OPENAI_API_KEY", "sk-valid");
    expect(configOverlayStore.set).toHaveBeenCalledWith("codex.auth.mode", "api_key");
    expect(configOverlayStore.set).not.toHaveBeenCalledWith("codex.provider.name", expect.anything());
    expect(configOverlayStore.set).not.toHaveBeenCalledWith("codex.provider.base_url", expect.anything());
    expect(configOverlayStore.set).not.toHaveBeenCalledWith("codex.provider.env_key", expect.anything());
    expect(configOverlayStore.set).not.toHaveBeenCalledWith("codex.provider.wire_api", expect.anything());
  });

  it("rejects an invalid OpenAI key", async () => {
    const secretsStore = createSecretsStoreMock();
    getExternalFetchMock().mockResolvedValueOnce(textResponse(401, "unauthorized"));

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
      error: { code: "missing_auth_json", message: "authJson is required" },
    });
  });

  it("returns invalid_json when Codex auth payload is not valid JSON", async () => {
    const { baseUrl } = await startSetupApiServer();
    const response = await postJson(baseUrl, "/api/v1/setup/codex-auth", { authJson: "{nope" });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "invalid_json", message: "authJson must be valid JSON" },
    });
  });

  it("stores valid Codex auth JSON and updates overlay config", async () => {
    const configOverlayStore = createConfigOverlayStoreMock();
    const authJson = JSON.stringify({ access_token: "token", email: "user@example.com" });
    const { baseUrl } = await startSetupApiServer({ configOverlayStore });

    const response = await postJson(baseUrl, "/api/v1/setup/codex-auth", { authJson });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(mocks.mkdirMock).toHaveBeenCalledWith("/archive-root/codex-auth", { recursive: true });
    const writtenJson = JSON.parse(mocks.writeFileMock.mock.calls[0]?.[1] as string);
    expect(mocks.writeFileMock).toHaveBeenCalledWith("/archive-root/codex-auth/auth.json", expect.any(String), {
      encoding: "utf8",
      mode: 0o600,
    });
    expect(writtenJson).toEqual({
      email: "user@example.com",
      auth_mode: "chatgpt",
      last_refresh: expect.any(String),
      tokens: {
        access_token: "token",
        refresh_token: null,
        id_token: null,
        account_id: null,
      },
    });
    expect(configOverlayStore.set).toHaveBeenNthCalledWith(1, "codex.auth.mode", "openai_login");
    expect(configOverlayStore.set).toHaveBeenNthCalledWith(2, "codex.auth.source_home", "/archive-root/codex-auth");
  });

  it("returns save_error when Codex auth persistence fails", async () => {
    mocks.writeFileMock.mockRejectedValueOnce(new Error("write failed"));

    const { baseUrl } = await startSetupApiServer();
    const response = await postJson(baseUrl, "/api/v1/setup/codex-auth", {
      authJson: JSON.stringify({ access_token: "token" }),
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: { code: "save_error", message: "Error: write failed" },
    });
  });
});
