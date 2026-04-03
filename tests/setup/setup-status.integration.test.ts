/**
 * Integration tests for setup-status.ts functions.
 *
 * Uses real filesystem (mkdtemp) and a real SecretsStore — no mocks.
 * Each test gets its own temp dir created in beforeEach and cleaned up
 * in afterEach.
 */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SecretsStore } from "../../src/secrets/store.js";
import {
  hasCodexAuthFile,
  hasLinearCredentials,
  hasRepoRoutes,
  readProjectSlug,
} from "../../src/setup/setup-status.js";
import { buildSilentLogger } from "../helpers/http-server-harness.js";

const MASTER_KEY = "test-master-key-32chars-exactly!!";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), "setup-status-int-"));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});

/* ── hasCodexAuthFile ────────────────────────────────────────────── */

describe("hasCodexAuthFile — real filesystem", () => {
  it("returns false when archiveDir/codex-auth/auth.json does not exist", () => {
    expect(hasCodexAuthFile(tmpDir, {})).toBe(false);
  });

  it("returns true when archiveDir/codex-auth/auth.json exists", async () => {
    const codexAuthDir = path.join(tmpDir, "codex-auth");
    await mkdir(codexAuthDir, { recursive: true });
    await writeFile(path.join(codexAuthDir, "auth.json"), JSON.stringify({ token: "t" }), "utf8");

    expect(hasCodexAuthFile(tmpDir, {})).toBe(true);
  });

  it("returns false when overlay sets codex.auth.mode to empty string (short-circuit)", () => {
    expect(hasCodexAuthFile(tmpDir, { "codex.auth.mode": "" })).toBe(false);
  });

  it("returns false when overlay sets codex.auth.source_home to empty string (short-circuit)", () => {
    expect(hasCodexAuthFile(tmpDir, { "codex.auth.source_home": "" })).toBe(false);
  });

  it("returns true when nested overlay codex.auth.source_home points to a real dir with auth.json", async () => {
    const customAuthDir = path.join(tmpDir, "custom-auth");
    await mkdir(customAuthDir, { recursive: true });
    await writeFile(path.join(customAuthDir, "auth.json"), "{}", "utf8");

    const overlay = { codex: { auth: { source_home: customAuthDir } } };
    expect(hasCodexAuthFile(tmpDir, overlay)).toBe(true);
  });

  it("returns true when flat key codex.auth.source_home points to a real dir with auth.json", async () => {
    const customAuthDir = path.join(tmpDir, "flat-auth");
    await mkdir(customAuthDir, { recursive: true });
    await writeFile(path.join(customAuthDir, "auth.json"), "{}", "utf8");

    const overlay = { "codex.auth.source_home": customAuthDir };
    expect(hasCodexAuthFile(tmpDir, overlay)).toBe(true);
  });

  it("returns false when overlay source_home points to a dir that does not contain auth.json", async () => {
    const emptyDir = path.join(tmpDir, "no-auth-here");
    await mkdir(emptyDir, { recursive: true });

    const overlay = { "codex.auth.source_home": emptyDir };
    expect(hasCodexAuthFile(tmpDir, overlay)).toBe(false);
  });
});

/* ── hasLinearCredentials ────────────────────────────────────────── */

describe("hasLinearCredentials — real SecretsStore", () => {
  const savedLinearKey = process.env.LINEAR_API_KEY;

  afterEach(() => {
    if (savedLinearKey === undefined) {
      delete process.env.LINEAR_API_KEY;
    } else {
      process.env.LINEAR_API_KEY = savedLinearKey;
    }
  });

  async function makeStore(): Promise<SecretsStore> {
    const store = new SecretsStore(tmpDir, buildSilentLogger(), { masterKey: MASTER_KEY });
    await store.start();
    return store;
  }

  it("returns false when SecretsStore has no LINEAR_API_KEY and env var is unset", async () => {
    delete process.env.LINEAR_API_KEY;
    const store = await makeStore();
    expect(hasLinearCredentials(store)).toBe(false);
  });

  it("returns true when SecretsStore.get('LINEAR_API_KEY') returns a non-empty string", async () => {
    delete process.env.LINEAR_API_KEY;
    const store = await makeStore();
    await store.set("LINEAR_API_KEY", "lin_api_realkey");
    expect(hasLinearCredentials(store)).toBe(true);
  });

  it("returns true when process.env.LINEAR_API_KEY is set even though store is empty", async () => {
    process.env.LINEAR_API_KEY = "env-key-value";
    const store = await makeStore();
    expect(hasLinearCredentials(store)).toBe(true);
  });

  it("returns false when env var is empty string and store has no key", async () => {
    process.env.LINEAR_API_KEY = "";
    const store = await makeStore();
    expect(hasLinearCredentials(store)).toBe(false);
  });
});

/* ── readProjectSlug ─────────────────────────────────────────────── */

describe("readProjectSlug", () => {
  it("returns undefined for an empty overlay", () => {
    expect(readProjectSlug({})).toBeUndefined();
  });

  it("returns slug from flat key tracker.project_slug", () => {
    expect(readProjectSlug({ "tracker.project_slug": "my-proj" })).toBe("my-proj");
  });

  it("returns slug from nested tracker → project_slug", () => {
    expect(readProjectSlug({ tracker: { project_slug: "nested-proj" } })).toBe("nested-proj");
  });

  it("returns undefined when the value is a number (not a string)", () => {
    expect(readProjectSlug({ tracker: { project_slug: 42 } })).toBeUndefined();
  });

  it("returns undefined when the value is an array (not a string)", () => {
    expect(readProjectSlug({ tracker: { project_slug: ["a"] } })).toBeUndefined();
  });
});

/* ── hasRepoRoutes ───────────────────────────────────────────────── */

describe("hasRepoRoutes", () => {
  it("returns false when repos is undefined", () => {
    expect(hasRepoRoutes({})).toBe(false);
  });

  it("returns false when repos is an empty array", () => {
    expect(hasRepoRoutes({ repos: [] })).toBe(false);
  });

  it("returns true when repos is a non-empty array", () => {
    expect(hasRepoRoutes({ repos: [{ repo_url: "https://github.com/org/repo" }] })).toBe(true);
  });

  it("returns false when repos is not an array (string)", () => {
    expect(hasRepoRoutes({ repos: "https://github.com/org/repo" })).toBe(false);
  });

  it("returns false when repos is null", () => {
    expect(hasRepoRoutes({ repos: null })).toBe(false);
  });
});
