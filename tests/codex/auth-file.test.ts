import { describe, expect, it } from "vitest";

import {
  buildCodexAuthRecord,
  normalizeCodexAuthJson,
  normalizeCodexAuthRecord,
  readCodexAuthTokens,
} from "../../src/codex/auth-file.js";

const FIXED_REFRESH = "2025-01-01T00:00:00Z";

function parseNormalized(input: Record<string, unknown>, lastRefresh?: string): Record<string, unknown> {
  const json = normalizeCodexAuthJson(JSON.stringify(input), lastRefresh ? { lastRefresh } : {});
  return JSON.parse(json) as Record<string, unknown>;
}

describe("normalizeCodexAuthJson", () => {
  it("normalizes flat token fields into nested tokens object", () => {
    const result = parseNormalized(
      { access_token: "at", refresh_token: "rt", id_token: "it", account_id: "aid" },
      FIXED_REFRESH,
    );

    expect(result.tokens).toEqual({
      access_token: "at",
      refresh_token: "rt",
      id_token: "it",
      account_id: "aid",
    });
    expect(result.auth_mode).toBe("chatgpt");
    expect(result.last_refresh).toBe(FIXED_REFRESH);
    expect(result).not.toHaveProperty("access_token");
    expect(result).not.toHaveProperty("refresh_token");
  });

  it("preserves already-nested tokens structure", () => {
    const result = parseNormalized({
      auth_mode: "chatgpt",
      last_refresh: "2025-06-01T00:00:00Z",
      tokens: {
        access_token: "nested-at",
        refresh_token: "nested-rt",
        id_token: null,
        account_id: null,
      },
    });

    expect(result.tokens).toEqual(expect.objectContaining({ access_token: "nested-at", refresh_token: "nested-rt" }));
    expect(result.auth_mode).toBe("chatgpt");
  });

  it("returns passthrough when access_token is missing", () => {
    const result = parseNormalized({ auth_mode: "chatgpt", OPENAI_API_KEY: "sk-test" });

    expect(result).toEqual({ auth_mode: "chatgpt", OPENAI_API_KEY: "sk-test" });
  });

  it("preserves extra top-level fields", () => {
    const result = parseNormalized({ access_token: "at", email: "user@example.com", custom_field: 42 }, FIXED_REFRESH);

    expect(result.email).toBe("user@example.com");
    expect(result.custom_field).toBe(42);
    expect((result.tokens as Record<string, unknown>).access_token).toBe("at");
  });

  it("treats empty string access_token as missing", () => {
    const result = parseNormalized({ access_token: "", refresh_token: "rt" });
    expect(result).toEqual({ access_token: "", refresh_token: "rt" });
  });

  it("treats non-string access_token as missing", () => {
    const result = parseNormalized({ access_token: 12345 });
    expect(result).toEqual({ access_token: 12345 });
  });

  it("uses existing last_refresh when present in record", () => {
    const result = parseNormalized({ access_token: "at", last_refresh: "2024-12-25T00:00:00Z" });
    expect(result.last_refresh).toBe("2024-12-25T00:00:00Z");
  });

  it("sets null for optional token fields that are empty strings", () => {
    const result = parseNormalized(
      { access_token: "at", refresh_token: "", id_token: "", account_id: "" },
      FIXED_REFRESH,
    );

    const tokens = result.tokens as Record<string, unknown>;
    expect(tokens.refresh_token).toBeNull();
    expect(tokens.id_token).toBeNull();
    expect(tokens.account_id).toBeNull();
  });

  it("prefers nested tokens over flat tokens when both present", () => {
    const result = parseNormalized(
      { access_token: "flat-at", tokens: { access_token: "nested-at", refresh_token: "nested-rt" } },
      FIXED_REFRESH,
    );

    expect((result.tokens as Record<string, unknown>).access_token).toBe("nested-at");
  });
});

