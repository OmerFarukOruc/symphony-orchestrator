import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createConfigOverlayStoreMock,
  type HoistedMocks,
  setupAfterEach,
  setupBeforeEach,
  startSetupApiServer,
  postJson,
} from "./setup-fixtures.js";

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

describe("POST /api/v1/setup/codex-auth", () => {
  it("writes auth file and updates config overlay on valid JSON", async () => {
    const configOverlayStore = createConfigOverlayStoreMock();
    const { baseUrl } = await startSetupApiServer({ configOverlayStore, archiveDir: "/test-archive" });

    const authPayload = JSON.stringify({ access_token: "tok_abc", refresh_token: "ref_123" });
    const response = await postJson(baseUrl, "/api/v1/setup/codex-auth", { authJson: authPayload });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });

    // Verify mkdir was called for the codex-auth directory
    expect(mocks.mkdirMock).toHaveBeenCalledWith("/test-archive/codex-auth", { recursive: true });

    // Verify writeFile was called with the normalized JSON
    expect(mocks.writeFileMock).toHaveBeenCalledWith("/test-archive/codex-auth/auth.json", expect.any(String), {
      encoding: "utf8",
      mode: 0o600,
    });

    // Verify config overlay was updated
    expect(configOverlayStore.set).toHaveBeenCalledWith("codex.auth.mode", "openai_login");
    expect(configOverlayStore.set).toHaveBeenCalledWith("codex.auth.source_home", "/test-archive/codex-auth");
    expect(configOverlayStore.delete).toHaveBeenCalledWith("codex.provider");
  });

  it("returns 400 when authJson is missing from body", async () => {
    const { baseUrl } = await startSetupApiServer();
    const response = await postJson(baseUrl, "/api/v1/setup/codex-auth", {});

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "missing_auth_json", message: "authJson is required" },
    });
  });

  it("returns 400 when authJson is not a string", async () => {
    const { baseUrl } = await startSetupApiServer();
    const response = await postJson(baseUrl, "/api/v1/setup/codex-auth", { authJson: 42 });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "missing_auth_json", message: "authJson is required" },
    });
  });

  it("returns 400 when authJson is not valid JSON", async () => {
    const { baseUrl } = await startSetupApiServer();
    const response = await postJson(baseUrl, "/api/v1/setup/codex-auth", { authJson: "not-json{" });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "invalid_json", message: "authJson must be valid JSON" },
    });
  });

  it("returns 500 when mkdir fails", async () => {
    mocks.mkdirMock.mockRejectedValueOnce(new Error("EACCES: permission denied"));

    const { baseUrl } = await startSetupApiServer();
    const authPayload = JSON.stringify({ access_token: "tok_abc" });
    const response = await postJson(baseUrl, "/api/v1/setup/codex-auth", { authJson: authPayload });

    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("save_error");
    expect(body.error.message).toContain("EACCES");
  });

  it("returns 500 when writeFile fails", async () => {
    mocks.writeFileMock.mockRejectedValueOnce(new Error("ENOSPC: no space left"));

    const { baseUrl } = await startSetupApiServer();
    const authPayload = JSON.stringify({ access_token: "tok_abc" });
    const response = await postJson(baseUrl, "/api/v1/setup/codex-auth", { authJson: authPayload });

    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("save_error");
    expect(body.error.message).toContain("ENOSPC");
  });

  it("normalizes the auth JSON before writing", async () => {
    const { baseUrl } = await startSetupApiServer({ archiveDir: "/test-archive" });

    // Send flat token format that normalizeCodexAuthJson should restructure
    const authPayload = JSON.stringify({
      access_token: "tok_abc",
      refresh_token: "ref_123",
      auth_mode: "chatgpt",
    });
    const response = await postJson(baseUrl, "/api/v1/setup/codex-auth", { authJson: authPayload });

    expect(response.status).toBe(200);

    // The written JSON should be normalized (tokens nested under "tokens" key)
    const writtenJson = mocks.writeFileMock.mock.calls[0]?.[1] as string;
    const parsed = JSON.parse(writtenJson) as Record<string, unknown>;
    expect(parsed).toHaveProperty("tokens");
    expect(parsed).toHaveProperty("auth_mode", "chatgpt");
  });
});
