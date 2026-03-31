import { describe, expect, it, vi } from "vitest";

import type { RisolutoLogger, WebhookConfig } from "../../src/core/types.js";
import { LinearClientError } from "../../src/linear/errors.js";
import { WebhookRegistrar } from "../../src/webhook/registrar.js";
import type { WebhookRegistrarDeps } from "../../src/webhook/registrar.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeLogger(): RisolutoLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  } as unknown as RisolutoLogger;
}

function makeWebhookConfig(overrides: Partial<WebhookConfig> = {}): WebhookConfig {
  return {
    webhookUrl: "https://risoluto.example.com/webhooks/linear",
    webhookSecret: "",
    pollingStretchMs: 120_000,
    pollingBaseMs: 15_000,
    healthCheckIntervalMs: 300_000,
    ...overrides,
  };
}

type MockLinearClient = {
  [K in keyof WebhookRegistrarDeps["linearClient"]]: ReturnType<typeof vi.fn>;
};

function makeLinearClient(): MockLinearClient {
  return {
    listWebhooks: vi.fn().mockResolvedValue([]),
    createWebhook: vi.fn().mockResolvedValue({ id: "wh_new", secret: "auto_secret_123" }),
    updateWebhook: vi.fn().mockResolvedValue(undefined),
    deleteWebhook: vi.fn().mockResolvedValue(undefined),
  };
}

type MockSecretsStore = {
  [K in keyof WebhookRegistrarDeps["secretsStore"]]: ReturnType<typeof vi.fn>;
};

function makeSecretsStore(stored: Record<string, string> = {}): MockSecretsStore {
  return {
    get: vi.fn((key: string) => stored[key] ?? null),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(true),
  };
}

interface TestHarness {
  registrar: WebhookRegistrar;
  linearClient: MockLinearClient;
  secretsStore: MockSecretsStore;
  onSecretResolved: ReturnType<typeof vi.fn>;
  logger: RisolutoLogger;
}

