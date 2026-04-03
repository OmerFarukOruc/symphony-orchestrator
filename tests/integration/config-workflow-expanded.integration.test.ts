/**
 * Expanded integration tests for the config subsystem.
 *
 * Covers the uncovered paths in:
 *   - src/config/api.ts        (methodNotAllowed .all() handlers: lines 101, 106, 111, 116)
 *   - src/config/db-store.ts   (applyPatch, set, delete, writeSections, notify — lines 127-235)
 *   - src/config/coercion.ts   (edge cases for all exported helpers)
 *   - src/config/normalizers.ts (edge cases for all exported normalizers)
 *
 * Uses real ConfigOverlayStore backed by a temp file, real DbConfigStore
 * backed by a real SQLite database, and real HTTP via startTestServer.
 */

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DbConfigStore } from "../../src/config/db-store.js";
import { ConfigOverlayStore } from "../../src/config/overlay.js";
import { ConfigStore } from "../../src/config/store.js";
import { closeDatabase, openDatabase, type RisolutoDatabase } from "../../src/persistence/sqlite/database.js";
import { buildSilentLogger, startTestServer, type TestServerResult } from "../helpers/http-server-harness.js";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

interface OverlayFixture {
  tmpDir: string;
  overlayPath: string;
  overlayStore: ConfigOverlayStore;
  configStore: ConfigStore;
  teardown: () => Promise<void>;
}

async function createOverlayFixture(): Promise<OverlayFixture> {
  const logger = buildSilentLogger();
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "risoluto-cfg-exp-"));
  const overlayPath = path.join(tmpDir, "overlay.yaml");

  const overlayStore = new ConfigOverlayStore(overlayPath, logger);
  await overlayStore.start();

  const configStore = new ConfigStore(logger, { overlayStore });
  await configStore.start();

  return {
    tmpDir,
    overlayPath,
    overlayStore,
    configStore,
    teardown: async () => {
      await overlayStore.stop();
      await configStore.stop();
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    },
  };
}

interface DbFixture {
  tmpDir: string;
  db: RisolutoDatabase;
  dbStore: DbConfigStore;
  teardown: () => Promise<void>;
}

async function createDbFixture(): Promise<DbFixture> {
  const logger = buildSilentLogger();
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "risoluto-db-cfg-"));
  const db = openDatabase(path.join(tmpDir, "config-test.db"));
  const dbStore = new DbConfigStore(db, logger);
  dbStore.refresh();

  return {
    tmpDir,
    db,
    dbStore,
    teardown: async () => {
      closeDatabase(db);
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    },
  };
}

// ---------------------------------------------------------------------------
// config/api.ts — methodNotAllowed .all() handlers (lines 101, 106, 111, 116)
// ---------------------------------------------------------------------------

describe("config API — methodNotAllowed guards", () => {
  let ctx: TestServerResult;
  let fixture: OverlayFixture;

  beforeEach(async () => {
    fixture = await createOverlayFixture();
    ctx = await startTestServer({
      configStore: fixture.configStore,
      configOverlayStore: fixture.overlayStore,
    });
  });

  afterEach(async () => {
    await ctx.teardown();
    await fixture.teardown();
  });

  // GET /api/v1/config — valid
  it("GET /api/v1/config returns 200", async () => {
    const res = await fetch(`${ctx.baseUrl}/api/v1/config`);
    expect(res.status).toBe(200);
  });

  // line 101: .all() on /api/v1/config (e.g. POST, DELETE)
  it("POST /api/v1/config returns 405", async () => {
    const res = await fetch(`${ctx.baseUrl}/api/v1/config`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(405);
    const body = (await res.json()) as Record<string, { code: string }>;
    expect(body.error.code).toBe("method_not_allowed");
  });

  it("DELETE /api/v1/config returns 405", async () => {
    const res = await fetch(`${ctx.baseUrl}/api/v1/config`, { method: "DELETE" });
    expect(res.status).toBe(405);
  });

  // line 106: .all() on /api/v1/config/schema
  it("POST /api/v1/config/schema returns 405", async () => {
    const res = await fetch(`${ctx.baseUrl}/api/v1/config/schema`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(405);
    const body = (await res.json()) as Record<string, { code: string }>;
    expect(body.error.code).toBe("method_not_allowed");
  });

  it("DELETE /api/v1/config/schema returns 405", async () => {
    const res = await fetch(`${ctx.baseUrl}/api/v1/config/schema`, { method: "DELETE" });
    expect(res.status).toBe(405);
  });

  // line 111: .all() on /api/v1/config/overlay (e.g. POST)
  it("POST /api/v1/config/overlay returns 405", async () => {
    const res = await fetch(`${ctx.baseUrl}/api/v1/config/overlay`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(405);
    const body = (await res.json()) as Record<string, { code: string }>;
    expect(body.error.code).toBe("method_not_allowed");
  });

  // line 116: .all() on /api/v1/config/overlay/:path (e.g. GET, POST)
  it("GET /api/v1/config/overlay/codex.model returns 405", async () => {
    const res = await fetch(`${ctx.baseUrl}/api/v1/config/overlay/codex.model`);
    expect(res.status).toBe(405);
    const body = (await res.json()) as Record<string, { code: string }>;
    expect(body.error.code).toBe("method_not_allowed");
  });

  it("POST /api/v1/config/overlay/codex.model returns 405", async () => {
    const res = await fetch(`${ctx.baseUrl}/api/v1/config/overlay/codex.model`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: "gpt-4o" }),
    });
    expect(res.status).toBe(405);
  });
});

