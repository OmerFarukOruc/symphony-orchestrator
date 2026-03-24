import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn(),
  writeFile: vi.fn(),
}));

import { mkdir, writeFile } from "node:fs/promises";

import { ConfigOverlayStore } from "../../src/config/overlay.js";
import { createPkceSession, exchangePkceCode, savePkceAuthTokens } from "../../src/setup/device-auth.js";
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

describe("PKCE auth helpers", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedMkdir.mockResolvedValue(undefined);
    mockedWriteFile.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("createPkceSession", () => {
    it("generates a valid PKCE session with auth URL", () => {
      const session = createPkceSession("http://localhost:4000");

      expect(session.codeVerifier).toBeTruthy();
      expect(session.state).toBeTruthy();
      expect(session.redirectUri).toBe("http://localhost:1455/auth/callback");
      expect(session.authUrl).toContain("https://auth.openai.com/oauth/authorize");
      expect(session.authUrl).toContain("client_id=app_EMoamEEZ73f0CkXaXp7hrann");
      expect(session.authUrl).toContain("code_challenge_method=S256");
      expect(session.authUrl).toContain("response_type=code");
      expect(session.authUrl).toContain(encodeURIComponent("http://localhost:1455/auth/callback"));
      expect(session.authCode).toBeNull();
      expect(session.error).toBeNull();
      expect(session.complete).toBe(false);
    });

    it("generates unique state and verifier for each session", () => {
      const session1 = createPkceSession("http://localhost:4000");
      const session2 = createPkceSession("http://localhost:4000");

      expect(session1.state).not.toBe(session2.state);
      expect(session1.codeVerifier).not.toBe(session2.codeVerifier);
    });
  });

  describe("exchangePkceCode", () => {
    it("exchanges authorization code for tokens on success", async () => {
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

      const result = await exchangePkceCode("auth-code-123", "code-verifier", "http://localhost:4000/auth/callback");
      expect(result).toEqual(tokenData);

      expect(fetchMock).toHaveBeenCalledWith(
        "https://auth.openai.com/oauth/token",
        expect.objectContaining({
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
        }),
      );

      const body = fetchMock.mock.calls[0]?.[1]?.body as string;
      const params = new URLSearchParams(body);
      expect(params.get("grant_type")).toBe("authorization_code");
      expect(params.get("client_id")).toBe("app_EMoamEEZ73f0CkXaXp7hrann");
      expect(params.get("code")).toBe("auth-code-123");
      expect(params.get("code_verifier")).toBe("code-verifier");
    });

    it("throws with error description on non-ok responses", async () => {
      const fetchMock = createFetchMock();

      fetchMock.mockResolvedValue(
        new Response(
          JSON.stringify({
            error: "invalid_grant",
            error_description: "Authorization code expired",
          }),
          {
            status: 400,
            headers: { "content-type": "application/json" },
          },
        ),
      );

      await expect(exchangePkceCode("expired-code", "verifier", "http://localhost:4000/auth/callback")).rejects.toThrow(
        "Authorization code expired",
      );
    });
  });

  describe("savePkceAuthTokens", () => {
    it("writes auth.json and updates the auth overlay on success", async () => {
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

      await savePkceAuthTokens(tokenData, archiveDir, store);

      expect(mockedMkdir).toHaveBeenCalledWith(authDir, { recursive: true });
      const writtenJson = JSON.parse(mockedWriteFile.mock.calls[0]?.[1] as string);
      expect(mockedWriteFile).toHaveBeenCalledWith(path.join(authDir, "auth.json"), expect.any(String), {
        encoding: "utf8",
        mode: 0o600,
      });
      expect(writtenJson).toEqual({
        auth_mode: "chatgpt",
        last_refresh: expect.any(String),
        tokens: {
          access_token: "access-token",
          refresh_token: "refresh-token",
          id_token: "id-token",
          account_id: null,
        },
      });
      expect(setMock).toHaveBeenNthCalledWith(1, "codex.auth.mode", "openai_login");
      expect(setMock).toHaveBeenNthCalledWith(2, "codex.auth.source_home", authDir);
    });

    it("handles missing optional fields", async () => {
      const { store } = createOverlayStore();
      const tokenData = {
        access_token: "access-only",
        token_type: "Bearer",
        expires_in: 3600,
      };

      await savePkceAuthTokens(tokenData, "/tmp/archive", store);

      const writtenJson = JSON.parse(mockedWriteFile.mock.calls[0]?.[1] as string);
      expect(writtenJson.tokens.refresh_token).toBeNull();
      expect(writtenJson.tokens.id_token).toBeNull();
    });
  });
});
