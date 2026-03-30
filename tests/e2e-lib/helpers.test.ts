import { homedir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { resolveEnvValue, errorMsg, buildOverlayPayload, checkPortAvailable } from "../../scripts/e2e-lib/helpers.js";
import { extractPrNumber } from "../../scripts/e2e-lib/phases-teardown.js";
import { expandTilde } from "../../scripts/e2e-lib/phases-startup.js";
import type { E2EConfig } from "../../scripts/e2e-lib/types.js";

// ---------------------------------------------------------------------------
// resolveEnvValue
// ---------------------------------------------------------------------------

describe("resolveEnvValue", () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("returns literal values unchanged", () => {
    expect(resolveEnvValue("hello")).toBe("hello");
  });

  it("resolves $ENV_VAR to its value", () => {
    process.env.TEST_RESOLVE = "secret123";
    expect(resolveEnvValue("$TEST_RESOLVE")).toBe("secret123");
  });

  it("throws TypeError when the referenced env var is missing", () => {
    delete process.env.MISSING_VAR;
    expect(() => resolveEnvValue("$MISSING_VAR")).toThrow(TypeError);
    expect(() => resolveEnvValue("$MISSING_VAR")).toThrow("MISSING_VAR is not set");
  });

  it("returns empty string env var without throwing", () => {
    process.env.EMPTY_VAR = "";
    expect(resolveEnvValue("$EMPTY_VAR")).toBe("");
  });

  it("does not resolve dollar signs mid-string", () => {
    expect(resolveEnvValue("foo$bar")).toBe("foo$bar");
  });
});

// ---------------------------------------------------------------------------
// errorMsg
// ---------------------------------------------------------------------------

describe("errorMsg", () => {
  it("extracts message from Error instances", () => {
    expect(errorMsg(new Error("boom"))).toBe("boom");
  });

  it("coerces non-Error values to string", () => {
    expect(errorMsg(42)).toBe("42");
    expect(errorMsg(null)).toBe("null");
    expect(errorMsg(undefined)).toBe("undefined");
  });
});

// ---------------------------------------------------------------------------
// extractPrNumber
// ---------------------------------------------------------------------------

describe("extractPrNumber", () => {
  it("extracts the PR number from a GitHub pull URL", () => {
    expect(extractPrNumber("https://github.com/owner/repo/pull/42")).toBe(42);
  });

  it("returns null for non-PR URLs", () => {
    expect(extractPrNumber("https://github.com/owner/repo/issues/42")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractPrNumber("")).toBeNull();
  });

  it("handles URLs with trailing paths", () => {
    expect(extractPrNumber("https://github.com/owner/repo/pull/99/files")).toBe(99);
  });
});

// ---------------------------------------------------------------------------
// expandTilde
// ---------------------------------------------------------------------------

describe("expandTilde", () => {
  it("expands ~ to home directory", () => {
    const result = expandTilde("~");
    expect(result).not.toContain("~");
    expect(result).toBe(homedir());
  });

  it("expands ~/path to home + path", () => {
    const result = expandTilde("~/foo/bar");
    expect(result).toBe(path.join(homedir(), "foo/bar"));
  });

  it("does not expand paths that merely contain ~", () => {
    expect(expandTilde("/tmp/~foo")).toBe("/tmp/~foo");
  });

  it("returns absolute paths unchanged", () => {
    expect(expandTilde("/usr/local/bin")).toBe("/usr/local/bin");
  });
});

// ---------------------------------------------------------------------------
// buildOverlayPayload
// ---------------------------------------------------------------------------

describe("buildOverlayPayload", () => {
  const baseConfig: E2EConfig = {
    linear: { api_key: "$LINEAR_API_KEY", project_slug: "TEST", team_id: "team-1" },
    codex: { auth_mode: "api_key", source_home: "~/.codex", model: "o3-mini", reasoning_effort: "low" },
    github: {
      token: "$GITHUB_TOKEN",
      test_repo: { url: "https://github.com/o/r", branch: "main", identifier_prefix: "E2E", owner: "o", repo: "r" },
    },
    server: { port: 4111 },
    timeouts: {
      symphony_startup_ms: 15_000,
      setup_complete_ms: 30_000,
      issue_pickup_ms: 60_000,
      lifecycle_complete_ms: 1_800_000,
      pr_verification_ms: 30_000,
      graceful_shutdown_ms: 10_000,
    },
    test_issue: { title: "Test", description: "Desc", priority: 3 },
    cleanup: { enabled: true },
  };

  it("returns an object with the expected top-level keys", () => {
    const payload = buildOverlayPayload(baseConfig);
    expect(payload).toHaveProperty("tracker");
    expect(payload).toHaveProperty("codex");
    expect(payload).toHaveProperty("polling");
    expect(payload).toHaveProperty("agent");
    expect(payload).toHaveProperty("workspace");
    expect(payload).toHaveProperty("server");
    expect(payload).toHaveProperty("repos");
  });

  it("includes real project_slug from config", () => {
    const payload = buildOverlayPayload(baseConfig);
    const tracker = payload.tracker as Record<string, unknown>;
    expect(tracker.project_slug).toBe("TEST");
  });

  it("uses env-var expansion reference for api_key", () => {
    const payload = buildOverlayPayload(baseConfig);
    const tracker = payload.tracker as Record<string, unknown>;
    expect(tracker.api_key).toBe("$LINEAR_API_KEY");
  });

  it("populates repos from test_repo config", () => {
    const payload = buildOverlayPayload(baseConfig);
    const repos = payload.repos as Array<Record<string, unknown>>;
    expect(repos).toHaveLength(1);
    expect(repos[0].repo_url).toBe("https://github.com/o/r");
    expect(repos[0].identifier_prefix).toBe("E2E");
    expect(repos[0].github_token_env).toBe("GITHUB_TOKEN");
  });

  it("populates codex model and reasoning_effort from config", () => {
    const payload = buildOverlayPayload(baseConfig);
    const codex = payload.codex as Record<string, unknown>;
    expect(codex.model).toBe("o3-mini");
    expect(codex.reasoning_effort).toBe("low");
  });

  it("sets server port from config", () => {
    const payload = buildOverlayPayload(baseConfig);
    const server = payload.server as Record<string, unknown>;
    expect(server.port).toBe(4111);
  });
});

// ---------------------------------------------------------------------------
// checkPortAvailable
// ---------------------------------------------------------------------------

describe("checkPortAvailable", () => {
  it("returns a boolean without throwing", async () => {
    // Use a high ephemeral port unlikely to be in use
    const available = await checkPortAvailable(59_123);
    expect(typeof available).toBe("boolean");
  });
});
