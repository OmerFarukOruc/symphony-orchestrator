import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createServices } from "../../src/cli/services.js";
import { ConfigStore } from "../../src/config/store.js";
import type { ConfigOverlayPort } from "../../src/config/overlay.js";
import { DefaultWebhookHealthTracker } from "../../src/webhook/health-tracker.js";
import { WebhookRegistrar } from "../../src/webhook/registrar.js";
import { SqliteWebhookInbox } from "../../src/persistence/sqlite/webhook-inbox.js";
import { initPersistenceRuntime, type PersistenceRuntime } from "../../src/persistence/sqlite/runtime.js";
import type { ServiceConfig, WebhookConfig } from "../../src/core/types.js";
import { createMockLogger } from "../helpers.js";

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "risoluto-services-int-"));
  tempDirs.push(dir);
  return dir;
}

function createServiceConfig(root: string, webhook?: WebhookConfig | null): ServiceConfig {
  return {
    tracker: {
      kind: "linear",
      apiKey: "linear-token",
      endpoint: "https://api.linear.app/graphql",
      projectSlug: "EXAMPLE",
      activeStates: ["In Progress"],
      terminalStates: ["Done", "Canceled"],
    },
    polling: { intervalMs: 30000 },
    workspace: {
      root: path.join(root, "workspaces"),
      strategy: "directory",
      branchPrefix: "risoluto/",
      hooks: {
        afterCreate: null,
        beforeRun: null,
        afterRun: null,
        beforeRemove: null,
        timeoutMs: 1000,
      },
    },
    agent: {
      maxConcurrentAgents: 1,
      maxConcurrentAgentsByState: {},
      maxTurns: 1,
      maxRetryBackoffMs: 300000,
      maxContinuationAttempts: 5,
      successState: null,
      stallTimeoutMs: 10000,
    },
    codex: {
      command: "codex app-server",
      model: "gpt-5.4",
      reasoningEffort: "high",
      approvalPolicy: "never",
      threadSandbox: "danger-full-access",
      personality: "friendly",
      turnSandboxPolicy: { type: "dangerFullAccess" },
      selfReview: false,
      readTimeoutMs: 1000,
      turnTimeoutMs: 10000,
      drainTimeoutMs: 0,
      startupTimeoutMs: 5000,
      stallTimeoutMs: 10000,
      structuredOutput: false,
      auth: {
        mode: "api_key",
        sourceHome: path.join(root, "codex-home"),
      },
      provider: null,
      sandbox: {
        image: "risoluto-codex:latest",
        network: "",
        security: { noNewPrivileges: true, dropCapabilities: true, gvisor: false, seccompProfile: "" },
        resources: { memory: "4g", memoryReservation: "1g", memorySwap: "4g", cpus: "2.0", tmpfsSize: "512m" },
        extraMounts: [],
        envPassthrough: [],
        logs: { driver: "json-file", maxSize: "50m", maxFile: 3 },
        egressAllowlist: [],
      },
    },
    server: { port: 4000 },
    webhook: webhook ?? null,
  };
}

function createConfigStore(config: ServiceConfig): ConfigStore {
  return {
    getConfig: () => config,
    getMergedConfigMap: () => ({ system: { selectedTemplateId: null } }),
    subscribe: () => () => undefined,
  } as unknown as ConfigStore;
}

function createOverlayStore(): ConfigOverlayPort {
  return {
    toMap: () => ({}),
    subscribe: () => () => undefined,
  };
}

function createSecretsStore(initial: Record<string, string> = {}) {
  const secrets = new Map(Object.entries(initial));
  return {
    get(key: string) {
      return secrets.get(key) ?? null;
    },
    async set(key: string, value: string) {
      secrets.set(key, value);
    },
    async delete(key: string) {
      secrets.delete(key);
    },
    subscribe() {
      return () => undefined;
    },
  };
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("createServices integration", () => {
  it("builds the real service graph with webhook mode disabled", async () => {
    const archiveDir = await createTempDir();
    const logger = createMockLogger();
    const result = await createServices(
      createConfigStore(createServiceConfig(archiveDir)),
      createOverlayStore(),
      createSecretsStore(),
      archiveDir,
      logger,
    );

    try {
      expect(result.persistence.db).not.toBeNull();
      expect(result.webhookHealthTracker).toBeUndefined();
      expect(result.webhookRegistrar).toBeUndefined();
      expect(result.webhookInbox).toBeUndefined();
    } finally {
      result.persistence.close();
    }
  });

  it("wires webhook inbox and registrar when webhook_url exists but the secret is missing", async () => {
    const archiveDir = await createTempDir();
    const logger = createMockLogger();
    const result = await createServices(
      createConfigStore(
        createServiceConfig(archiveDir, {
          webhookUrl: "https://example.com/webhooks/linear",
          webhookSecret: "",
          previousWebhookSecret: null,
          pollingStretchMs: 60000,
          pollingBaseMs: 15000,
          healthCheckIntervalMs: 30000,
        }),
      ),
      createOverlayStore(),
      createSecretsStore(),
      archiveDir,
      logger,
    );

    try {
      expect(result.webhookHealthTracker).toBeUndefined();
      expect(result.webhookInbox).toBeInstanceOf(SqliteWebhookInbox);
      expect(result.webhookRegistrar).toBeInstanceOf(WebhookRegistrar);
      expect(logger.warn).toHaveBeenCalledWith(
        { webhookUrl: "https://example.com/webhooks/linear" },
        "webhook_url is configured but webhook_secret is missing — set $LINEAR_WEBHOOK_SECRET or configure webhook_secret in Settings",
      );
    } finally {
      result.persistence.close();
    }
  });

  it("uses a supplied persistence runtime and enables full webhook infrastructure when url and secret are present", async () => {
    const archiveDir = await createTempDir();
    const logger = createMockLogger();
    const persistence = await initPersistenceRuntime({ dataDir: archiveDir, logger });

    const result = await createServices(
      createConfigStore(
        createServiceConfig(archiveDir, {
          webhookUrl: "https://example.com/webhooks/linear",
          webhookSecret: "manual-secret",
          previousWebhookSecret: "old-secret",
          pollingStretchMs: 60000,
          pollingBaseMs: 15000,
          healthCheckIntervalMs: 30000,
        }),
      ),
      createOverlayStore(),
      createSecretsStore(),
      archiveDir,
      logger,
      { persistence: persistence as PersistenceRuntime },
    );

    try {
      expect(result.persistence).toBe(persistence);
      expect(result.webhookInbox).toBeInstanceOf(SqliteWebhookInbox);
      expect(result.webhookRegistrar).toBeInstanceOf(WebhookRegistrar);
      expect(result.webhookHealthTracker).toBeInstanceOf(DefaultWebhookHealthTracker);
    } finally {
      result.persistence.close();
    }
  });
});
