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

describe("POST /api/v1/setup/github-token", () => {
  it("returns 400 when token is missing from body", async () => {
    const { baseUrl } = await startSetupApiServer();
    const response = await postJson(baseUrl, "/api/v1/setup/github-token", {});

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "missing_token", message: "token is required" },
    });
  });

  it("returns 400 when token is not a string", async () => {
    const { baseUrl } = await startSetupApiServer();
    const response = await postJson(baseUrl, "/api/v1/setup/github-token", { token: 12345 });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "missing_token", message: "token is required" },
    });
  });

  it("validates and stores a valid GitHub token", async () => {
    const secretsStore = createSecretsStoreMock();
    getExternalFetchMock().mockResolvedValueOnce(createTextResponse(200, "ok"));

    const { baseUrl } = await startSetupApiServer({ secretsStore });
    const response = await postJson(baseUrl, "/api/v1/setup/github-token", { token: "ghp_validtoken" });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ valid: true });
    expect(getExternalFetchMock()).toHaveBeenCalledWith("https://api.github.com/user", {
      headers: { authorization: "token ghp_validtoken", "user-agent": "Risoluto" },
    });
    expect(secretsStore.set).toHaveBeenCalledWith("GITHUB_TOKEN", "ghp_validtoken");
  });

  it("returns valid=false and does not store when GitHub API rejects the token", async () => {
    const secretsStore = createSecretsStoreMock();
    getExternalFetchMock().mockResolvedValueOnce(createTextResponse(401, "Bad credentials"));

    const { baseUrl } = await startSetupApiServer({ secretsStore });
    const response = await postJson(baseUrl, "/api/v1/setup/github-token", { token: "ghp_badtoken" });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ valid: false });
    expect(secretsStore.set).not.toHaveBeenCalled();
  });

  it("returns valid=false when GitHub API returns 403 (rate limited / forbidden)", async () => {
    const secretsStore = createSecretsStoreMock();
    getExternalFetchMock().mockResolvedValueOnce(createTextResponse(403, "Forbidden"));

    const { baseUrl } = await startSetupApiServer({ secretsStore });
    const response = await postJson(baseUrl, "/api/v1/setup/github-token", { token: "ghp_ratelimited" });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ valid: false });
    expect(secretsStore.set).not.toHaveBeenCalled();
  });

  it("returns valid=false on network failure during validation", async () => {
    const secretsStore = createSecretsStoreMock();
    getExternalFetchMock().mockRejectedValueOnce(new Error("fetch failed: ECONNREFUSED"));

    const { baseUrl } = await startSetupApiServer({ secretsStore });
    const response = await postJson(baseUrl, "/api/v1/setup/github-token", { token: "ghp_neterror" });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ valid: false });
    expect(secretsStore.set).not.toHaveBeenCalled();
  });

  it("returns 400 when body is empty", async () => {
    const { baseUrl } = await startSetupApiServer();
    const response = await postJson(baseUrl, "/api/v1/setup/github-token", undefined);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "missing_token", message: "token is required" },
    });
  });
});
