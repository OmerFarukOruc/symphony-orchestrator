import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import Fastify, { type FastifyInstance } from "fastify";
import YAML from "yaml";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { registerConfigApi } from "../../src/config/api.js";
import { ConfigOverlayStore } from "../../src/config/overlay.js";
import { ConfigStore } from "../../src/config/store.js";
import { createLogger } from "../../src/core/logger.js";
import { registerSecretsApi } from "../../src/secrets/api.js";
import { SecretsStore } from "../../src/secrets/store.js";

const tempDirs: string[] = [];
const TEST_MASTER_KEY = "secrets-config-characterization-master-key";
let originalEnv = { ...process.env };

function createTempDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "symphony-secrets-config-characterization-"));
  tempDirs.push(dir);
  return dir;
}

function writeWorkflow(
  rootDir: string,
  config: Record<string, unknown>,
  promptTemplate = "Characterize secrets and config.",
): string {
  const workflowPath = path.join(rootDir, "WORKFLOW.md");
  writeFileSync(workflowPath, `---\n${YAML.stringify(config)}---\n${promptTemplate}\n`, "utf8");
  return workflowPath;
}

async function startFastifyServer(app: FastifyInstance): Promise<{ baseUrl: string }> {
  const address = await app.listen({ port: 0, host: "127.0.0.1" });
  return { baseUrl: address };
}

beforeEach(() => {
  originalEnv = { ...process.env };
});

afterEach(() => {
  process.env = originalEnv;
});