describe("normalizeCodexAuthRecord", () => {
  it("handles non-object input gracefully (returns empty record)", () => {
    const result = normalizeCodexAuthRecord(null);
    expect(result).toEqual({});
  });

  it("handles array input gracefully (returns empty record)", () => {
    const result = normalizeCodexAuthRecord([1, 2, 3]);
    expect(result).toEqual({});
  });

  it("preserves custom auth_mode from input", () => {
    const result = normalizeCodexAuthRecord(
      {
        access_token: "at",
        auth_mode: "custom_mode",
      },
      { lastRefresh: "2025-01-01T00:00:00Z" },
    );

    expect(result.auth_mode).toBe("custom_mode");
  });

  it("defaults auth_mode to chatgpt when not specified", () => {
    const result = normalizeCodexAuthRecord({ access_token: "at" }, { lastRefresh: "2025-01-01T00:00:00Z" });

    expect(result.auth_mode).toBe("chatgpt");
  });

  it("strips flat token keys from top level after nesting", () => {
    const result = normalizeCodexAuthRecord(
      {
        access_token: "at",
        refresh_token: "rt",
        token_type: "bearer",
        expires_in: 3600,
      },
      { lastRefresh: "2025-01-01T00:00:00Z" },
    );

    expect(result).not.toHaveProperty("access_token");
    expect(result).not.toHaveProperty("refresh_token");
    expect(result).not.toHaveProperty("token_type");
    expect(result).not.toHaveProperty("expires_in");
  });
});

describe("buildCodexAuthRecord", () => {
  const minimalTokens = { access_token: "at", refresh_token: null, id_token: null, account_id: null };

  it("builds a complete auth record with defaults", () => {
    const tokens = { ...minimalTokens, refresh_token: "rt" };
    const result = buildCodexAuthRecord(tokens, { lastRefresh: FIXED_REFRESH });

    expect(result).toEqual({ auth_mode: "chatgpt", last_refresh: FIXED_REFRESH, tokens });
  });

  it("uses custom auth mode when provided", () => {
    const result = buildCodexAuthRecord(minimalTokens, { authMode: "api_key" });
    expect(result.auth_mode).toBe("api_key");
  });

  it("merges extra top-level fields", () => {
    const result = buildCodexAuthRecord(minimalTokens, {
      extraTopLevel: { email: "user@example.com", org: "acme" },
      lastRefresh: FIXED_REFRESH,
    });

    expect(result.email).toBe("user@example.com");
    expect(result.org).toBe("acme");
  });

  it("generates a last_refresh timestamp when not provided", () => {
    const result = buildCodexAuthRecord(minimalTokens);

    expect(typeof result.last_refresh).toBe("string");
    expect(new Date(result.last_refresh as string).getTime()).not.toBeNaN();
  });

  it("uses empty defaults when options omitted entirely", () => {
    const result = buildCodexAuthRecord(minimalTokens);

    expect(result.auth_mode).toBe("chatgpt");
    expect(result.tokens).toBe(minimalTokens);
  });
});

describe("readCodexAuthTokens", () => {
  it("reads tokens from flat structure", () => {
    const result = readCodexAuthTokens({
      access_token: "at",
      refresh_token: "rt",
      id_token: "it",
      account_id: "aid",
    });

    expect(result).toEqual({
      access_token: "at",
      refresh_token: "rt",
      id_token: "it",
      account_id: "aid",
    });
  });

  it("reads tokens from nested structure", () => {
    const result = readCodexAuthTokens({
      auth_mode: "chatgpt",
      tokens: {
        access_token: "nested-at",
        refresh_token: "nested-rt",
        id_token: null,
        account_id: null,
      },
    });

    expect(result).toEqual({
      access_token: "nested-at",
      refresh_token: "nested-rt",
      id_token: null,
      account_id: null,
    });
  });

  it("returns null when no access_token is present", () => {
    const result = readCodexAuthTokens({ refresh_token: "rt" });
    expect(result).toBeNull();
  });

  it("returns null for non-object input", () => {
    expect(readCodexAuthTokens(null)).toBeNull();
    expect(readCodexAuthTokens(undefined)).toBeNull();
    expect(readCodexAuthTokens("string")).toBeNull();
    expect(readCodexAuthTokens(42)).toBeNull();
  });

  it("returns null when access_token is empty string", () => {
    const result = readCodexAuthTokens({ access_token: "" });
    expect(result).toBeNull();
  });

  it("prefers nested tokens over flat tokens", () => {
    const result = readCodexAuthTokens({
      access_token: "flat-at",
      tokens: {
        access_token: "nested-at",
        refresh_token: "nested-rt",
      },
    });

    expect(result?.access_token).toBe("nested-at");
  });

  it("falls back to flat tokens when nested tokens have no valid access_token", () => {
    const result = readCodexAuthTokens({
      access_token: "flat-at",
      tokens: {
        access_token: "",
      },
    });

    expect(result?.access_token).toBe("flat-at");
  });

  it("sets missing optional fields to null", () => {
    const result = readCodexAuthTokens({ access_token: "at" });

    expect(result).toEqual({
      access_token: "at",
      refresh_token: null,
      id_token: null,
      account_id: null,
    });
  });
});
