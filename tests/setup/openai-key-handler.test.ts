import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createConfigOverlayStoreMock,
  createSecretsStoreMock,
  getExternalFetchMock,
  type HoistedMocks,
  postJson,
  setupAfterEach,
  setupBeforeEach,
  startSetupApiServer,
} from "./setup-fixtures.js";
import { createTextResponse } from "../helpers.js";

/* ── hoisted mocks ───────────────────────────────────────────────── */

const mocks = vi.hoisted(() => ({
  existsSyncMock: vi.fn<(filePath: string) => boolean>(),
  mkdirMock: vi.fn<(filePath: string, options?: { recursive?: boolean }) => Promise<void>>(),
  writeFileMock:
    vi.fn<(filePath: string, data: string, options?: { encoding?: BufferEncoding; mode?: number }) => Promise<void>>(),
  startDeviceAuthMock: vi.fn(),
  pollDeviceAuthMock: vi.fn(),
  saveDeviceAuthTokensMock: vi.fn(),
})) satisfies HoistedMocks;

vi.mock("node:fs", () => ({ existsSync: mocks.existsSyncMock }));
vi.mock("node:fs/promises", () => ({ mkdir: mocks.mkdirMock, writeFile: mocks.writeFileMock }));
vi.mock("../../src/setup/device-auth.js", () => ({
  startDeviceAuth: mocks.startDeviceAuthMock,
  pollDeviceAuth: mocks.pollDeviceAuthMock,
  saveDeviceAuthTokens: mocks.saveDeviceAuthTokensMock,
  checkAuthEndpointReachable: vi.fn().mockResolvedValue(null),
  createPkceSession: vi.fn(),
  startCallbackServer: vi.fn(),
  shutdownCallbackServer: vi.fn(),
  exchangePkceCode: vi.fn(),
  savePkceAuthTokens: vi.fn(),
}));

beforeEach(() => setupBeforeEach(mocks));
afterEach(setupAfterEach);

/* ── Tests ────────────────────────────────────────────────────────── */

describe("POST /api/v1/setup/openai-key", () => {
  it("returns 400 when key is missing from body", async () => {
    const { baseUrl } = await startSetupApiServer();
    const response = await postJson(baseUrl, "/api/v1/setup/openai-key", {});

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "missing_key", message: "key is required" },
    });
  });

  it("returns 400 when key is not a string", async () => {
    const { baseUrl } = await startSetupApiServer();
    const response = await postJson(baseUrl, "/api/v1/setup/openai-key", { key: 99 });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "missing_key", message: "key is required" },
    });
  });

  it("validates and stores a valid OpenAI key with default provider config", async () => {
    const secretsStore = createSecretsStoreMock();
    const configOverlayStore = createConfigOverlayStoreMock();
    getExternalFetchMock().mockResolvedValueOnce(createTextResponse(200, "ok"));

    const { baseUrl } = await startSetupApiServer({ secretsStore, configOverlayStore });
    const response = await postJson(baseUrl, "/api/v1/setup/openai-key", { key: "sk-valid123" });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ valid: true });

    // Verify fetch was called against OpenAI models endpoint
    expect(getExternalFetchMock()).toHaveBeenCalledWith("https://api.openai.com/v1/models", {
      headers: { authorization: "Bearer sk-valid123" },
    });

    // Verify secrets stored
    expect(secretsStore.set).toHaveBeenCalledWith("OPENAI_API_KEY", "sk-valid123");

    // Verify auth mode set
    expect(configOverlayStore.set).toHaveBeenCalledWith("codex.auth.mode", "api_key");

    // Verify default provider config was set (no custom provider exists)
    expect(configOverlayStore.set).toHaveBeenCalledWith("codex.provider.name", "CLIProxyAPI");
    expect(configOverlayStore.set).toHaveBeenCalledWith("codex.provider.base_url", "http://localhost:8317/v1");
    expect(configOverlayStore.set).toHaveBeenCalledWith("codex.provider.env_key", "OPENAI_API_KEY");
    expect(configOverlayStore.set).toHaveBeenCalledWith("codex.provider.wire_api", "responses");
  });

  it("skips default provider config when a custom provider already exists", async () => {
    const secretsStore = createSecretsStoreMock();
    const configOverlayStore = createConfigOverlayStoreMock();
    // Make toMap() return an overlay with a custom provider name
    vi.spyOn(configOverlayStore, "toMap").mockReturnValue({
      codex: { provider: { name: "CustomProvider", base_url: "https://custom.example.com" } },
    });
    getExternalFetchMock().mockResolvedValueOnce(createTextResponse(200, "ok"));

    const { baseUrl } = await startSetupApiServer({ secretsStore, configOverlayStore });
    const response = await postJson(baseUrl, "/api/v1/setup/openai-key", { key: "sk-valid456" });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ valid: true });

    // Verify secrets stored and auth mode set
    expect(secretsStore.set).toHaveBeenCalledWith("OPENAI_API_KEY", "sk-valid456");
    expect(configOverlayStore.set).toHaveBeenCalledWith("codex.auth.mode", "api_key");

    // Verify provider config was NOT set (custom provider preserved)
    expect(configOverlayStore.set).not.toHaveBeenCalledWith("codex.provider.name", expect.any(String));
    expect(configOverlayStore.set).not.toHaveBeenCalledWith("codex.provider.base_url", expect.any(String));
  });

  it("returns valid=false and does not store when OpenAI API rejects the key", async () => {
    const secretsStore = createSecretsStoreMock();
    const configOverlayStore = createConfigOverlayStoreMock();
    getExternalFetchMock().mockResolvedValueOnce(createTextResponse(401, "Unauthorized"));

    const { baseUrl } = await startSetupApiServer({ secretsStore, configOverlayStore });
    const response = await postJson(baseUrl, "/api/v1/setup/openai-key", { key: "sk-invalid" });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ valid: false });
    expect(secretsStore.set).not.toHaveBeenCalled();
    expect(configOverlayStore.set).not.toHaveBeenCalled();
  });

  it("returns valid=false on network failure during validation", async () => {
    const secretsStore = createSecretsStoreMock();
    getExternalFetchMock().mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const { baseUrl } = await startSetupApiServer({ secretsStore });
    const response = await postJson(baseUrl, "/api/v1/setup/openai-key", { key: "sk-neterror" });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ valid: false });
    expect(secretsStore.set).not.toHaveBeenCalled();
  });

  it("returns 400 when body is empty", async () => {
    const { baseUrl } = await startSetupApiServer();
    const response = await postJson(baseUrl, "/api/v1/setup/openai-key", undefined);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "missing_key", message: "key is required" },
    });
  });
});