afterAll(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("secrets/config characterization", () => {
  it("records current SecretsStore restart, sorted listing, and durable delete behavior for valid API-style keys", async () => {
    const baseDir = createTempDir();
    const store = new SecretsStore(baseDir, createLogger(), { masterKey: TEST_MASTER_KEY });
    await store.start();

    await store.set("OMEGA_KEY", "omega-secret");
    await store.set("ALPHA.KEY", "alpha-secret");
    await store.set("BETA:KEY", "beta-secret");

    const restartedStore = new SecretsStore(baseDir, createLogger(), { masterKey: TEST_MASTER_KEY });
    await restartedStore.start();

    expect(restartedStore.get("ALPHA.KEY")).toBe("alpha-secret");
    expect(restartedStore.get("BETA:KEY")).toBe("beta-secret");
    expect(restartedStore.get("OMEGA_KEY")).toBe("omega-secret");
    expect(restartedStore.list()).toEqual(["ALPHA.KEY", "BETA:KEY", "OMEGA_KEY"]);

    expect(await restartedStore.delete("BETA:KEY")).toBe(true);
    expect(await restartedStore.delete("MISSING_KEY")).toBe(false);
    expect(restartedStore.get("BETA:KEY")).toBeNull();
    expect(restartedStore.list()).toEqual(["ALPHA.KEY", "OMEGA_KEY"]);

    const afterDeleteRestartStore = new SecretsStore(baseDir, createLogger(), { masterKey: TEST_MASTER_KEY });
    await afterDeleteRestartStore.start();
    expect(afterDeleteRestartStore.get("BETA:KEY")).toBeNull();
    expect(afterDeleteRestartStore.list()).toEqual(["ALPHA.KEY", "OMEGA_KEY"]);
  });

  it("records current secret API validation error shapes for invalid keys, values, and missing keys", async () => {
    const baseDir = createTempDir();
    const secretsStore = new SecretsStore(baseDir, createLogger(), { masterKey: TEST_MASTER_KEY });
    await secretsStore.start();

    const app = Fastify({ logger: false });
    registerSecretsApi(app, { secretsStore });

    const { baseUrl } = await startFastifyServer(app);
    try {
      const invalidKeyResponse = await fetch(`${baseUrl}/api/v1/secrets/invalid key`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value: "x" }),
      });
      expect(invalidKeyResponse.status).toBe(400);
      expect(await invalidKeyResponse.json()).toEqual({
        error: {
          code: "invalid_secret_key",
          message: "secret key must match /^[A-Za-z0-9._:-]+$/",
        },
      });

      const invalidValueResponse = await fetch(`${baseUrl}/api/v1/secrets/VALID_KEY`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value: "" }),
      });
      expect(invalidValueResponse.status).toBe(400);
      expect(await invalidValueResponse.json()).toEqual({
        error: {
          code: "invalid_secret_value",
          message: "secret value must be a non-empty string",
        },
      });

      const missingKeyResponse = await fetch(`${baseUrl}/api/v1/secrets/MISSING_KEY`, {
        method: "DELETE",
      });
      expect(missingKeyResponse.status).toBe(404);
      expect(await missingKeyResponse.json()).toEqual({
        error: {
          code: "secret_not_found",
          message: "secret key not found",
        },
      });
    } finally {
      await app.close();
    }
  });

  it("records current MASTER_KEY requirement when SecretsStore starts without explicit or env key material", async () => {
    const baseDir = createTempDir();
    delete process.env.MASTER_KEY;

    const store = new SecretsStore(baseDir, createLogger());

    await expect(store.start()).rejects.toThrow("MASTER_KEY is required to initialize SecretsStore");
    expect(store.isInitialized()).toBe(false);
  });

  it("records current workflow parsing, overlay precedence, env interpolation, and derived ServiceConfig shape", async () => {
    const baseDir = createTempDir();
    const overlayPath = path.join(baseDir, "config", "overlay.yaml");
    const workflowConfig = {
      tracker: {
        kind: "linear",
        api_key: "$SECRET:LINEAR_API_KEY",
        endpoint: "https://api.linear.app/graphql",
        project_slug: "BASE-SLUG",
        active_states: ["In Progress"],
        terminal_states: ["Done"],
      },
      agent: {
        max_concurrent_agents: 2,
      },
      codex: {
        command: "codex app-server",
        model: "gpt-5.4",
        auth: {
          mode: "api_key",
          source_home: "~/.codex",
        },
        provider: {
          env_key: "OPENAI_API_KEY",
          base_url: "https://api.openai.com/v1",
        },
      },
      workspace: {
        root: "$TMPDIR/workflow-workspaces",
      },
      server: {
        port: 4012,
      },
    } satisfies Record<string, unknown>;
    const workflowPath = writeWorkflow(baseDir, workflowConfig);
    const overlayMap = {
      tracker: { project_slug: "$LINEAR_PROJECT_SLUG" },
      workspace: { root: "$TMPDIR/overlay-workspaces" },
      codex: { model: "gpt-5.5" },
    } satisfies Record<string, unknown>;

    process.env.LINEAR_PROJECT_SLUG = "OVERLAY-SLUG";
    process.env.OPENAI_API_KEY = "sk-env-provider";
    process.env.TMPDIR = baseDir;

    const overlayStore = new ConfigOverlayStore(overlayPath, createLogger());
    await overlayStore.start();
    await overlayStore.replace(overlayMap);

    const secretsStore = new SecretsStore(baseDir, createLogger(), { masterKey: TEST_MASTER_KEY });
    await secretsStore.start();
    await secretsStore.set("LINEAR_API_KEY", "lin-secret-from-store");

    const configStore = new ConfigStore(workflowPath, createLogger(), { overlayStore, secretsStore });
    await configStore.start();

    expect(configStore.getWorkflow()).toEqual({
      config: workflowConfig,
      promptTemplate: "Characterize secrets and config.",
    });
    expect(configStore.getMergedConfigMap()).toEqual({
      ...workflowConfig,
      tracker: { ...(workflowConfig.tracker as Record<string, unknown>), project_slug: "$LINEAR_PROJECT_SLUG" },
      workspace: { root: "$TMPDIR/overlay-workspaces" },
      codex: { ...(workflowConfig.codex as Record<string, unknown>), model: "gpt-5.5" },
    });
    expect(configStore.getConfig()).toMatchObject({
      tracker: {
        kind: "linear",
        apiKey: "lin-secret-from-store",
        endpoint: "https://api.linear.app/graphql",
        projectSlug: "OVERLAY-SLUG",
        activeStates: ["In Progress"],
        terminalStates: ["Done"],
      },
      agent: {
        maxConcurrentAgents: 2,
      },
      codex: {
        command: "codex app-server",
        model: "gpt-5.5",
        auth: {
          mode: "api_key",
        },
        provider: {
          envKey: "OPENAI_API_KEY",
          baseUrl: "https://api.openai.com/v1",
        },
      },
      workspace: {
        root: path.join(baseDir, "overlay-workspaces"),
      },
      server: {
        port: 4012,
      },
    });
    expect(configStore.validateDispatch()).toBe(null);

    await configStore.stop();
    await overlayStore.stop();
  });

  it("records current config validation error codes for invalid tracker config and missing required fields", async () => {
    const invalidTrackerDir = createTempDir();
    process.env.OPENAI_API_KEY = "sk-present";

    const invalidTrackerWorkflowPath = writeWorkflow(invalidTrackerDir, {
      tracker: {
        kind: "github",
        api_key: "lin-present",
        project_slug: "TEST",
        active_states: ["In Progress"],
        terminal_states: ["Done"],
      },
      codex: {
        command: "codex app-server",
      },
    });
    const invalidTrackerStore = new ConfigStore(invalidTrackerWorkflowPath, createLogger());
    await invalidTrackerStore.start();
    expect(invalidTrackerStore.validateDispatch()).toEqual({
      code: "invalid_tracker_kind",
      message: 'tracker.kind must be "linear"; received "github"',
    });
    await invalidTrackerStore.stop();

    const missingFieldDir = createTempDir();
    delete process.env.LINEAR_PROJECT_SLUG;
    process.env.OPENAI_API_KEY = "sk-present";

    const missingFieldWorkflowPath = writeWorkflow(missingFieldDir, {
      tracker: {
        kind: "linear",
        api_key: "$LINEAR_API_KEY",
        project_slug: "$LINEAR_PROJECT_SLUG",
        active_states: ["In Progress"],
        terminal_states: ["Done"],
      },
      codex: {
        command: "codex app-server",
      },
    });
    const secretsStore = new SecretsStore(missingFieldDir, createLogger(), { masterKey: TEST_MASTER_KEY });
    await secretsStore.start();
    await secretsStore.set("LINEAR_API_KEY", "lin-from-secret");

    const missingFieldStore = new ConfigStore(missingFieldWorkflowPath, createLogger(), { secretsStore });
    await missingFieldStore.start();
    expect(missingFieldStore.validateDispatch()).toEqual({
      code: "missing_tracker_project_slug",
      message: "tracker.project_slug is required when tracker.kind is linear",
    });
    await missingFieldStore.stop();
  });

  it("records current config API error response shapes for invalid overlay payloads and unknown paths", async () => {
    const baseDir = createTempDir();
    const overlayStore = new ConfigOverlayStore(path.join(baseDir, "config", "overlay.yaml"), createLogger());
    await overlayStore.start();

    const app = Fastify({ logger: false });
    registerConfigApi(app, {
      getEffectiveConfig: () => ({}),
      configOverlayStore: overlayStore,
    });

    const { baseUrl } = await startFastifyServer(app);
    try {
      const invalidPatchResponse = await fetch(`${baseUrl}/api/v1/config/overlay/server.port`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wrong: 42 }),
      });
      expect(invalidPatchResponse.status).toBe(400);
      expect(await invalidPatchResponse.json()).toEqual({
        error: {
          code: "invalid_overlay_payload",
          message: "PATCH body must contain a value field",
        },
      });

      const unknownDeleteResponse = await fetch(`${baseUrl}/api/v1/config/overlay/unknown.path`, {
        method: "DELETE",
      });
      expect(unknownDeleteResponse.status).toBe(404);
      expect(await unknownDeleteResponse.json()).toEqual({
        error: {
          code: "overlay_path_not_found",
          message: "overlay path not found",
        },
      });
    } finally {
      await overlayStore.stop();
      await app.close();
    }
  });
});
