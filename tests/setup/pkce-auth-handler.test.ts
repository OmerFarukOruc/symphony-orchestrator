import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PkceSession } from "../../src/setup/device-auth.js";
import {
  createConfigOverlayStoreMock,
  type HoistedMocks,
  postJson,
  setupAfterEach,
  setupBeforeEach,
  startSetupApiServer,
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

const deviceAuthMocks = vi.hoisted(() => ({
  checkAuthEndpointReachable: vi.fn<() => Promise<string | null>>(),
  createPkceSession: vi.fn<() => PkceSession>(),
  startCallbackServer: vi.fn<(session: PkceSession) => Promise<void>>(),
  shutdownCallbackServer: vi.fn<(session: PkceSession) => void>(),
  exchangePkceCode: vi.fn<(code: string, verifier: string, redirectUri: string) => Promise<unknown>>(),
  savePkceAuthTokens: vi.fn<(tokenData: unknown, archiveDir: string, overlay: unknown) => Promise<void>>(),
}));

vi.mock("node:fs", () => ({ existsSync: mocks.existsSyncMock }));
vi.mock("node:fs/promises", () => ({ mkdir: mocks.mkdirMock, writeFile: mocks.writeFileMock }));
vi.mock("../../src/setup/device-auth.js", () => ({
  startDeviceAuth: mocks.startDeviceAuthMock,
  pollDeviceAuth: mocks.pollDeviceAuthMock,
  saveDeviceAuthTokens: mocks.saveDeviceAuthTokensMock,
  checkAuthEndpointReachable: deviceAuthMocks.checkAuthEndpointReachable,
  createPkceSession: deviceAuthMocks.createPkceSession,
  startCallbackServer: deviceAuthMocks.startCallbackServer,
  shutdownCallbackServer: deviceAuthMocks.shutdownCallbackServer,
  exchangePkceCode: deviceAuthMocks.exchangePkceCode,
  savePkceAuthTokens: deviceAuthMocks.savePkceAuthTokens,
}));

/* ── Helpers ──────────────────────────────────────────────────────── */

function makeFakeSession(overrides: Partial<PkceSession> = {}): PkceSession {
  return {
    codeVerifier: "verifier_abc",
    state: "state_xyz",
    authUrl: "https://auth.openai.com/oauth/authorize?state=state_xyz",
    redirectUri: "http://localhost:1455/auth/callback",
    createdAt: Date.now(),
    authCode: null,
    error: null,
    complete: false,
    callbackServer: null,
    ...overrides,
  };
}

beforeEach(() => {
  setupBeforeEach(mocks);
  deviceAuthMocks.checkAuthEndpointReachable.mockReset();
  deviceAuthMocks.createPkceSession.mockReset();
  deviceAuthMocks.startCallbackServer.mockReset();
  deviceAuthMocks.shutdownCallbackServer.mockReset();
  deviceAuthMocks.exchangePkceCode.mockReset();
  deviceAuthMocks.savePkceAuthTokens.mockReset();

  // Default: auth endpoint reachable
  deviceAuthMocks.checkAuthEndpointReachable.mockResolvedValue(null);
});
afterEach(setupAfterEach);

/* ── Tests ────────────────────────────────────────────────────────── */

describe("POST /api/v1/setup/pkce-auth/start", () => {
  it("starts a new PKCE session and returns the auth URL", async () => {
    const session = makeFakeSession();
    deviceAuthMocks.createPkceSession.mockReturnValue(session);
    deviceAuthMocks.startCallbackServer.mockResolvedValue(undefined);

    const { baseUrl } = await startSetupApiServer();
    const response = await postJson(baseUrl, "/api/v1/setup/pkce-auth/start");

    expect(response.status).toBe(200);
    const body = (await response.json()) as { authUrl: string };
    expect(body.authUrl).toBe(session.authUrl);
    expect(deviceAuthMocks.createPkceSession).toHaveBeenCalledOnce();
    expect(deviceAuthMocks.startCallbackServer).toHaveBeenCalledWith(session);
  });

  it("returns 502 when auth endpoint is unreachable", async () => {
    deviceAuthMocks.checkAuthEndpointReachable.mockResolvedValue("Cannot reach auth.openai.com");

    const { baseUrl } = await startSetupApiServer();
    const response = await postJson(baseUrl, "/api/v1/setup/pkce-auth/start");

    expect(response.status).toBe(502);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("auth_unreachable");
    expect(body.error.message).toBe("Cannot reach auth.openai.com");
    expect(deviceAuthMocks.createPkceSession).not.toHaveBeenCalled();
  });

  it("shuts down a previous session before starting a new one", async () => {
    const firstSession = makeFakeSession();
    const secondSession = makeFakeSession({ state: "state_new" });

    deviceAuthMocks.createPkceSession.mockReturnValueOnce(firstSession).mockReturnValueOnce(secondSession);
    deviceAuthMocks.startCallbackServer.mockResolvedValue(undefined);

    const { baseUrl } = await startSetupApiServer();

    // Start first session
    await postJson(baseUrl, "/api/v1/setup/pkce-auth/start");

    // Start second session — should shut down the first
    const response = await postJson(baseUrl, "/api/v1/setup/pkce-auth/start");

    expect(response.status).toBe(200);
    expect(deviceAuthMocks.shutdownCallbackServer).toHaveBeenCalledWith(firstSession);
  });

  it("returns 500 when startCallbackServer throws", async () => {
    const session = makeFakeSession();
    deviceAuthMocks.createPkceSession.mockReturnValue(session);
    deviceAuthMocks.startCallbackServer.mockRejectedValue(new Error("EADDRINUSE"));

    const { baseUrl } = await startSetupApiServer();
    const response = await postJson(baseUrl, "/api/v1/setup/pkce-auth/start");

    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("pkce_start_error");
    expect(body.error.message).toContain("EADDRINUSE");
  });

  it("returns session error message if available when start fails", async () => {
    const session = makeFakeSession({ error: "Port 1455 is already in use" });
    deviceAuthMocks.createPkceSession.mockReturnValue(session);
    deviceAuthMocks.startCallbackServer.mockRejectedValue(new Error("EADDRINUSE"));

    const { baseUrl } = await startSetupApiServer();
    const response = await postJson(baseUrl, "/api/v1/setup/pkce-auth/start");

    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.message).toBe("Port 1455 is already in use");
  });
});

