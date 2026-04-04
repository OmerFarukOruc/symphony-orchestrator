/**
 * Integration tests for the Setup API HTTP routes.
 *
 * Uses the shared `startTestServer` harness with real SecretsStore,
 * real ConfigOverlayStore, and a real temp directory. Exercises each
 * route that can be tested without live external API calls (GitHub,
 * Linear, OpenAI).
 *
 * Routes that require live credentials are noted inline:
 * // Requires live credentials — covered by tests/integration/live/
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ConfigOverlayStore } from "../../src/config/overlay.js";
import { SecretsStore } from "../../src/secrets/store.js";
import { buildSilentLogger, startTestServer, type TestServerResult } from "../helpers/http-server-harness.js";

const MASTER_KEY = "test-master-key-32chars-exactly!!";

let ctx: TestServerResult;
let tmpDir: string;
let secretsStore: SecretsStore;
let configOverlayStore: ConfigOverlayStore;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), "setup-api-int-"));
  const logger = buildSilentLogger();

  secretsStore = new SecretsStore(tmpDir, logger, { masterKey: MASTER_KEY });
  await secretsStore.start();

  configOverlayStore = new ConfigOverlayStore(path.join(tmpDir, "overlay.yaml"), logger);
  await configOverlayStore.start();

  ctx = await startTestServer({
    secretsStore,
    configOverlayStore,
  });
});

afterEach(async () => {
  await ctx.teardown();
  await configOverlayStore.stop();
  await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});

/* ── GET /api/v1/setup/status ────────────────────────────────────── */

describe("GET /api/v1/setup/status", () => {
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

  it("returns 200 with the correct shape", async () => {
    delete process.env.LINEAR_API_KEY;
    delete process.env.GITHUB_TOKEN;
    delete process.env.OPENAI_API_KEY;

    const response = await fetch(`${ctx.baseUrl}/api/v1/setup/status`);
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      configured: boolean;
      steps: Record<string, { done: boolean }>;
    };
    expect(typeof body.configured).toBe("boolean");
    expect(body.steps).toHaveProperty("masterKey");
    expect(body.steps).toHaveProperty("linearProject");
    expect(body.steps).toHaveProperty("repoRoute");
    expect(body.steps).toHaveProperty("openaiKey");
    expect(body.steps).toHaveProperty("githubToken");
  });

  it("reflects masterKey done when the SecretsStore is initialized", async () => {
    delete process.env.LINEAR_API_KEY;
    delete process.env.GITHUB_TOKEN;
    delete process.env.OPENAI_API_KEY;

    // secretsStore was started with a real master key — already initialized
    const response = await fetch(`${ctx.baseUrl}/api/v1/setup/status`);
    const body = (await response.json()) as { steps: { masterKey: { done: boolean } } };
    expect(body.steps.masterKey.done).toBe(true);
  });

  it("reflects linearProject done after storing tracker.project_slug", async () => {
    await configOverlayStore.set("tracker.project_slug", "risoluto");

    const response = await fetch(`${ctx.baseUrl}/api/v1/setup/status`);
    const body = (await response.json()) as { steps: { linearProject: { done: boolean } } };
    expect(body.steps.linearProject.done).toBe(true);
  });

  it("reflects repoRoute done after adding a repo to the overlay", async () => {
    await configOverlayStore.set("repos", [
      { repo_url: "https://github.com/test/repo", identifier_prefix: "TST", default_branch: "main" },
    ]);

    const response = await fetch(`${ctx.baseUrl}/api/v1/setup/status`);
    const body = (await response.json()) as { steps: { repoRoute: { done: boolean } } };
    expect(body.steps.repoRoute.done).toBe(true);
  });

  it("reflects openaiKey done when codex auth.json file exists on disk", async () => {
    delete process.env.OPENAI_API_KEY;

    // The server reads archiveDir from the harness dataDir — write auth.json there
    const codexAuthDir = path.join(ctx.dataDir, "codex-auth");
    await mkdir(codexAuthDir, { recursive: true });
    await writeFile(path.join(codexAuthDir, "auth.json"), "{}", "utf8");

    const response = await fetch(`${ctx.baseUrl}/api/v1/setup/status`);
    const body = (await response.json()) as { steps: { openaiKey: { done: boolean } } };
    expect(body.steps.openaiKey.done).toBe(true);
  });

  it("returns 405 for POST on the status route", async () => {
    const response = await fetch(`${ctx.baseUrl}/api/v1/setup/status`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(response.status).toBe(405);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("method_not_allowed");
  });
});

