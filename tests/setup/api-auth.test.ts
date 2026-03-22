import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConfigOverlayStore } from "../../src/config/overlay.js";
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
import { createTextResponse as textResponse } from "../helpers.js";

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

describe("registerSetupApi — device auth & tokens", () => {
  it("starts device auth successfully", async () => {
    mocks.startDeviceAuthMock.mockResolvedValueOnce({
      user_code: "ABCD-EFGH",
      verification_uri: "https://example.com/device",
      verification_uri_complete: "https://example.com/device?user_code=ABCD-EFGH",
      device_code: "device-123",
      expires_in: 900,
      interval: 5,
    });

    const { baseUrl } = await startSetupApiServer();
    const response = await postJson(baseUrl, "/api/v1/setup/device-auth/start");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      userCode: "ABCD-EFGH",
      verificationUri: "https://example.com/device?user_code=ABCD-EFGH",
      deviceCode: "device-123",
      expiresIn: 900,
      interval: 5,
    });
  });

  it("returns device_auth_error when starting device auth fails", async () => {
    mocks.startDeviceAuthMock.mockRejectedValueOnce(new Error("oauth offline"));

    const { baseUrl } = await startSetupApiServer();
    const response = await postJson(baseUrl, "/api/v1/setup/device-auth/start");

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: { code: "device_auth_error", message: "Error: oauth offline" },
    });
  });

  it("returns missing_device_code when polling without a device code", async () => {
    const { baseUrl } = await startSetupApiServer();
    const response = await postJson(baseUrl, "/api/v1/setup/device-auth/poll", {});

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "missing_device_code", message: "deviceCode is required" },
    });
  });

  it("returns pending while device auth is still waiting for approval", async () => {
    mocks.pollDeviceAuthMock.mockResolvedValueOnce({ status: "pending" });

    const { baseUrl } = await startSetupApiServer();
    const response = await postJson(baseUrl, "/api/v1/setup/device-auth/poll", { deviceCode: "device-123" });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "pending" });
    expect(mocks.saveDeviceAuthTokensMock).not.toHaveBeenCalled();
  });

  it("completes device auth and saves tokens", async () => {
    const configOverlayStore = createConfigOverlayStoreMock();
    mocks.pollDeviceAuthMock.mockResolvedValueOnce({ status: "complete" });
    mocks.saveDeviceAuthTokensMock.mockResolvedValueOnce({ ok: true });

    const { baseUrl } = await startSetupApiServer({ configOverlayStore, archiveDir: "/test-archive" });
    const response = await postJson(baseUrl, "/api/v1/setup/device-auth/poll", { deviceCode: "device-123" });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "complete" });
    expect(mocks.saveDeviceAuthTokensMock).toHaveBeenCalledWith("device-123", "/test-archive", configOverlayStore);
  });

  it("returns an error payload when saving completed device auth tokens fails", async () => {
    mocks.pollDeviceAuthMock.mockResolvedValueOnce({ status: "complete" });
    mocks.saveDeviceAuthTokensMock.mockResolvedValueOnce({ ok: false, error: "token save failed" });

    const { baseUrl } = await startSetupApiServer();
    const response = await postJson(baseUrl, "/api/v1/setup/device-auth/poll", { deviceCode: "device-123" });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "error", error: "token save failed" });
  });

  it("returns expired when device auth expires", async () => {
    mocks.pollDeviceAuthMock.mockResolvedValueOnce({
      status: "expired",
      error: "Device code expired. Please start again.",
    });

    const { baseUrl } = await startSetupApiServer();
    const response = await postJson(baseUrl, "/api/v1/setup/device-auth/poll", { deviceCode: "device-123" });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "expired",
      error: "Device code expired. Please start again.",
    });
  });

  it("returns poll_error when device auth polling throws", async () => {
    mocks.pollDeviceAuthMock.mockRejectedValueOnce(new Error("poll failed"));

    const { baseUrl } = await startSetupApiServer();
    const response = await postJson(baseUrl, "/api/v1/setup/device-auth/poll", { deviceCode: "device-123" });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: { code: "poll_error", message: "Error: poll failed" },
    });
  });

  it("returns missing_token when GitHub token is missing", async () => {
    const { baseUrl } = await startSetupApiServer();
    const response = await postJson(baseUrl, "/api/v1/setup/github-token", {});

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "missing_token", message: "token is required" },
    });
  });

  it("validates and stores a valid GitHub token", async () => {
    const secretsStore = createSecretsStoreMock();
    getExternalFetchMock().mockResolvedValueOnce(textResponse(200, "ok"));

    const { baseUrl } = await startSetupApiServer({ secretsStore });
    const response = await postJson(baseUrl, "/api/v1/setup/github-token", { token: "ghp_valid" });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ valid: true });
    expect(getExternalFetchMock()).toHaveBeenCalledWith("https://api.github.com/user", {
      headers: { authorization: "token ghp_valid", "user-agent": "Symphony-Orchestrator" },
    });
    expect(secretsStore.set).toHaveBeenCalledWith("GITHUB_TOKEN", "ghp_valid");
  });

  it("rejects an invalid GitHub token", async () => {
    const secretsStore = createSecretsStoreMock();
    getExternalFetchMock().mockResolvedValueOnce(textResponse(401, "unauthorized"));

    const { baseUrl } = await startSetupApiServer({ secretsStore });
    const response = await postJson(baseUrl, "/api/v1/setup/github-token", { token: "ghp_invalid" });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ valid: false });
    expect(secretsStore.set).not.toHaveBeenCalled();
  });

  it.each([
    "/api/v1/setup/status",
    "/api/v1/setup/reset",
    "/api/v1/setup/master-key",
    "/api/v1/setup/linear-projects",
    "/api/v1/setup/linear-project",
    "/api/v1/setup/openai-key",
    "/api/v1/setup/codex-auth",
    "/api/v1/setup/device-auth/start",
    "/api/v1/setup/device-auth/poll",
    "/api/v1/setup/github-token",
  ])("returns 405 for unsupported methods on %s", async (route) => {
    const { baseUrl } = await startSetupApiServer();
    const response = await fetch(`${baseUrl}${route}`, { method: "PUT" });

    expect(response.status).toBe(405);
    expect(await response.json()).toEqual({
      error: { code: "method_not_allowed", message: "Method Not Allowed" },
    });
  });
});