describe("GET /api/v1/setup/pkce-auth/status", () => {
  it("returns idle when no session is active", async () => {
    const { baseUrl } = await startSetupApiServer();

    // Cancel any lingering session first (module-level state)
    await postJson(baseUrl, "/api/v1/setup/pkce-auth/cancel");

    const response = await fetch(`${baseUrl}/api/v1/setup/pkce-auth/status`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "idle" });
  });

  it("returns pending when session is waiting for auth code", async () => {
    const session = makeFakeSession();
    deviceAuthMocks.createPkceSession.mockReturnValue(session);
    deviceAuthMocks.startCallbackServer.mockResolvedValue(undefined);

    const { baseUrl } = await startSetupApiServer();
    await postJson(baseUrl, "/api/v1/setup/pkce-auth/start");

    const response = await fetch(`${baseUrl}/api/v1/setup/pkce-auth/status`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "pending" });
  });

  it("returns error when session has an error", async () => {
    const session = makeFakeSession({ error: "Something went wrong" });
    deviceAuthMocks.createPkceSession.mockReturnValue(session);
    deviceAuthMocks.startCallbackServer.mockResolvedValue(undefined);

    const { baseUrl } = await startSetupApiServer();
    await postJson(baseUrl, "/api/v1/setup/pkce-auth/start");

    const response = await fetch(`${baseUrl}/api/v1/setup/pkce-auth/status`);

    expect(response.status).toBe(200);
    const body = (await response.json()) as { status: string; error: string };
    expect(body.status).toBe("error");
    expect(body.error).toBe("Something went wrong");
    expect(deviceAuthMocks.shutdownCallbackServer).toHaveBeenCalled();
  });

  it("returns complete when session is already complete", async () => {
    const session = makeFakeSession({ complete: true });
    deviceAuthMocks.createPkceSession.mockReturnValue(session);
    deviceAuthMocks.startCallbackServer.mockResolvedValue(undefined);

    const { baseUrl } = await startSetupApiServer();
    await postJson(baseUrl, "/api/v1/setup/pkce-auth/start");

    const response = await fetch(`${baseUrl}/api/v1/setup/pkce-auth/status`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "complete" });
  });

  it("exchanges auth code and returns complete on success", async () => {
    const session = makeFakeSession({ authCode: "code_abc" });
    const tokenData = { access_token: "at_123", token_type: "bearer", expires_in: 3600 };
    deviceAuthMocks.createPkceSession.mockReturnValue(session);
    deviceAuthMocks.startCallbackServer.mockResolvedValue(undefined);
    deviceAuthMocks.exchangePkceCode.mockResolvedValue(tokenData);
    deviceAuthMocks.savePkceAuthTokens.mockResolvedValue(undefined);

    const configOverlayStore = createConfigOverlayStoreMock();
    const { baseUrl } = await startSetupApiServer({
      configOverlayStore,
      archiveDir: "/test-archive",
    });
    await postJson(baseUrl, "/api/v1/setup/pkce-auth/start");

    const response = await fetch(`${baseUrl}/api/v1/setup/pkce-auth/status`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "complete" });
    expect(deviceAuthMocks.exchangePkceCode).toHaveBeenCalledWith(
      "code_abc",
      session.codeVerifier,
      session.redirectUri,
    );
    expect(deviceAuthMocks.savePkceAuthTokens).toHaveBeenCalledWith(tokenData, "/test-archive", configOverlayStore);
    expect(deviceAuthMocks.shutdownCallbackServer).toHaveBeenCalledWith(session);
  });

  it("returns error when token exchange fails", async () => {
    const session = makeFakeSession({ authCode: "code_bad" });
    deviceAuthMocks.createPkceSession.mockReturnValue(session);
    deviceAuthMocks.startCallbackServer.mockResolvedValue(undefined);
    deviceAuthMocks.exchangePkceCode.mockRejectedValue(new Error("Token exchange failed (400)"));

    const { baseUrl } = await startSetupApiServer();
    await postJson(baseUrl, "/api/v1/setup/pkce-auth/start");

    const response = await fetch(`${baseUrl}/api/v1/setup/pkce-auth/status`);

    expect(response.status).toBe(200);
    const body = (await response.json()) as { status: string; error: string };
    expect(body.status).toBe("error");
    expect(body.error).toContain("Token exchange failed");
    expect(deviceAuthMocks.shutdownCallbackServer).toHaveBeenCalledWith(session);
  });

  it("returns expired when session exceeds 3-minute timeout", async () => {
    vi.useFakeTimers();
    try {
      const now = Date.now();
      // Session created "4 minutes ago"
      const session = makeFakeSession({ createdAt: now - 4 * 60 * 1000 });
      deviceAuthMocks.createPkceSession.mockReturnValue(session);
      deviceAuthMocks.startCallbackServer.mockResolvedValue(undefined);

      const { baseUrl } = await startSetupApiServer();
      await postJson(baseUrl, "/api/v1/setup/pkce-auth/start");

      const response = await fetch(`${baseUrl}/api/v1/setup/pkce-auth/status`);

      expect(response.status).toBe(200);
      const body = (await response.json()) as { status: string; error: string };
      expect(body.status).toBe("expired");
      expect(body.error).toContain("timed out");
      expect(deviceAuthMocks.shutdownCallbackServer).toHaveBeenCalledWith(session);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("POST /api/v1/setup/pkce-auth/cancel", () => {
  it("cancels an active session and returns ok", async () => {
    const session = makeFakeSession();
    deviceAuthMocks.createPkceSession.mockReturnValue(session);
    deviceAuthMocks.startCallbackServer.mockResolvedValue(undefined);

    const { baseUrl } = await startSetupApiServer();
    await postJson(baseUrl, "/api/v1/setup/pkce-auth/start");

    const response = await postJson(baseUrl, "/api/v1/setup/pkce-auth/cancel");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(deviceAuthMocks.shutdownCallbackServer).toHaveBeenCalledWith(session);
  });

  it("returns ok even when no session is active", async () => {
    const { baseUrl } = await startSetupApiServer();

    // Cancel without starting — should still succeed
    const response = await postJson(baseUrl, "/api/v1/setup/pkce-auth/cancel");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("makes subsequent status poll return idle", async () => {
    const session = makeFakeSession();
    deviceAuthMocks.createPkceSession.mockReturnValue(session);
    deviceAuthMocks.startCallbackServer.mockResolvedValue(undefined);

    const { baseUrl } = await startSetupApiServer();
    await postJson(baseUrl, "/api/v1/setup/pkce-auth/start");

    // Cancel
    await postJson(baseUrl, "/api/v1/setup/pkce-auth/cancel");

    // Status should now be idle
    const statusResponse = await fetch(`${baseUrl}/api/v1/setup/pkce-auth/status`);
    expect(statusResponse.status).toBe(200);
    expect(await statusResponse.json()).toEqual({ status: "idle" });
  });
});