/* ── POST /api/v1/setup/master-key ──────────────────────────────── */

describe("POST /api/v1/setup/master-key", () => {
  it("returns 409 when master key is already set", async () => {
    // secretsStore is already initialized in beforeEach
    const response = await fetch(`${ctx.baseUrl}/api/v1/setup/master-key`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: "any-key" }),
    });
    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("already_initialized");
  });

  it("succeeds and writes master.key when store is not yet initialized", async () => {
    // Spin up a fresh server with an uninitialized store
    const freshTmpDir = await mkdtemp(path.join(os.tmpdir(), "setup-mk-fresh-"));
    const freshLogger = buildSilentLogger();
    const freshStore = new SecretsStore(freshTmpDir, freshLogger);
    await freshStore.startDeferred();

    const freshOverlay = new ConfigOverlayStore(path.join(freshTmpDir, "overlay.yaml"), freshLogger);
    await freshOverlay.start();

    const freshCtx = await startTestServer({
      secretsStore: freshStore,
      configOverlayStore: freshOverlay,
    });

    try {
      const response = await fetch(`${freshCtx.baseUrl}/api/v1/setup/master-key`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: "integration-master-key-abc" }),
      });
      expect(response.status).toBe(200);

      const body = (await response.json()) as { key: string };
      expect(body.key).toBe("integration-master-key-abc");

      // Verify file on disk
      const keyPath = path.join(freshCtx.dataDir, "master.key");
      const written = await readFile(keyPath, "utf8");
      expect(written).toBe("integration-master-key-abc");
    } finally {
      await freshCtx.teardown();
      await freshOverlay.stop();
      await rm(freshTmpDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("returns 405 for GET on the master-key route", async () => {
    const response = await fetch(`${ctx.baseUrl}/api/v1/setup/master-key`);
    expect(response.status).toBe(405);
  });
});

/* ── POST /api/v1/setup/reset ────────────────────────────────────── */

describe("POST /api/v1/setup/reset", () => {
  it("returns 200 with ok: true and wipes the secrets store", async () => {
    await secretsStore.set("LINEAR_API_KEY", "lin_to_be_wiped");

    const response = await fetch(`${ctx.baseUrl}/api/v1/setup/reset`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });

    // After reset, the store should be uninitialized and all keys gone
    expect(secretsStore.isInitialized()).toBe(false);
    expect(secretsStore.list()).toEqual([]);
  });

  it("writes an empty master.key file after reset", async () => {
    const response = await fetch(`${ctx.baseUrl}/api/v1/setup/reset`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(response.status).toBe(200);

    const keyPath = path.join(ctx.dataDir, "master.key");
    const contents = await readFile(keyPath, "utf8");
    expect(contents).toBe("");
  });

  it("returns 405 for GET on the reset route", async () => {
    const response = await fetch(`${ctx.baseUrl}/api/v1/setup/reset`);
    expect(response.status).toBe(405);
  });
});

/* ── POST /api/v1/setup/linear-project ──────────────────────────── */

