import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn(),
  writeFile: vi.fn(),
}));

import { mkdir, writeFile } from "node:fs/promises";

import { ConfigOverlayStore } from "../../src/config/overlay.js";
import { pollDeviceAuth, saveDeviceAuthTokens, startDeviceAuth } from "../../src/setup/device-auth.js";
import { createMockLogger } from "../helpers.js";

const mockedMkdir = vi.mocked(mkdir);
const mockedWriteFile = vi.mocked(writeFile);

function createOverlayStore() {
  const store = new ConfigOverlayStore("/tmp/test-overlay.json", createMockLogger());
  const setMock = vi.spyOn(store, "set").mockResolvedValue(true);
  return { store, setMock };
}

function createFetchMock() {
  const fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function getSingleRequestInit(fetchMock: ReturnType<typeof createFetchMock>): RequestInit {
  const init = fetchMock.mock.calls[0]?.[1];
  if (!init) {
    throw new Error("Expected fetch to be called with request init");
  }
  return init;
}

function getBodyString(init: RequestInit): string {
  if (typeof init.body !== "string") {
    throw new TypeError("Expected request body to be a string");
  }
  return init.body;
}

describe("device auth helpers", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedMkdir.mockResolvedValue(undefined);
    mockedWriteFile.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("startDeviceAuth returns the device code payload on success", async () => {
    const fetchMock = createFetchMock();
    const payload = {
      device_code: "device-code-123",
      user_code: "USER-CODE",
      verification_uri: "https://auth.openai.com/activate",
      verification_uri_complete: "https://auth.openai.com/activate?user_code=USER-CODE",
      expires_in: 600,
      interval: 5,
    };

    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(startDeviceAuth()).resolves.toEqual(payload);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://auth0.openai.com/oauth/device/code",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
      }),
    );

    const requestInit = getSingleRequestInit(fetchMock);
    expect(getBodyString(requestInit)).toBe(
      new URLSearchParams({
        client_id: "app_EMoamEEZ73f0CkXaXp7hrann",
        scope: "openid profile email offline_access",
      }).toString(),
    );
  });

  it("startDeviceAuth throws with response text on non-ok responses", async () => {
    const fetchMock = createFetchMock();

    fetchMock.mockResolvedValue(new Response("invalid request", { status: 400 }));

    await expect(startDeviceAuth()).rejects.toThrow("Device auth request failed (400): invalid request");
  });

  it("pollDeviceAuth returns complete when token polling succeeds", async () => {
    const fetchMock = createFetchMock();
    const tokenData = {
      access_token: "access-token",
      refresh_token: "refresh-token",
      id_token: "id-token",
      token_type: "Bearer",
      expires_in: 3600,
    };

    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(tokenData), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const result = await pollDeviceAuth("device-code-123");

    expect(result).toEqual(
      expect.objectContaining({
        status: "complete",
        error: undefined,
        tokenData,
      }),
    );

    const requestInit = getSingleRequestInit(fetchMock);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://auth0.openai.com/oauth/token",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
      }),
    );
    expect(getBodyString(requestInit)).toBe(
      new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        client_id: "app_EMoamEEZ73f0CkXaXp7hrann",
        device_code: "device-code-123",
      }).toString(),
    );
  });

  it("pollDeviceAuth returns pending for authorization_pending", async () => {
    const fetchMock = createFetchMock();

    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "authorization_pending" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(pollDeviceAuth("device-code-123")).resolves.toEqual({ status: "pending" });
  });

  it("pollDeviceAuth returns pending for slow_down", async () => {
    const fetchMock = createFetchMock();

    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "slow_down" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(pollDeviceAuth("device-code-123")).resolves.toEqual({ status: "pending" });
  });

  it("pollDeviceAuth returns expired with a restart message for expired_token", async () => {
    const fetchMock = createFetchMock();

    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "expired_token" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(pollDeviceAuth("device-code-123")).resolves.toEqual({
      status: "expired",
      error: "Device code expired. Please start again.",
    });
  });

  it("pollDeviceAuth returns expired with the remote error description for other errors", async () => {
    const fetchMock = createFetchMock();

    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: "access_denied",
          error_description: "User denied access",
        }),
        {
          status: 403,
          headers: { "content-type": "application/json" },
        },
      ),
    );

    await expect(pollDeviceAuth("device-code-123")).resolves.toEqual({
      status: "expired",
      error: "User denied access",
    });
  });

  it("saveDeviceAuthTokens writes auth.json and updates the auth overlay on success", async () => {
    const fetchMock = createFetchMock();
    const { store, setMock } = createOverlayStore();
    const archiveDir = "/tmp/archive-root";
    const authDir = path.join(archiveDir, "codex-auth");
    const tokenData = {
      access_token: "access-token",
      refresh_token: "refresh-token",
      id_token: "id-token",
      token_type: "Bearer",
      expires_in: 7200,
    };

    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(tokenData), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(saveDeviceAuthTokens("device-code-123", archiveDir, store)).resolves.toEqual({ ok: true });

    expect(mockedMkdir).toHaveBeenCalledWith(authDir, { recursive: true });
    expect(mockedWriteFile).toHaveBeenCalledWith(
      path.join(authDir, "auth.json"),
      JSON.stringify(
        {
          access_token: "access-token",
          refresh_token: "refresh-token",
          id_token: "id-token",
          token_type: "Bearer",
          expires_in: 7200,
        },
        null,
        2,
      ),
      { encoding: "utf8", mode: 0o600 },
    );
    expect(setMock).toHaveBeenNthCalledWith(1, "codex.auth.mode", "openai_login");
    expect(setMock).toHaveBeenNthCalledWith(2, "codex.auth.source_home", authDir);
  });

  it("saveDeviceAuthTokens returns an error for non-ok token responses", async () => {
    const fetchMock = createFetchMock();
    const { store, setMock } = createOverlayStore();

    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: "invalid_grant",
          error_description: "Device code not accepted",
        }),
        {
          status: 400,
          headers: { "content-type": "application/json" },
        },
      ),
    );

    await expect(saveDeviceAuthTokens("device-code-123", "/tmp/archive-root", store)).resolves.toEqual({
      ok: false,
      error: "Device code not accepted",
    });

    expect(mockedMkdir).not.toHaveBeenCalled();
    expect(mockedWriteFile).not.toHaveBeenCalled();
    expect(setMock).not.toHaveBeenCalled();
  });
});
