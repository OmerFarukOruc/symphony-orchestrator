/**
 * Integration tests for setup handler functions.
 *
 * Uses real filesystem, real SecretsStore, and real ConfigOverlayStore —
 * no mocks. Focuses on filesystem side-effects and validation paths that
 * can be exercised without live external APIs (GitHub, Linear, OpenAI).
 *
 * Handlers that only make live external API calls are skipped here:
 * // Requires live credentials — covered by tests/integration/live/
 */

import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { Request, Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConfigOverlayStore } from "../../src/config/overlay.js";
import { SecretsStore } from "../../src/secrets/store.js";
import { handlePostMasterKey } from "../../src/setup/handlers/master-key.js";
import { handlePostReset } from "../../src/setup/handlers/reset.js";
import type { SetupApiDeps } from "../../src/setup/handlers/shared.js";
import { handleGetStatus } from "../../src/setup/handlers/status.js";
import { buildSilentLogger, buildStubOrchestrator } from "../helpers/http-server-harness.js";

const MASTER_KEY = "test-master-key-32chars-exactly!!";

/* ── minimal response stub ────────────────────────────────────────── */

interface StubResponse {
  _status: number;
  _body: unknown;
  _headers: Record<string, string>;
  status(code: number): StubResponse;
  json(body: unknown): StubResponse;
  setHeader(name: string, value: string): StubResponse;
}

function makeRes(): StubResponse {
  const res: StubResponse = {
    _status: 200,
    _body: undefined,
    _headers: {},
    status(code) {
      res._status = code;
      return res;
    },
    json(body) {
      res._body = body;
      return res;
    },
    setHeader(name, value) {
      res._headers[name] = value;
      return res;
    },
  };
  return res;
}

/* ── per-test setup ───────────────────────────────────────────────── */

let tmpDir: string;
let secretsStore: SecretsStore;
let configOverlayStore: ConfigOverlayStore;
let orchestrator: ReturnType<typeof buildStubOrchestrator>;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), "handlers-int-"));
  const logger = buildSilentLogger();

  secretsStore = new SecretsStore(tmpDir, logger, { masterKey: MASTER_KEY });
  await secretsStore.start();

  configOverlayStore = new ConfigOverlayStore(path.join(tmpDir, "overlay.yaml"), logger);
  await configOverlayStore.start();

  orchestrator = buildStubOrchestrator();
});

afterEach(async () => {
  await configOverlayStore.stop();
  await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});

function makeDeps(overrides: Partial<SetupApiDeps> = {}): SetupApiDeps {
  return {
    secretsStore,
    configOverlayStore,
    orchestrator,
    archiveDir: tmpDir,
    ...overrides,
  };
}

/* ── handlePostMasterKey ─────────────────────────────────────────── */

describe("handlePostMasterKey — real filesystem", () => {
  it("writes master.key to archiveDir and initializes the secrets store", async () => {
    // Start with an uninitialized store so handlePostMasterKey can proceed
    const freshStore = new SecretsStore(tmpDir, buildSilentLogger());
    await freshStore.startDeferred();

    const deps = makeDeps({ secretsStore: freshStore });
    const handler = handlePostMasterKey(deps);
    const res = makeRes();

    await handler({ body: { key: "my-integration-key-12345" } } as Request, res as unknown as Response);

    expect(res._status).toBe(200);
    expect((res._body as { key: string }).key).toBe("my-integration-key-12345");

    // Verify the file was written to the real filesystem
    const keyPath = path.join(tmpDir, "master.key");
    const written = await readFile(keyPath, "utf8");
    expect(written).toBe("my-integration-key-12345");

    // Verify the store is now initialized
    expect(freshStore.isInitialized()).toBe(true);
  });

  it("generates a random key and writes it when no key is provided in body", async () => {
    const freshStore = new SecretsStore(tmpDir, buildSilentLogger());
    await freshStore.startDeferred();

    const deps = makeDeps({ secretsStore: freshStore });
    const handler = handlePostMasterKey(deps);
    const res = makeRes();

    await handler({ body: {} } as Request, res as unknown as Response);

    expect(res._status).toBe(200);
    const generatedKey = (res._body as { key: string }).key;
    // randomBytes(32).toString("hex") produces a 64-char hex string
    expect(generatedKey).toMatch(/^[a-f0-9]{64}$/u);

    const keyPath = path.join(tmpDir, "master.key");
    const written = await readFile(keyPath, "utf8");
    expect(written).toBe(generatedKey);
  });

  it("returns 409 when the secrets store is already initialized", async () => {
    // secretsStore was started in beforeEach → already initialized
    const deps = makeDeps();
    const handler = handlePostMasterKey(deps);
    const res = makeRes();

    await handler({ body: { key: "should-not-write" } } as Request, res as unknown as Response);

    expect(res._status).toBe(409);
    expect((res._body as { error: { code: string } }).error.code).toBe("already_initialized");
  });

  it("writes the master.key file with mode 0o600", async () => {
    const freshStore = new SecretsStore(tmpDir, buildSilentLogger());
    await freshStore.startDeferred();

    const deps = makeDeps({ secretsStore: freshStore });
    const handler = handlePostMasterKey(deps);
    const res = makeRes();

    await handler({ body: { key: "perm-test-key" } } as Request, res as unknown as Response);

    const keyPath = path.join(tmpDir, "master.key");
    const fileStat = await stat(keyPath);
    // Check that group/other bits are cleared — file mode 0o100600 on Linux
    expect(fileStat.mode & 0o777).toBe(0o600);
  });
});