describe("POST /api/v1/setup/linear-project", () => {
  it("returns 400 with missing_slug_id when slugId is absent", async () => {
    const response = await fetch(`${ctx.baseUrl}/api/v1/setup/linear-project`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("missing_slug_id");
  });

  it("returns 400 with missing_slug_id when slugId is not a string", async () => {
    const response = await fetch(`${ctx.baseUrl}/api/v1/setup/linear-project`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slugId: 42 }),
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("missing_slug_id");
  });

  it("stores tracker.project_slug and returns ok: true when slugId is valid", async () => {
    const response = await fetch(`${ctx.baseUrl}/api/v1/setup/linear-project`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slugId: "MY-PROJ" }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });

    const overlay = configOverlayStore.toMap();
    const tracker = overlay.tracker as Record<string, unknown> | undefined;
    expect(tracker?.project_slug).toBe("MY-PROJ");
  });

  it("returns 405 for GET on the linear-project route", async () => {
    const response = await fetch(`${ctx.baseUrl}/api/v1/setup/linear-project`);
    expect(response.status).toBe(405);
  });
});

/* ── POST /api/v1/setup/openai-key ──────────────────────────────── */

describe("POST /api/v1/setup/openai-key", () => {
  it("returns 400 with missing_key when key is absent", async () => {
    const response = await fetch(`${ctx.baseUrl}/api/v1/setup/openai-key`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("missing_key");
  });

  it("returns 400 with missing_key when key is an empty string", async () => {
    const response = await fetch(`${ctx.baseUrl}/api/v1/setup/openai-key`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: "" }),
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("missing_key");
  });

  // Requires live credentials — covered by tests/integration/live/
  // POST /api/v1/setup/openai-key with a valid key calls the OpenAI API

  it("returns 405 for GET on the openai-key route", async () => {
    const response = await fetch(`${ctx.baseUrl}/api/v1/setup/openai-key`);
    expect(response.status).toBe(405);
  });
});

/* ── POST /api/v1/setup/repo-route ──────────────────────────────── */

describe("POST /api/v1/setup/repo-route", () => {
  it("returns 400 with invalid_repo_url when repoUrl is missing", async () => {
    const response = await fetch(`${ctx.baseUrl}/api/v1/setup/repo-route`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ identifierPrefix: "FOO" }),
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("invalid_repo_url");
  });

  it("returns 400 with invalid_repo_url when repoUrl is not a GitHub URL", async () => {
    const response = await fetch(`${ctx.baseUrl}/api/v1/setup/repo-route`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ repoUrl: "https://gitlab.com/org/repo", identifierPrefix: "FOO" }),
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("invalid_repo_url");
  });

  it("returns 400 with missing_prefix when identifierPrefix is absent", async () => {
    const response = await fetch(`${ctx.baseUrl}/api/v1/setup/repo-route`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ repoUrl: "https://github.com/org/repo" }),
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("missing_prefix");
  });

  it("adds a repo route to the overlay and returns ok with the entry", async () => {
    const response = await fetch(`${ctx.baseUrl}/api/v1/setup/repo-route`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        repoUrl: "https://github.com/org/repo",
        identifierPrefix: "ORG",
        defaultBranch: "main",
      }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; route: Record<string, unknown> };
    expect(body.ok).toBe(true);
    expect(body.route.repo_url).toBe("https://github.com/org/repo");
    expect(body.route.identifier_prefix).toBe("ORG");

    // Verify persisted in overlay
    const overlay = configOverlayStore.toMap();
    expect(Array.isArray(overlay.repos)).toBe(true);
    expect((overlay.repos as unknown[]).length).toBe(1);
  });

  it("returns 405 for GET on the repo-route endpoint", async () => {
    const response = await fetch(`${ctx.baseUrl}/api/v1/setup/repo-route`);
    expect(response.status).toBe(405);
  });
});

/* ── GET /api/v1/setup/repo-routes ──────────────────────────────── */

