import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
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
  startDeviceAuthMock: vi.fn(),
  pollDeviceAuthMock: vi.fn(),
  saveDeviceAuthTokensMock: vi.fn(),
}));

vi.mock("node:fs", () => ({ existsSync: mocks.existsSyncMock }));
vi.mock("node:fs/promises", () => ({ mkdir: mocks.mkdirMock, writeFile: mocks.writeFileMock }));
vi.mock("../../src/setup/device-auth.js", async () => {
  const actual = (await vi.importActual("../../src/setup/device-auth.js")) as Record<string, unknown>;
  return {
    ...actual,
    startDeviceAuth: mocks.startDeviceAuthMock,
    pollDeviceAuth: mocks.pollDeviceAuthMock,
    saveDeviceAuthTokens: mocks.saveDeviceAuthTokensMock,
    checkAuthEndpointReachable: vi.fn().mockResolvedValue(null),
  };
});

beforeEach(() => setupBeforeEach(mocks));
afterEach(setupAfterEach);

describe("registerSetupApi — auth & tokens", () => {
  it("starts PKCE auth successfully", async () => {
    const { baseUrl } = await startSetupApiServer();
    const response = await postJson(baseUrl, "/api/v1/setup/pkce-auth/start");

    expect(response.status).toBe(200);
    const body = (await response.json()) as { authUrl: string };
    expect(body.authUrl).toBeDefined();
    expect(typeof body.authUrl).toBe("string");
  });

  it("returns PKCE auth status when polled", async () => {
    const { baseUrl } = await startSetupApiServer();
    const response = await fetch(`${baseUrl}/api/v1/setup/pkce-auth/status`);

    expect(response.status).toBe(200);
    const body = (await response.json()) as { status: string };
    expect(["idle", "pending", "complete", "expired", "error"]).toContain(body.status);
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
    delete process.env.GITHUB_TOKEN;

    const { baseUrl } = await startSetupApiServer({ secretsStore });
    const response = await postJson(baseUrl, "/api/v1/setup/github-token", { token: "ghp_valid" });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ valid: true });
    expect(getExternalFetchMock()).toHaveBeenCalledWith("https://api.github.com/user", {
      headers: { authorization: "token ghp_valid", "user-agent": "Symphony-Orchestrator" },
    });
    expect(secretsStore.set).toHaveBeenCalledWith("GITHUB_TOKEN", "ghp_valid");
    expect(process.env.GITHUB_TOKEN).toBe("ghp_valid");
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
    "/api/v1/setup/pkce-auth/start",
    "/api/v1/setup/pkce-auth/status",
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
