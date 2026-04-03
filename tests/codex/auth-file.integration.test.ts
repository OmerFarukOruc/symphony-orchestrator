import { describe, expect, it } from "vitest";

import {
  buildCodexAuthRecord,
  normalizeCodexAuthRecord,
  normalizeCodexAuthJson,
  readCodexAuthTokens,
} from "../../src/codex/auth-file.js";

const FIXED_REFRESH = "2025-06-01T00:00:00.000Z";

const MINIMAL_TOKENS = {
  access_token: "at-minimal",
  refresh_token: null,
  id_token: null,
  account_id: null,
};

// ── buildCodexAuthRecord ──────────────────────────────────────────────────────

describe("buildCodexAuthRecord — integration", () => {
  it("builds a record with default auth_mode when none provided", () => {
    const result = buildCodexAuthRecord(MINIMAL_TOKENS, { lastRefresh: FIXED_REFRESH });

    expect(result.auth_mode).toBe("chatgpt");
    expect(result.last_refresh).toBe(FIXED_REFRESH);
    expect(result.tokens).toBe(MINIMAL_TOKENS);
  });

  it("uses the provided authMode", () => {
    const result = buildCodexAuthRecord(MINIMAL_TOKENS, {
      authMode: "api_key",
      lastRefresh: FIXED_REFRESH,
    });

    expect(result.auth_mode).toBe("api_key");
  });

  it("generates a valid ISO last_refresh when none is provided", () => {
    const before = Date.now();
    const result = buildCodexAuthRecord(MINIMAL_TOKENS);
    const after = Date.now();

    const ts = new Date(result.last_refresh as string).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it("merges extraTopLevel fields at the top level", () => {
    const result = buildCodexAuthRecord(MINIMAL_TOKENS, {
      extraTopLevel: { email: "dev@example.com", org: "acme", custom: 42 },
      lastRefresh: FIXED_REFRESH,
    });

    expect(result.email).toBe("dev@example.com");
    expect(result.org).toBe("acme");
    expect(result.custom).toBe(42);
  });

  it("extraTopLevel does not overwrite auth_mode or last_refresh when they come after spread", () => {
    // extraTopLevel is spread first; auth_mode and last_refresh come from options, so they win
    const result = buildCodexAuthRecord(MINIMAL_TOKENS, {
      extraTopLevel: { auth_mode: "injected", last_refresh: "injected" },
      authMode: "chatgpt",
      lastRefresh: FIXED_REFRESH,
    });

    expect(result.auth_mode).toBe("chatgpt");
    expect(result.last_refresh).toBe(FIXED_REFRESH);
  });

  it("includes all optional token fields when fully provided", () => {
    const fullTokens = {
      access_token: "at-full",
      refresh_token: "rt-full",
      id_token: "it-full",
      account_id: "aid-full",
    };
    const result = buildCodexAuthRecord(fullTokens, { lastRefresh: FIXED_REFRESH });

    expect(result.tokens).toEqual(fullTokens);
  });

  it("produces a record with exactly auth_mode, last_refresh, tokens when no extraTopLevel", () => {
    const result = buildCodexAuthRecord(MINIMAL_TOKENS, { lastRefresh: FIXED_REFRESH });

    expect(Object.keys(result).sort()).toEqual(["auth_mode", "last_refresh", "tokens"].sort());
  });
});

// ── normalizeCodexAuthRecord ──────────────────────────────────────────────────

describe("normalizeCodexAuthRecord — integration", () => {
  it("normalizes flat token format into nested tokens object", () => {
    const result = normalizeCodexAuthRecord(
      {
        access_token: "at",
        refresh_token: "rt",
        id_token: "it",
        account_id: "aid",
      },
      { lastRefresh: FIXED_REFRESH },
    );

    expect(result.tokens).toEqual({
      access_token: "at",
      refresh_token: "rt",
      id_token: "it",
      account_id: "aid",
    });
    expect(result).not.toHaveProperty("access_token");
    expect(result).not.toHaveProperty("refresh_token");
    expect(result).not.toHaveProperty("id_token");
    expect(result).not.toHaveProperty("account_id");
  });

  it("normalizes nested token format, preserving the nesting", () => {
    const result = normalizeCodexAuthRecord(
      {
        auth_mode: "chatgpt",
        last_refresh: FIXED_REFRESH,
        tokens: {
          access_token: "nested-at",
          refresh_token: "nested-rt",
          id_token: null,
          account_id: null,
        },
      },
      { lastRefresh: FIXED_REFRESH },
    );

    expect((result.tokens as Record<string, unknown>).access_token).toBe("nested-at");
    expect(result.auth_mode).toBe("chatgpt");
    expect(result.last_refresh).toBe(FIXED_REFRESH);
  });

  it("returns the record unchanged when access_token is absent", () => {
    const input = { auth_mode: "chatgpt", custom: "value" };
    const result = normalizeCodexAuthRecord(input);

    expect(result).toEqual(input);
  });

  it("returns the record unchanged when access_token is an empty string", () => {
    const input = { access_token: "", refresh_token: "rt" };
    const result = normalizeCodexAuthRecord(input);

    expect(result).toEqual(input);
  });

  it("strips all FLAT_TOKEN_KEYS from the top level after normalization", () => {
    const result = normalizeCodexAuthRecord(
      {
        access_token: "at",
        refresh_token: "rt",
        id_token: "it",
        account_id: "aid",
        token_type: "bearer",
        expires_in: 3600,
      },
      { lastRefresh: FIXED_REFRESH },
    );

    for (const key of ["access_token", "refresh_token", "id_token", "account_id", "token_type", "expires_in"]) {
      expect(result).not.toHaveProperty(key);
    }
  });

  it("preserves unknown top-level fields that are not FLAT_TOKEN_KEYS", () => {
    const result = normalizeCodexAuthRecord(
      {
        access_token: "at",
        email: "user@example.com",
        org_id: "org-1",
        arbitrary_number: 99,
      },
      { lastRefresh: FIXED_REFRESH },
    );

    expect(result.email).toBe("user@example.com");
    expect(result.org_id).toBe("org-1");
    expect(result.arbitrary_number).toBe(99);
  });

  it("prefers auth_mode from the input record over the default", () => {
    const result = normalizeCodexAuthRecord(
      { access_token: "at", auth_mode: "custom_mode" },
      { lastRefresh: FIXED_REFRESH },
    );

    expect(result.auth_mode).toBe("custom_mode");
  });

  it("defaults auth_mode to chatgpt when not present in record", () => {
    const result = normalizeCodexAuthRecord({ access_token: "at" }, { lastRefresh: FIXED_REFRESH });

    expect(result.auth_mode).toBe("chatgpt");
  });

  it("uses last_refresh from the record when present", () => {
    const recordRefresh = "2024-01-01T00:00:00.000Z";
    const result = normalizeCodexAuthRecord({
      access_token: "at",
      last_refresh: recordRefresh,
    });

    expect(result.last_refresh).toBe(recordRefresh);
  });

  it("falls back to the options.lastRefresh when record has none", () => {
    const result = normalizeCodexAuthRecord({ access_token: "at" }, { lastRefresh: FIXED_REFRESH });

    expect(result.last_refresh).toBe(FIXED_REFRESH);
  });

  it("returns empty record for null input", () => {
    expect(normalizeCodexAuthRecord(null)).toEqual({});
  });

  it("returns empty record for undefined input", () => {
    expect(normalizeCodexAuthRecord(undefined)).toEqual({});
  });

  it("returns empty record for primitive string input", () => {
    expect(normalizeCodexAuthRecord("not-an-object")).toEqual({});
  });

  it("returns empty record for array input", () => {
    expect(normalizeCodexAuthRecord([1, 2, 3])).toEqual({});
  });

  it("prefers nested tokens over flat tokens when both are present", () => {
    const result = normalizeCodexAuthRecord(
      {
        access_token: "flat-at",
        tokens: { access_token: "nested-at", refresh_token: "nested-rt" },
      },
      { lastRefresh: FIXED_REFRESH },
    );

    expect((result.tokens as Record<string, unknown>).access_token).toBe("nested-at");
  });

  it("sets null for optional token fields that are empty strings", () => {
    const result = normalizeCodexAuthRecord(
      { access_token: "at", refresh_token: "", id_token: "", account_id: "" },
      { lastRefresh: FIXED_REFRESH },
    );

    const tokens = result.tokens as Record<string, unknown>;
    expect(tokens.refresh_token).toBeNull();
    expect(tokens.id_token).toBeNull();
    expect(tokens.account_id).toBeNull();
  });
});

// ── normalizeCodexAuthJson ────────────────────────────────────────────────────

describe("normalizeCodexAuthJson — integration", () => {
  it("round-trips valid JSON with flat tokens", () => {
    const input = JSON.stringify({
      access_token: "at",
      refresh_token: "rt",
      id_token: "it",
      account_id: "aid",
    });

    const output = normalizeCodexAuthJson(input, { lastRefresh: FIXED_REFRESH });
    const parsed = JSON.parse(output) as Record<string, unknown>;

    expect(parsed.tokens).toEqual({
      access_token: "at",
      refresh_token: "rt",
      id_token: "it",
      account_id: "aid",
    });
    expect(parsed.auth_mode).toBe("chatgpt");
    expect(parsed.last_refresh).toBe(FIXED_REFRESH);
    expect(parsed).not.toHaveProperty("access_token");
  });

  it("round-trips valid JSON with already-nested tokens", () => {
    const input = JSON.stringify({
      auth_mode: "chatgpt",
      last_refresh: FIXED_REFRESH,
      tokens: { access_token: "nested-at", refresh_token: "nested-rt", id_token: null, account_id: null },
    });

    const output = normalizeCodexAuthJson(input);
    const parsed = JSON.parse(output) as Record<string, unknown>;

    expect((parsed.tokens as Record<string, unknown>).access_token).toBe("nested-at");
  });

  it("returns passthrough JSON when access_token is missing", () => {
    const input = JSON.stringify({ auth_mode: "chatgpt", custom: "field" });

    const output = normalizeCodexAuthJson(input);
    const parsed = JSON.parse(output) as Record<string, unknown>;

    expect(parsed).toEqual({ auth_mode: "chatgpt", custom: "field" });
  });

  it("produces pretty-printed JSON (2-space indent)", () => {
    const input = JSON.stringify({ access_token: "at" });
    const output = normalizeCodexAuthJson(input, { lastRefresh: FIXED_REFRESH });

    expect(output).toContain("\n");
    // Two-space indent means the first indented line starts with exactly two spaces
    expect(output).toMatch(/^\{[\s\S]*\n {2}"/m);
  });

  it("preserves extra top-level fields through the round-trip", () => {
    const input = JSON.stringify({
      access_token: "at",
      user_email: "dev@test.com",
    });

    const output = normalizeCodexAuthJson(input, { lastRefresh: FIXED_REFRESH });
    const parsed = JSON.parse(output) as Record<string, unknown>;

    expect(parsed.user_email).toBe("dev@test.com");
  });
});

// ── readCodexAuthTokens ───────────────────────────────────────────────────────

describe("readCodexAuthTokens — integration", () => {
  it("extracts tokens from flat format", () => {
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

  it("extracts tokens from nested format", () => {
    const result = readCodexAuthTokens({
      auth_mode: "chatgpt",
      last_refresh: FIXED_REFRESH,
      tokens: {
        access_token: "nested-at",
        refresh_token: "nested-rt",
        id_token: "nested-it",
        account_id: "nested-aid",
      },
    });

    expect(result).toEqual({
      access_token: "nested-at",
      refresh_token: "nested-rt",
      id_token: "nested-it",
      account_id: "nested-aid",
    });
  });

  it("prefers nested tokens when both flat and nested are present", () => {
    const result = readCodexAuthTokens({
      access_token: "flat-at",
      tokens: { access_token: "nested-at", refresh_token: "nested-rt" },
    });

    expect(result?.access_token).toBe("nested-at");
  });

  it("falls back to flat tokens when nested tokens lack a valid access_token", () => {
    const result = readCodexAuthTokens({
      access_token: "flat-at",
      tokens: { access_token: "" },
    });

    expect(result?.access_token).toBe("flat-at");
  });

  it("returns null when access_token is absent", () => {
    expect(readCodexAuthTokens({ refresh_token: "rt" })).toBeNull();
  });

  it("returns null when access_token is an empty string", () => {
    expect(readCodexAuthTokens({ access_token: "" })).toBeNull();
  });

  it("returns null for null input", () => {
    expect(readCodexAuthTokens(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(readCodexAuthTokens(undefined)).toBeNull();
  });

  it("returns null for string input", () => {
    expect(readCodexAuthTokens("access_token=at")).toBeNull();
  });

  it("returns null for numeric input", () => {
    expect(readCodexAuthTokens(42)).toBeNull();
  });

  it("returns null for array input", () => {
    expect(readCodexAuthTokens([{ access_token: "at" }])).toBeNull();
  });

  it("sets null for optional fields that are absent", () => {
    const result = readCodexAuthTokens({ access_token: "at" });

    expect(result).toEqual({
      access_token: "at",
      refresh_token: null,
      id_token: null,
      account_id: null,
    });
  });

  it("sets null for optional fields that are empty strings", () => {
    const result = readCodexAuthTokens({
      access_token: "at",
      refresh_token: "",
      id_token: "",
      account_id: "",
    });

    expect(result?.refresh_token).toBeNull();
    expect(result?.id_token).toBeNull();
    expect(result?.account_id).toBeNull();
  });

  it("sets null for optional fields that are non-string types", () => {
    const result = readCodexAuthTokens({
      access_token: "at",
      refresh_token: 12345,
      id_token: true,
      account_id: null,
    });

    expect(result?.refresh_token).toBeNull();
    expect(result?.id_token).toBeNull();
    expect(result?.account_id).toBeNull();
  });
});
