import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isTokenExpired, refreshAccessToken } from "../../src/codex/token-refresh.js";

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "risoluto-token-refresh-test-"));
  tempDirs.push(dir);
  return dir;
}

/** Build a minimal JWT with the given exp claim (Unix seconds). */
function buildJwt(exp: number): string {
  const header = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ exp })).toString("base64url");
  return `${header}.${payload}.signature`;
}

function buildFlatAuthJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    access_token: buildJwt(Math.floor(Date.now() / 1000) + 3600),
    refresh_token: "rt_test_refresh_token",
    token_type: "Bearer",
    expires_in: 3600,
    ...overrides,
  });
}

function buildNestedAuthJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    auth_mode: "chatgpt",
    last_refresh: new Date().toISOString(),
    tokens: {
      access_token: buildJwt(Math.floor(Date.now() / 1000) + 3600),
      refresh_token: "rt_test_refresh_token",
      id_token: "id-token",
      account_id: "acc-123",
    },
    ...overrides,
  });
}

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("isTokenExpired", () => {
  it("returns true when the 'expired' field is in the past", () => {
    const auth = buildFlatAuthJson({ expired: "2020-01-01T00:00:00Z" });
    expect(isTokenExpired(auth)).toBe(true);
  });

  it("returns false when the 'expired' field is in the future", () => {
    const futureDate = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const auth = buildFlatAuthJson({ expired: futureDate });
    expect(isTokenExpired(auth)).toBe(false);
  });

  it("returns true when the token expires within the 5-minute safety margin", () => {
    const almostExpired = new Date(Date.now() + 3 * 60 * 1000).toISOString(); // 3 min from now
    const auth = buildFlatAuthJson({ expired: almostExpired });
    expect(isTokenExpired(auth)).toBe(true);
  });

  it("falls back to JWT exp claim when no expired field", () => {
    const expiredJwt = buildJwt(Math.floor(Date.now() / 1000) - 600);
    const auth = buildFlatAuthJson({ access_token: expiredJwt, expired: undefined });
    expect(isTokenExpired(auth)).toBe(true);
  });

  it("returns false when JWT exp is in the future and no expired field", () => {
    const validJwt = buildJwt(Math.floor(Date.now() / 1000) + 3600);
    const auth = buildFlatAuthJson({ access_token: validJwt, expired: undefined });
    expect(isTokenExpired(auth)).toBe(false);
  });

  it("supports the nested Codex CLI auth schema", () => {
    const auth = buildNestedAuthJson();
    expect(isTokenExpired(auth)).toBe(false);
  });

  it("returns false when expiry cannot be determined", () => {
    const auth = JSON.stringify({ access_token: "not-a-jwt", token_type: "Bearer" });
    expect(isTokenExpired(auth)).toBe(false);
  });

  it("returns false for unparseable JSON", () => {
    expect(isTokenExpired("{{not json}}")).toBe(false);
  });
});

describe("refreshAccessToken", () => {
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("exchanges refresh_token for a new access_token and rewrites nested auth.json", async () => {
    const dir = await createTempDir();
    const authPath = path.join(dir, "auth.json");
    await writeFile(authPath, buildNestedAuthJson({ expired: "2020-01-01T00:00:00Z" }), "utf8");

    const newTokenData = {
      access_token: "new-access-token",
      refresh_token: "new-refresh-token",
      id_token: "new-id-token",
      token_type: "Bearer",
      expires_in: 7200,
    };

    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(newTokenData), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const result = await refreshAccessToken(authPath);
    const parsed = JSON.parse(result);

    expect(parsed.tokens.access_token).toBe("new-access-token");
    expect(parsed.tokens.refresh_token).toBe("new-refresh-token");
    expect(parsed.last_refresh).toBeTruthy();

    // Verify the file was written to disk
    const onDisk = JSON.parse(await readFile(authPath, "utf8"));
    expect(onDisk.tokens.access_token).toBe("new-access-token");

    // Verify the fetch call
    expect(fetchMock).toHaveBeenCalledWith(
      "https://auth.openai.com/oauth/token",
      expect.objectContaining({ method: "POST" }),
    );
    const body = fetchMock.mock.calls[0]?.[1]?.body as string;
    const params = new URLSearchParams(body);
    expect(params.get("grant_type")).toBe("refresh_token");
    expect(params.get("client_id")).toBe("app_EMoamEEZ73f0CkXaXp7hrann");
    expect(params.get("refresh_token")).toBe("rt_test_refresh_token");
  });

  it("upgrades legacy flat auth.json into the nested Codex CLI schema", async () => {
    const dir = await createTempDir();
    const authPath = path.join(dir, "auth.json");
    await writeFile(
      authPath,
      buildFlatAuthJson({ expired: "2020-01-01T00:00:00Z", email: "user@example.com" }),
      "utf8",
    );

    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "refreshed-access-token",
          token_type: "Bearer",
          expires_in: 3600,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const result = JSON.parse(await refreshAccessToken(authPath));
    expect(result.email).toBe("user@example.com");
    expect(result.auth_mode).toBe("chatgpt");
    expect(result.tokens.access_token).toBe("refreshed-access-token");
  });

  it("throws when no refresh_token is present", async () => {
    const dir = await createTempDir();
    const authPath = path.join(dir, "auth.json");
    await writeFile(
      authPath,
      buildNestedAuthJson({
        tokens: { access_token: buildJwt(Math.floor(Date.now() / 1000) + 3600), refresh_token: null },
      }),
      "utf8",
    );

    await expect(refreshAccessToken(authPath)).rejects.toThrow("no refresh_token in auth.json");
  });

  it("throws when the token endpoint returns an error", async () => {
    const dir = await createTempDir();
    const authPath = path.join(dir, "auth.json");
    await writeFile(authPath, buildNestedAuthJson(), "utf8");

    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: "invalid_grant",
          error_description: "Refresh token has been revoked",
        }),
        { status: 400, headers: { "content-type": "application/json" } },
      ),
    );

    await expect(refreshAccessToken(authPath)).rejects.toThrow("Refresh token has been revoked");
  });

  it("preserves extra fields from the original auth.json", async () => {
    const dir = await createTempDir();
    const authPath = path.join(dir, "auth.json");
    const authWithExtras = buildNestedAuthJson({ email: "user@example.com", expired: "2020-01-01T00:00:00Z" });
    await writeFile(authPath, authWithExtras, "utf8");

    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "refreshed",
          token_type: "Bearer",
          expires_in: 3600,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const result = JSON.parse(await refreshAccessToken(authPath));
    expect(result.email).toBe("user@example.com");
    expect(result.expired).toBeTruthy();
    expect(result.tokens.account_id).toBe("acc-123");
    expect(result.tokens.access_token).toBe("refreshed");
  });
});