// ---------------------------------------------------------------------------
// config/api.ts — PUT /api/v1/config/overlay validation branches
// ---------------------------------------------------------------------------

describe("config API — PUT overlay validation", () => {
  let ctx: TestServerResult;
  let fixture: OverlayFixture;

  beforeEach(async () => {
    fixture = await createOverlayFixture();
    ctx = await startTestServer({
      configStore: fixture.configStore,
      configOverlayStore: fixture.overlayStore,
    });
  });

  afterEach(async () => {
    await ctx.teardown();
    await fixture.teardown();
  });

  it("returns 400 when PUT body is not a JSON object (array)", async () => {
    const res = await fetch(`${ctx.baseUrl}/api/v1/config/overlay`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify([1, 2, 3]),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, { code: string }>;
    expect(body.error.code).toBe("invalid_overlay_payload");
  });

  it("PUT with valid object patch returns 200 and updated flag", async () => {
    const res = await fetch(`${ctx.baseUrl}/api/v1/config/overlay`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ codex: { model: "gpt-4o" } }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(typeof body.updated).toBe("boolean");
    expect(typeof body.overlay).toBe("object");
  });

  it("PUT with patch wrapper applies nested merge", async () => {
    const res = await fetch(`${ctx.baseUrl}/api/v1/config/overlay`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ patch: { polling: { interval_ms: 5000 } } }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    const overlay = body.overlay as Record<string, unknown>;
    expect((overlay.polling as Record<string, unknown>)?.interval_ms).toBe(5000);
  });
});

// ---------------------------------------------------------------------------
// config/api.ts — PATCH + DELETE /api/v1/config/overlay/:path
// ---------------------------------------------------------------------------

describe("config API — PATCH / DELETE overlay path", () => {
  let ctx: TestServerResult;
  let fixture: OverlayFixture;

  beforeEach(async () => {
    fixture = await createOverlayFixture();
    ctx = await startTestServer({
      configStore: fixture.configStore,
      configOverlayStore: fixture.overlayStore,
    });
  });

  afterEach(async () => {
    await ctx.teardown();
    await fixture.teardown();
  });

  it("PATCH sets a nested path value and returns updated overlay", async () => {
    const res = await fetch(`${ctx.baseUrl}/api/v1/config/overlay/agent.max_turns`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: 15 }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(typeof body.updated).toBe("boolean");
  });

  it("PATCH returns 400 when body lacks value field", async () => {
    const res = await fetch(`${ctx.baseUrl}/api/v1/config/overlay/codex.model`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ notValue: "gpt-4o" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, { code: string }>;
    expect(body.error.code).toBe("invalid_overlay_payload");
  });

  it("DELETE an existing path returns 204", async () => {
    // First set a value so we can delete it
    await fetch(`${ctx.baseUrl}/api/v1/config/overlay`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ polling: { interval_ms: 9000 } }),
    });

    const res = await fetch(`${ctx.baseUrl}/api/v1/config/overlay/polling`, {
      method: "DELETE",
    });
    expect(res.status).toBe(204);
  });

  it("DELETE a non-existent path returns 404", async () => {
    const res = await fetch(`${ctx.baseUrl}/api/v1/config/overlay/does_not_exist`, {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as Record<string, { code: string }>;
    expect(body.error.code).toBe("overlay_path_not_found");
  });
});

// ---------------------------------------------------------------------------
// config/db-store.ts — DbConfigStore write/update/merge operations
// ---------------------------------------------------------------------------

describe("DbConfigStore — applyPatch", () => {
  let fixture: DbFixture;

  beforeEach(async () => {
    fixture = await createDbFixture();
  });

  afterEach(async () => {
    await fixture.teardown();
  });

  it("applyPatch returns true when map changes", async () => {
    const changed = await fixture.dbStore.applyPatch({ codex: { model: "gpt-4o" } });
    expect(changed).toBe(true);
    const map = fixture.dbStore.toMap();
    expect((map.codex as Record<string, unknown>)?.model).toBe("gpt-4o");
  });

  it("applyPatch returns false when patch produces no change", async () => {
    await fixture.dbStore.applyPatch({ polling: { interval_ms: 5000 } });
    // Apply identical patch — no change expected
    const changed = await fixture.dbStore.applyPatch({ polling: { interval_ms: 5000 } });
    expect(changed).toBe(false);
  });

  it("applyPatch deep-merges into existing keys", async () => {
    await fixture.dbStore.applyPatch({ codex: { model: "gpt-4o", timeout_ms: 30000 } });
    await fixture.dbStore.applyPatch({ codex: { model: "o4-mini" } });
    const map = fixture.dbStore.toMap();
    const codex = map.codex as Record<string, unknown>;
    // Model updated, timeout_ms still present (deep merge)
    expect(codex.model).toBe("o4-mini");
    expect(codex.timeout_ms).toBe(30000);
  });
});

describe("DbConfigStore — set", () => {
  let fixture: DbFixture;

  beforeEach(async () => {
    fixture = await createDbFixture();
  });

  afterEach(async () => {
    await fixture.teardown();
  });

  it("set creates a nested path and returns true", async () => {
    const changed = await fixture.dbStore.set("codex.model", "gpt-4o");
    expect(changed).toBe(true);
    const map = fixture.dbStore.toMap();
    expect((map.codex as Record<string, unknown>)?.model).toBe("gpt-4o");
  });

  it("set returns false when value is unchanged", async () => {
    await fixture.dbStore.set("codex.model", "gpt-4o");
    const changed = await fixture.dbStore.set("codex.model", "gpt-4o");
    expect(changed).toBe(false);
  });

  it("set throws for an empty path expression", async () => {
    await expect(fixture.dbStore.set("", "value")).rejects.toThrow("at least one segment");
  });

  it("set persists across a new refresh() call", async () => {
    await fixture.dbStore.set("agent.max_turns", 42);
    // Simulate a re-load by calling refresh again
    fixture.dbStore.refresh();
    const map = fixture.dbStore.toMap();
    expect((map.agent as Record<string, unknown>)?.max_turns).toBe(42);
  });
});

describe("DbConfigStore — delete", () => {
  let fixture: DbFixture;

  beforeEach(async () => {
    fixture = await createDbFixture();
  });

  afterEach(async () => {
    await fixture.teardown();
  });

  it("delete removes an existing key and returns true", async () => {
    await fixture.dbStore.set("polling.interval_ms", 15000);
    const removed = await fixture.dbStore.delete("polling.interval_ms");
    expect(removed).toBe(true);
  });

  it("delete returns false for a non-existent key", async () => {
    const removed = await fixture.dbStore.delete("nonexistent.key");
    expect(removed).toBe(false);
  });

  it("delete throws for an empty path expression", async () => {
    await expect(fixture.dbStore.delete("")).rejects.toThrow("at least one segment");
  });
});

describe("DbConfigStore — subscribe / notify", () => {
  let fixture: DbFixture;

  beforeEach(async () => {
    fixture = await createDbFixture();
  });

  afterEach(async () => {
    await fixture.teardown();
  });

  it("subscriber is called when applyPatch changes the map", async () => {
    let callCount = 0;
    const unsubscribe = fixture.dbStore.subscribe(() => {
      callCount++;
    });

    await fixture.dbStore.applyPatch({ codex: { model: "gpt-4o" } });
    expect(callCount).toBe(1);

    unsubscribe();
    await fixture.dbStore.applyPatch({ codex: { model: "o4-mini" } });
    // After unsubscribing, count should not increase
    expect(callCount).toBe(1);
  });

  it("subscriber is called on set()", async () => {
    let callCount = 0;
    fixture.dbStore.subscribe(() => {
      callCount++;
    });

    await fixture.dbStore.set("polling.interval_ms", 5000);
    expect(callCount).toBe(1);
  });

  it("subscriber is called on delete()", async () => {
    await fixture.dbStore.set("polling.interval_ms", 5000);

    let callCount = 0;
    fixture.dbStore.subscribe(() => {
      callCount++;
    });

    await fixture.dbStore.delete("polling.interval_ms");
    expect(callCount).toBe(1);
  });
});

describe("DbConfigStore — getWorkflow / getConfig / validateDispatch", () => {
  let fixture: DbFixture;

  beforeEach(async () => {
    fixture = await createDbFixture();
  });

  afterEach(async () => {
    await fixture.teardown();
  });

  it("getWorkflow returns the current workflow with config map and promptTemplate", () => {
    const workflow = fixture.dbStore.getWorkflow();
    expect(typeof workflow.config).toBe("object");
    expect(typeof workflow.promptTemplate).toBe("string");
  });

  it("getConfig returns a ServiceConfig after refresh()", () => {
    const config = fixture.dbStore.getConfig();
    expect(typeof config).toBe("object");
    // ServiceConfig always has tracker and codex sections
    expect(config).toHaveProperty("tracker");
    expect(config).toHaveProperty("codex");
  });

  it("getMergedConfigMap returns a snapshot of the DB config", () => {
    const map = fixture.dbStore.getMergedConfigMap();
    expect(typeof map).toBe("object");
  });

  it("validateDispatch returns null or a ValidationError object", () => {
    const result = fixture.dbStore.validateDispatch();
    expect(result === null || (typeof result === "object" && "code" in result)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// config/coercion.ts — edge cases
// ---------------------------------------------------------------------------

describe("coercion helpers — edge cases", () => {
  it("asRecord returns empty object for null", async () => {
    const { asRecord } = await import("../../src/config/coercion.js");
    expect(asRecord(null)).toEqual({});
  });

  it("asRecord returns empty object for arrays", async () => {
    const { asRecord } = await import("../../src/config/coercion.js");
    expect(asRecord([1, 2, 3])).toEqual({});
  });

  it("asRecord returns the object itself when given a plain object", async () => {
    const { asRecord } = await import("../../src/config/coercion.js");
    expect(asRecord({ x: 1 })).toEqual({ x: 1 });
  });

  it("asString returns fallback when value is not a string", async () => {
    const { asString } = await import("../../src/config/coercion.js");
    expect(asString(42, "default")).toBe("default");
    expect(asString(null, "fallback")).toBe("fallback");
    expect(asString(undefined)).toBe(""); // default fallback is ""
  });

  it("asNumber returns fallback for non-finite values", async () => {
    const { asNumber } = await import("../../src/config/coercion.js");
    expect(asNumber(Infinity, 99)).toBe(99);
    expect(asNumber(NaN, 99)).toBe(99);
    expect(asNumber("42", 99)).toBe(99); // string, not number
    expect(asNumber(null, 0)).toBe(0);
  });

  it("asNumber returns the value when it is a finite number", async () => {
    const { asNumber } = await import("../../src/config/coercion.js");
    expect(asNumber(42, 0)).toBe(42);
    expect(asNumber(0, 99)).toBe(0);
  });

  it("asBoolean returns fallback for non-booleans", async () => {
    const { asBoolean } = await import("../../src/config/coercion.js");
    expect(asBoolean(1, false)).toBe(false);
    expect(asBoolean("true", true)).toBe(true); // fallback used — "true" is a string
    expect(asBoolean(null, false)).toBe(false);
  });

  it("asBoolean returns the value when it is boolean", async () => {
    const { asBoolean } = await import("../../src/config/coercion.js");
    expect(asBoolean(true, false)).toBe(true);
    expect(asBoolean(false, true)).toBe(false);
  });

  it("asStringMap filters out non-string values", async () => {
    const { asStringMap } = await import("../../src/config/coercion.js");
    const result = asStringMap({ a: "hello", b: 42, c: null, d: "world" });
    expect(result).toEqual({ a: "hello", d: "world" });
  });

  it("asStringMap returns empty object for non-objects", async () => {
    const { asStringMap } = await import("../../src/config/coercion.js");
    expect(asStringMap(null)).toEqual({});
    expect(asStringMap([])).toEqual({});
    expect(asStringMap("string")).toEqual({});
  });

  it("asNumberMap filters out non-finite and non-number values", async () => {
    const { asNumberMap } = await import("../../src/config/coercion.js");
    const result = asNumberMap({ a: 1, b: "2", c: Infinity, d: NaN, e: 3.5 });
    expect(result).toEqual({ a: 1, e: 3.5 });
  });

  it("asNumberMap returns empty object for non-objects", async () => {
    const { asNumberMap } = await import("../../src/config/coercion.js");
    expect(asNumberMap(null)).toEqual({});
    expect(asNumberMap([])).toEqual({});
  });

  it("asStringArray returns fallback when value is not an array", async () => {
    const { asStringArray } = await import("../../src/config/coercion.js");
    expect(asStringArray("nope", ["default"])).toEqual(["default"]);
    expect(asStringArray(null, ["fb"])).toEqual(["fb"]);
  });

  it("asStringArray returns fallback when all items are non-string or blank", async () => {
    const { asStringArray } = await import("../../src/config/coercion.js");
    expect(asStringArray([1, 2, 3], ["fb"])).toEqual(["fb"]);
    expect(asStringArray(["", "  ", ""], ["fb"])).toEqual(["fb"]);
  });

  it("asStringArray filters to non-blank strings", async () => {
    const { asStringArray } = await import("../../src/config/coercion.js");
    expect(asStringArray(["a", 1, "b", null, "c"], [])).toEqual(["a", "b", "c"]);
  });

  it("asRecordArray filters non-object items", async () => {
    const { asRecordArray } = await import("../../src/config/coercion.js");
    const result = asRecordArray([{ a: 1 }, "string", null, 42, { b: 2 }, [1, 2]]);
    expect(result).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it("asRecordArray returns empty array for non-array input", async () => {
    const { asRecordArray } = await import("../../src/config/coercion.js");
    expect(asRecordArray("nope")).toEqual([]);
    expect(asRecordArray(null)).toEqual([]);
  });

  it("asLooseStringArray returns only string items", async () => {
    const { asLooseStringArray } = await import("../../src/config/coercion.js");
    expect(asLooseStringArray(["a", 1, null, "b"])).toEqual(["a", "b"]);
  });

  it("asLooseStringArray returns empty array for non-array input", async () => {
    const { asLooseStringArray } = await import("../../src/config/coercion.js");
    expect(asLooseStringArray("nope")).toEqual([]);
    expect(asLooseStringArray(null)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// config/normalizers.ts — edge cases
// ---------------------------------------------------------------------------

describe("normalizers — edge cases", () => {
  it("asCodexAuthMode returns 'openai_login' for that exact string", async () => {
    const { asCodexAuthMode } = await import("../../src/config/normalizers.js");
    expect(asCodexAuthMode("openai_login", "openai_login")).toBe("openai_login");
  });

  it("asCodexAuthMode returns fallback for any other value", async () => {
    const { asCodexAuthMode } = await import("../../src/config/normalizers.js");
    expect(asCodexAuthMode("api_key", "openai_login")).toBe("openai_login");
    expect(asCodexAuthMode(null, "openai_login")).toBe("openai_login");
  });

  it("normalizeCodexProvider returns null for empty record", async () => {
    const { normalizeCodexProvider } = await import("../../src/config/normalizers.js");
    expect(normalizeCodexProvider({})).toBeNull();
    expect(normalizeCodexProvider(null)).toBeNull();
  });

  it("normalizeCodexProvider builds a full provider config from a valid record", async () => {
    const { normalizeCodexProvider } = await import("../../src/config/normalizers.js");
    const result = normalizeCodexProvider({
      id: "my-provider",
      name: "My Provider",
      base_url: "https://api.example.com",
      env_key: "MY_API_KEY",
      wire_api: "openai",
      requires_openai_auth: true,
    });
    expect(result).not.toBeNull();
    expect(result!.id).toBe("my-provider");
    expect(result!.wireApi).toBe("openai");
    expect(result!.requiresOpenaiAuth).toBe(true);
  });

  it("normalizeNotifications returns { slack: null } when no webhook_url", async () => {
    const { normalizeNotifications } = await import("../../src/config/normalizers.js");
    expect(normalizeNotifications({})).toEqual({ slack: null });
    expect(normalizeNotifications({ slack: {} })).toEqual({ slack: null });
    expect(normalizeNotifications(null)).toEqual({ slack: null });
  });

  it("normalizeNotifications builds slack config when webhook_url is set", async () => {
    const { normalizeNotifications } = await import("../../src/config/normalizers.js");
    const result = normalizeNotifications({
      slack: { webhook_url: "https://hooks.slack.com/services/T/B/X", verbosity: "verbose" },
    });
    expect(result.slack).not.toBeNull();
    expect(result.slack!.verbosity).toBe("verbose");
  });

  it("normalizeNotifications defaults to 'critical' verbosity for unknown values", async () => {
    const { normalizeNotifications } = await import("../../src/config/normalizers.js");
    const result = normalizeNotifications({
      slack: { webhook_url: "https://hooks.slack.com/services/T/B/X", verbosity: "unknown-level" },
    });
    expect(result.slack!.verbosity).toBe("critical");
  });

  it("normalizeGitHub returns null when no token", async () => {
    const { normalizeGitHub } = await import("../../src/config/normalizers.js");
    expect(normalizeGitHub({})).toBeNull();
    expect(normalizeGitHub(null)).toBeNull();
  });

  it("normalizeGitHub returns config when token is present", async () => {
    const { normalizeGitHub } = await import("../../src/config/normalizers.js");
    const result = normalizeGitHub({ token: "ghp_test123" });
    expect(result).not.toBeNull();
    expect(result!.token).toBe("ghp_test123");
    expect(result!.apiBaseUrl).toContain("api.github.com");
  });

  it("normalizeRepos filters repos missing repoUrl", async () => {
    const { normalizeRepos } = await import("../../src/config/normalizers.js");
    const result = normalizeRepos([
      { repo_url: "https://github.com/org/repo", identifier_prefix: "ORG" },
      { identifier_prefix: "NO-URL" }, // missing repo_url — filtered out
      { repo_url: "https://github.com/org/repo2", label: "my-label" },
    ]);
    expect(result).toHaveLength(2);
    expect(result[0].repoUrl).toBe("https://github.com/org/repo");
    expect(result[1].label).toBe("my-label");
  });

  it("normalizeRepos filters repos missing both identifierPrefix and label", async () => {
    const { normalizeRepos } = await import("../../src/config/normalizers.js");
    const result = normalizeRepos([
      { repo_url: "https://github.com/org/repo" }, // no identifier_prefix or label
    ]);
    expect(result).toHaveLength(0);
  });

  it("normalizeStateMachine returns null for empty stages", async () => {
    const { normalizeStateMachine } = await import("../../src/config/normalizers.js");
    expect(normalizeStateMachine({})).toBeNull();
    expect(normalizeStateMachine({ stages: [] })).toBeNull();
  });

  it("normalizeStateMachine filters stages with invalid kind", async () => {
    const { normalizeStateMachine } = await import("../../src/config/normalizers.js");
    const result = normalizeStateMachine({
      stages: [
        { name: "Backlog", kind: "backlog" },
        { name: "Invalid", kind: "bogus" }, // filtered out
        { name: "Done", kind: "terminal" },
      ],
      transitions: { Backlog: ["Done"] },
    });
    expect(result).not.toBeNull();
    expect(result!.stages).toHaveLength(2);
    expect(result!.stages.map((s) => s.name)).toEqual(["Backlog", "Done"]);
  });

  it("normalizeStateMachine returns null when all stages have invalid kind", async () => {
    const { normalizeStateMachine } = await import("../../src/config/normalizers.js");
    const result = normalizeStateMachine({
      stages: [{ name: "X", kind: "invalid" }],
    });
    expect(result).toBeNull();
  });

  it("normalizeTurnSandboxPolicy returns workspaceWrite defaults for empty object", async () => {
    const { normalizeTurnSandboxPolicy } = await import("../../src/config/normalizers.js");
    const result = normalizeTurnSandboxPolicy({});
    expect(result.type).toBe("workspaceWrite");
    expect(result.networkAccess).toBe(false);
  });

  it("normalizeTurnSandboxPolicy passes through non-empty policy", async () => {
    const { normalizeTurnSandboxPolicy } = await import("../../src/config/normalizers.js");
    const result = normalizeTurnSandboxPolicy({ type: "danger-full-access", custom: true });
    expect(result.type).toBe("danger-full-access");
    expect((result as Record<string, unknown>).custom).toBe(true);
  });

  it("normalizeApprovalPolicy returns 'never' for unknown string values", async () => {
    const { normalizeApprovalPolicy } = await import("../../src/config/normalizers.js");
    expect(normalizeApprovalPolicy("unknown-policy")).toBe("never");
  });

  it("normalizeApprovalPolicy maps legacy aliases correctly", async () => {
    const { normalizeApprovalPolicy } = await import("../../src/config/normalizers.js");
    expect(normalizeApprovalPolicy("auto-edit")).toBe("never");
    expect(normalizeApprovalPolicy("auto-approve")).toBe("never");
    expect(normalizeApprovalPolicy("suggest")).toBe("on-request");
    expect(normalizeApprovalPolicy("reject")).toBe("never");
  });

  it("normalizeApprovalPolicy passes through valid enum values", async () => {
    const { normalizeApprovalPolicy } = await import("../../src/config/normalizers.js");
    expect(normalizeApprovalPolicy("on-failure")).toBe("on-failure");
    expect(normalizeApprovalPolicy("on-request")).toBe("on-request");
    expect(normalizeApprovalPolicy("never")).toBe("never");
    expect(normalizeApprovalPolicy("untrusted")).toBe("untrusted");
  });

  it("normalizeApprovalPolicy returns default granular policy for empty object", async () => {
    const { normalizeApprovalPolicy } = await import("../../src/config/normalizers.js");
    const result = normalizeApprovalPolicy({});
    expect(typeof result).toBe("object");
    expect((result as Record<string, unknown>).granular).toBeDefined();
  });

  it("normalizeApprovalPolicy migrates legacy { reject: {...} } to { granular: {...} }", async () => {
    const { normalizeApprovalPolicy } = await import("../../src/config/normalizers.js");
    const result = normalizeApprovalPolicy({ reject: { sandbox_approval: false } });
    expect(typeof result).toBe("object");
    expect((result as Record<string, unknown>).granular).toEqual({ sandbox_approval: false });
  });

  it("normalizeApprovalPolicy passes through { granular: {...} } unchanged", async () => {
    const { normalizeApprovalPolicy } = await import("../../src/config/normalizers.js");
    const policy = { granular: { rules: false, sandbox_approval: true } };
    const result = normalizeApprovalPolicy(policy);
    expect(result).toEqual(policy);
  });

  it("asReasoningEffort returns fallback for null/undefined/empty string", async () => {
    const { asReasoningEffort } = await import("../../src/config/normalizers.js");
    expect(asReasoningEffort(null, "medium")).toBe("medium");
    expect(asReasoningEffort(undefined, "low")).toBe("low");
    expect(asReasoningEffort("", "high")).toBe("high");
  });

  it("asReasoningEffort returns fallback for non-string types", async () => {
    const { asReasoningEffort } = await import("../../src/config/normalizers.js");
    expect(asReasoningEffort(42, "medium")).toBe("medium");
    expect(asReasoningEffort(true, "low")).toBe("low");
  });

  it("asReasoningEffort returns fallback for unknown string values", async () => {
    const { asReasoningEffort } = await import("../../src/config/normalizers.js");
    expect(asReasoningEffort("turbo", "medium")).toBe("medium");
    expect(asReasoningEffort("ultra", null)).toBeNull();
  });

  it("asReasoningEffort returns valid effort levels", async () => {
    const { asReasoningEffort } = await import("../../src/config/normalizers.js");
    for (const level of ["none", "minimal", "low", "medium", "high", "xhigh"]) {
      expect(asReasoningEffort(level, null)).toBe(level);
    }
  });
});