describe("GET /api/v1/setup/repo-routes", () => {
  it("returns repo routes even when the secrets store is initialized", async () => {
    await configOverlayStore.set("repos", [
      { repo_url: "https://github.com/org/repo", identifier_prefix: "ORG", default_branch: "main" },
    ]);

    const response = await fetch(`${ctx.baseUrl}/api/v1/setup/repo-routes`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { routes: unknown[] };
    expect(body.routes).toHaveLength(1);
  });

  it("returns routes from overlay when store is uninitialized", async () => {
    const freshTmpDir = await mkdtemp(path.join(os.tmpdir(), "setup-routes-"));
    const freshLogger = buildSilentLogger();
    const freshStore = new SecretsStore(freshTmpDir, freshLogger);
    await freshStore.startDeferred();

    const freshOverlay = new ConfigOverlayStore(path.join(freshTmpDir, "overlay.yaml"), freshLogger);
    await freshOverlay.start();
    await freshOverlay.set("repos", [
      { repo_url: "https://github.com/org/repo", identifier_prefix: "ORG", default_branch: "main" },
    ]);

    const freshCtx = await startTestServer({
      secretsStore: freshStore,
      configOverlayStore: freshOverlay,
    });

    try {
      const response = await fetch(`${freshCtx.baseUrl}/api/v1/setup/repo-routes`);
      expect(response.status).toBe(200);
      const body = (await response.json()) as { routes: unknown[] };
      expect(body.routes.length).toBe(1);
    } finally {
      await freshCtx.teardown();
      await freshOverlay.stop();
      await rm(freshTmpDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("returns 405 for POST on the repo-routes collection route", async () => {
    const response = await fetch(`${ctx.baseUrl}/api/v1/setup/repo-routes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(response.status).toBe(405);
  });
});

/* ── DELETE /api/v1/setup/repo-route/:index ─────────────────────── */

describe("DELETE /api/v1/setup/repo-route/:index", () => {
  it("returns 400 with invalid_index when index is out of range", async () => {
    // No repos in overlay → index 0 is out of range
    const response = await fetch(`${ctx.baseUrl}/api/v1/setup/repo-route/0`, {
      method: "DELETE",
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("invalid_index");
  });

  it("removes the repo at the given index and returns updated routes", async () => {
    await configOverlayStore.set("repos", [
      { repo_url: "https://github.com/org/repo-a", identifier_prefix: "AAA", default_branch: "main" },
      { repo_url: "https://github.com/org/repo-b", identifier_prefix: "BBB", default_branch: "main" },
    ]);

    const response = await fetch(`${ctx.baseUrl}/api/v1/setup/repo-route/0`, {
      method: "DELETE",
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; routes: Array<{ identifier_prefix: string }> };
    expect(body.ok).toBe(true);
    expect(body.routes.length).toBe(1);
    expect(body.routes[0]?.identifier_prefix).toBe("BBB");
  });

  it("returns 405 for GET on the repo-route/:index route", async () => {
    const response = await fetch(`${ctx.baseUrl}/api/v1/setup/repo-route/0`);
    expect(response.status).toBe(405);
  });
});

/* ── POST /api/v1/setup/codex-auth ──────────────────────────────── */

describe("POST /api/v1/setup/codex-auth", () => {
  // Requires live credentials — covered by tests/integration/live/
  // POST /api/v1/setup/codex-auth triggers device flow or PKCE

  it("returns 405 for GET on the codex-auth route", async () => {
    const response = await fetch(`${ctx.baseUrl}/api/v1/setup/codex-auth`);
    expect(response.status).toBe(405);
  });
});

/* ── POST /api/v1/setup/github-token ────────────────────────────── */

describe("POST /api/v1/setup/github-token", () => {
  // Requires live credentials — covered by tests/integration/live/
  // POST /api/v1/setup/github-token verifies the token against GitHub API

  it("returns 405 for GET on the github-token route", async () => {
    const response = await fetch(`${ctx.baseUrl}/api/v1/setup/github-token`);
    expect(response.status).toBe(405);
  });
});