/* ── handlePostReset ─────────────────────────────────────────────── */

describe("handlePostReset — real filesystem + real stores", () => {
  it("clears all secrets from the store and resets the secrets store", async () => {
    await secretsStore.set("LINEAR_API_KEY", "lin_key");
    await secretsStore.set("OPENAI_API_KEY", "sk-key");

    const deps = makeDeps();
    const handler = handlePostReset(deps);
    const res = makeRes();

    await handler({} as Request, res as unknown as Response);

    expect(res._status).toBe(200);
    expect(res._body).toEqual({ ok: true });
    expect(secretsStore.isInitialized()).toBe(false);
    expect(secretsStore.list()).toEqual([]);
  });

  it("writes an empty master.key file after reset", async () => {
    const keyPath = path.join(tmpDir, "master.key");

    const deps = makeDeps();
    const handler = handlePostReset(deps);
    const res = makeRes();

    await handler({} as Request, res as unknown as Response);

    const contents = await readFile(keyPath, "utf8");
    expect(contents).toBe("");
  });

  it("sets codex.auth.mode and codex.auth.source_home to empty strings in the overlay", async () => {
    await configOverlayStore.set("codex.auth.mode", "api_key");
    await configOverlayStore.set("codex.auth.source_home", "/some/path");

    const deps = makeDeps();
    const handler = handlePostReset(deps);
    const res = makeRes();

    await handler({} as Request, res as unknown as Response);

    const overlay = configOverlayStore.toMap();
    const codex = overlay.codex as Record<string, unknown> | undefined;
    const auth = codex?.auth as Record<string, unknown> | undefined;
    expect(auth?.mode).toBe("");
    expect(auth?.source_home).toBe("");
  });

  it("calls orchestrator.stop before clearing secrets", async () => {
    const callOrder: string[] = [];
    const spiedOrchestrator = buildStubOrchestrator({
      stop: vi.fn(async () => {
        callOrder.push("stop");
      }),
    });
    vi.spyOn(secretsStore, "delete").mockImplementation(async () => {
      callOrder.push("delete");
      return true;
    });

    const deps = makeDeps({ orchestrator: spiedOrchestrator });
    const handler = handlePostReset(deps);
    const res = makeRes();

    await handler({} as Request, res as unknown as Response);

    expect(callOrder[0]).toBe("stop");
  });

  it("returns 500 with reset_failed code when orchestrator.stop throws", async () => {
    const failingOrchestrator = buildStubOrchestrator({
      stop: vi.fn(async () => {
        throw new Error("orchestrator stop failure");
      }),
    });

    const deps = makeDeps({ orchestrator: failingOrchestrator });
    const handler = handlePostReset(deps);
    const res = makeRes();

    await handler({} as Request, res as unknown as Response);

    expect(res._status).toBe(500);
    expect((res._body as { error: { code: string; message: string } }).error.code).toBe("reset_failed");
    expect((res._body as { error: { code: string; message: string } }).error.message).toBe("orchestrator stop failure");
  });
});

/* ── handleGetStatus ─────────────────────────────────────────────── */