function makeRegistrar(overrides: Partial<WebhookRegistrarDeps> = {}, config?: WebhookConfig | null): TestHarness {
  const linearClient = makeLinearClient();
  const secretsStore = makeSecretsStore();
  const onSecretResolved = vi.fn();
  const logger = makeLogger();
  const resolvedConfig = arguments.length >= 2 ? config : makeWebhookConfig();

  const registrar = new WebhookRegistrar({
    linearClient,
    secretsStore,
    getWebhookConfig: () => resolvedConfig,
    onSecretResolved,
    logger,
    ...overrides,
  });

  return { registrar, linearClient, secretsStore, onSecretResolved, logger };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("WebhookRegistrar", () => {
  // -------------------------------------------------------------------------
  // No-op when config absent
  // -------------------------------------------------------------------------

  describe("when webhook config is null", () => {
    it("register() is a no-op", async () => {
      const { registrar, linearClient, onSecretResolved } = makeRegistrar({}, null);

      await registrar.register();

      expect(linearClient.listWebhooks).not.toHaveBeenCalled();
      expect(linearClient.createWebhook).not.toHaveBeenCalled();
      expect(onSecretResolved).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Strategy 1: config secret present (manual mode)
  // -------------------------------------------------------------------------

  describe("config secret present (manual mode)", () => {
    it("uses the config secret and calls onSecretResolved", async () => {
      const config = makeWebhookConfig({ webhookSecret: "manual_secret" });
      const { registrar, onSecretResolved } = makeRegistrar({}, config);

      await registrar.register();

      expect(onSecretResolved).toHaveBeenCalledWith("manual_secret");
    });

    it("verifies the webhook URL exists in Linear (best-effort)", async () => {
      const config = makeWebhookConfig({ webhookSecret: "manual_secret" });
      const { registrar, linearClient } = makeRegistrar({}, config);
      linearClient.listWebhooks.mockResolvedValue([
        {
          id: "wh_1",
          url: config.webhookUrl,
          enabled: true,
          label: null,
          secret: null,
          resourceTypes: [],
          teamId: null,
        },
      ]);

      await registrar.register();

      expect(linearClient.listWebhooks).toHaveBeenCalledOnce();
    });

    it("logs warning when webhook URL not found in Linear", async () => {
      const config = makeWebhookConfig({ webhookSecret: "manual_secret" });
      const { registrar, linearClient, onSecretResolved, logger } = makeRegistrar({}, config);
      linearClient.listWebhooks.mockResolvedValue([
        {
          id: "wh_other",
          url: "https://other.example.com/hook",
          enabled: true,
          label: null,
          secret: null,
          resourceTypes: [],
          teamId: null,
        },
      ]);

      await registrar.register();

      // Should still resolve the secret despite URL not being found
      expect(onSecretResolved).toHaveBeenCalledWith("manual_secret");
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ webhookUrl: config.webhookUrl }),
        expect.stringContaining("not found in Linear"),
      );
    });

    it("continues gracefully when listWebhooks fails during verification", async () => {
      const config = makeWebhookConfig({ webhookSecret: "manual_secret" });
      const { registrar, linearClient, onSecretResolved } = makeRegistrar({}, config);
      linearClient.listWebhooks.mockRejectedValue(new Error("network down"));

      await registrar.register();

      expect(onSecretResolved).toHaveBeenCalledWith("manual_secret");
    });
  });

  // -------------------------------------------------------------------------
  // Strategy 2: stored secret
  // -------------------------------------------------------------------------

  describe("stored secret exists", () => {
    it("reuses stored secret when webhook is found and enabled", async () => {
      const config = makeWebhookConfig();
      const secretsStore = makeSecretsStore({ LINEAR_WEBHOOK_SECRET: "stored_secret" });
      const { registrar, linearClient, onSecretResolved } = makeRegistrar({ secretsStore }, config);
      linearClient.listWebhooks.mockResolvedValue([
        {
          id: "wh_existing",
          url: config.webhookUrl,
          enabled: true,
          label: "Risoluto",
          secret: null,
          resourceTypes: ["Issue"],
          teamId: null,
        },
      ]);

      await registrar.register();

      expect(onSecretResolved).toHaveBeenCalledWith("stored_secret");
      expect(linearClient.createWebhook).not.toHaveBeenCalled();
    });

    it("re-enables disabled webhook and reuses stored secret", async () => {
      const config = makeWebhookConfig();
      const secretsStore = makeSecretsStore({ LINEAR_WEBHOOK_SECRET: "stored_secret" });
      const { registrar, linearClient, onSecretResolved, logger } = makeRegistrar({ secretsStore }, config);
      linearClient.listWebhooks.mockResolvedValue([
        {
          id: "wh_disabled",
          url: config.webhookUrl,
          enabled: false,
          label: "Risoluto",
          secret: null,
          resourceTypes: ["Issue"],
          teamId: null,
        },
      ]);

      await registrar.register();

      expect(linearClient.updateWebhook).toHaveBeenCalledWith("wh_disabled", { enabled: true });
      expect(onSecretResolved).toHaveBeenCalledWith("stored_secret");
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ webhookId: "wh_disabled" }),
        expect.stringContaining("re-enabled"),
      );
    });

    it("falls through to auto-create when stored webhook not found", async () => {
      const config = makeWebhookConfig();
      const secretsStore = makeSecretsStore({ LINEAR_WEBHOOK_SECRET: "stale_secret" });
      const { registrar, linearClient, onSecretResolved } = makeRegistrar({ secretsStore }, config);
      // No matching webhook in list
      linearClient.listWebhooks.mockResolvedValue([]);
      linearClient.createWebhook.mockResolvedValue({ id: "wh_fresh", secret: "fresh_secret" });

      await registrar.register();

      expect(linearClient.createWebhook).toHaveBeenCalled();
      expect(onSecretResolved).toHaveBeenCalledWith("fresh_secret");
      expect(secretsStore.set).toHaveBeenCalledWith("LINEAR_WEBHOOK_SECRET", "fresh_secret");
    });

    it("falls through to auto-create when re-enable fails", async () => {
      const config = makeWebhookConfig();
      const secretsStore = makeSecretsStore({ LINEAR_WEBHOOK_SECRET: "stored_secret" });
      const { registrar, linearClient, onSecretResolved } = makeRegistrar({ secretsStore }, config);
      linearClient.listWebhooks.mockResolvedValue([
        {
          id: "wh_broken",
          url: config.webhookUrl,
          enabled: false,
          label: null,
          secret: null,
          resourceTypes: [],
          teamId: null,
        },
      ]);
      linearClient.updateWebhook.mockRejectedValue(new Error("permission denied"));
      linearClient.createWebhook.mockResolvedValue({ id: "wh_new2", secret: "new_secret" });

      await registrar.register();

      expect(linearClient.createWebhook).toHaveBeenCalled();
      expect(onSecretResolved).toHaveBeenCalledWith("new_secret");
    });

    it("optimistically uses stored secret when listWebhooks fails", async () => {
      const config = makeWebhookConfig();
      const secretsStore = makeSecretsStore({ LINEAR_WEBHOOK_SECRET: "stored_secret" });
      const { registrar, linearClient, onSecretResolved } = makeRegistrar({ secretsStore }, config);
      linearClient.listWebhooks.mockRejectedValue(new Error("network error"));

      await registrar.register();

      expect(onSecretResolved).toHaveBeenCalledWith("stored_secret");
      expect(linearClient.createWebhook).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Strategy 3: auto-create
  // -------------------------------------------------------------------------

  describe("auto-create (no existing secret)", () => {
    it("creates webhook, stores secret, and calls onSecretResolved", async () => {
      const config = makeWebhookConfig();
      const { registrar, linearClient, secretsStore, onSecretResolved, logger } = makeRegistrar({}, config);
      linearClient.createWebhook.mockResolvedValue({ id: "wh_auto", secret: "auto_secret" });

      await registrar.register();

      expect(linearClient.createWebhook).toHaveBeenCalledWith({
        url: config.webhookUrl,
        resourceTypes: ["Issue", "Comment", "Project"],
        label: "Risoluto",
      });
      expect(secretsStore.set).toHaveBeenCalledWith("LINEAR_WEBHOOK_SECRET", "auto_secret");
      expect(onSecretResolved).toHaveBeenCalledWith("auto_secret");
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ webhookId: "wh_auto" }),
        expect.stringContaining("auto-registration complete"),
      );
    });

    it("logs error when API returns null secret", async () => {
      const config = makeWebhookConfig();
      const { registrar, linearClient, onSecretResolved, logger } = makeRegistrar({}, config);
      linearClient.createWebhook.mockResolvedValue({ id: "wh_no_secret", secret: null });

      await registrar.register();

      expect(onSecretResolved).not.toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ webhookId: "wh_no_secret" }),
        expect.stringContaining("did not return a signing secret"),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  describe("error handling", () => {
    it("logs permission error with Admin scope instructions", async () => {
      const config = makeWebhookConfig();
      const { registrar, linearClient, onSecretResolved, logger } = makeRegistrar({}, config);
      linearClient.createWebhook.mockRejectedValue(new LinearClientError("linear_http_error", "403 Forbidden"));

      await registrar.register();

      expect(onSecretResolved).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ errorCode: "linear_http_error" }),
        expect.stringContaining("Admin scope"),
      );
    });

    it("logs permission error for graphql errors", async () => {
      const config = makeWebhookConfig();
      const { registrar, linearClient, logger } = makeRegistrar({}, config);
      linearClient.createWebhook.mockRejectedValue(
        new LinearClientError("linear_graphql_error", "insufficient permissions"),
      );

      await registrar.register();

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ errorCode: "linear_graphql_error" }),
        expect.stringContaining("insufficient permissions"),
      );
    });

    it("logs generic error and continues for network errors", async () => {
      const config = makeWebhookConfig();
      const { registrar, linearClient, onSecretResolved, logger } = makeRegistrar({}, config);
      linearClient.createWebhook.mockRejectedValue(new Error("ECONNREFUSED"));

      await registrar.register();

      expect(onSecretResolved).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ error: "ECONNREFUSED" }),
        expect.stringContaining("polling-only mode"),
      );
    });

    it("never throws from register()", async () => {
      const config = makeWebhookConfig();
      const { registrar, linearClient } = makeRegistrar({}, config);
      linearClient.createWebhook.mockRejectedValue(new Error("catastrophic failure"));

      // Should not throw
      await expect(registrar.register()).resolves.toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // stop() idempotency
  // -------------------------------------------------------------------------

  describe("stop()", () => {
    it("is idempotent — safe to call multiple times", () => {
      const { registrar } = makeRegistrar({}, makeWebhookConfig());

      // Should not throw on repeated calls
      expect(() => {
        registrar.stop();
        registrar.stop();
        registrar.stop();
      }).not.toThrow();
    });
  });
});