describe("handleGetStatus — real stores", () => {
  const savedLinearKey = process.env.LINEAR_API_KEY;
  const savedGithubToken = process.env.GITHUB_TOKEN;
  const savedOpenaiKey = process.env.OPENAI_API_KEY;

  afterEach(() => {
    if (savedLinearKey === undefined) {
      delete process.env.LINEAR_API_KEY;
    } else {
      process.env.LINEAR_API_KEY = savedLinearKey;
    }
    if (savedGithubToken === undefined) {
      delete process.env.GITHUB_TOKEN;
    } else {
      process.env.GITHUB_TOKEN = savedGithubToken;
    }
    if (savedOpenaiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = savedOpenaiKey;
    }
  });

  it("returns all steps incomplete when nothing is configured", () => {
    delete process.env.LINEAR_API_KEY;
    delete process.env.GITHUB_TOKEN;
    delete process.env.OPENAI_API_KEY;

    // Use a fresh, uninitialized store so masterKey step is false
    const freshStore = new SecretsStore(tmpDir, buildSilentLogger());
    const deps = makeDeps({ secretsStore: freshStore });
    const handler = handleGetStatus(deps);
    const res = makeRes();

    handler({} as Request, res as unknown as Response);

    expect(res._status).toBe(200);
    expect(res._body).toEqual({
      configured: false,
      steps: {
        masterKey: { done: false },
        linearProject: { done: false },
        repoRoute: { done: false },
        openaiKey: { done: false },
        githubToken: { done: false },
      },
    });
  });

  it("marks masterKey done when the real SecretsStore is initialized", () => {
    delete process.env.LINEAR_API_KEY;
    delete process.env.GITHUB_TOKEN;
    delete process.env.OPENAI_API_KEY;

    // secretsStore from beforeEach is already initialized via .start()
    const deps = makeDeps();
    const handler = handleGetStatus(deps);
    const res = makeRes();

    handler({} as Request, res as unknown as Response);

    expect((res._body as { steps: { masterKey: { done: boolean } } }).steps.masterKey.done).toBe(true);
  });

  it("marks linearProject done when LINEAR_API_KEY is stored in the real SecretsStore", async () => {
    delete process.env.LINEAR_API_KEY;

    await secretsStore.set("LINEAR_API_KEY", "lin_real_key");

    const deps = makeDeps();
    const handler = handleGetStatus(deps);
    const res = makeRes();

    handler({} as Request, res as unknown as Response);

    expect((res._body as { steps: { linearProject: { done: boolean } } }).steps.linearProject.done).toBe(true);
  });

  it("marks githubToken done when GITHUB_TOKEN is stored in the real SecretsStore", async () => {
    delete process.env.GITHUB_TOKEN;

    await secretsStore.set("GITHUB_TOKEN", "ghp_real_token");

    const deps = makeDeps();
    const handler = handleGetStatus(deps);
    const res = makeRes();

    handler({} as Request, res as unknown as Response);

    expect((res._body as { steps: { githubToken: { done: boolean } } }).steps.githubToken.done).toBe(true);
  });

  it("marks repoRoute done when repos is set in the real ConfigOverlayStore", async () => {
    await configOverlayStore.set("repos", [
      { repo_url: "https://github.com/org/repo", identifier_prefix: "ORG", default_branch: "main" },
    ]);

    const deps = makeDeps();
    const handler = handleGetStatus(deps);
    const res = makeRes();

    handler({} as Request, res as unknown as Response);

    expect((res._body as { steps: { repoRoute: { done: boolean } } }).steps.repoRoute.done).toBe(true);
  });

  it("marks configured true only when both masterKey and linearProject are done", async () => {
    delete process.env.LINEAR_API_KEY;

    // secretsStore is initialized (masterKey done)
    await secretsStore.set("LINEAR_API_KEY", "lin_real_key");

    const deps = makeDeps();
    const handler = handleGetStatus(deps);
    const res = makeRes();

    handler({} as Request, res as unknown as Response);

    expect((res._body as { configured: boolean }).configured).toBe(true);
  });

  it("marks configured false when masterKey is done but linearProject is not", () => {
    delete process.env.LINEAR_API_KEY;

    // secretsStore is initialized but no LINEAR_API_KEY stored
    const deps = makeDeps();
    const handler = handleGetStatus(deps);
    const res = makeRes();

    handler({} as Request, res as unknown as Response);

    expect((res._body as { configured: boolean }).configured).toBe(false);
  });
});
