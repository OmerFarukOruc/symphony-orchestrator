import { describe, expect, it, vi } from "vitest";

import { WebhookRegistrar, type WebhookRegistrarDeps } from "../../src/webhook/registrar.js";
import type { WebhookConfig, SymphonyLogger } from "../../src/core/types.js";

function makeLogger(): SymphonyLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  } as unknown as SymphonyLogger;
}

function makeWebhookConfig(overrides: Partial<WebhookConfig> = {}): WebhookConfig {
  return {
    webhookUrl: "https://symphony.example.com/webhooks/linear",
    webhookSecret: "whsec_test_secret",
    pollingStretchMs: 120000,
    pollingBaseMs: 15000,
    healthCheckIntervalMs: 300000,
    ...overrides,
  };
}

describe("registrar services wiring", () => {
  it("onSecretResolved callback updates the secret visible to getWebhookSecret", async () => {
    // Simulates the mutable closure pattern used in services.ts
    let resolvedSecret: string | null = null;
    const getWebhookSecret = () => resolvedSecret;

    const config = makeWebhookConfig({ webhookSecret: "" });
    const storedSecret = "whsec_stored_from_previous_run";

    const deps: WebhookRegistrarDeps = {
      linearClient: {
        listWebhooks: vi.fn().mockResolvedValue([
          {
            id: "wh_1",
            url: config.webhookUrl,
            enabled: true,
            label: null,
            secret: null,
            resourceTypes: [],
            teamId: null,
          },
        ]),
        createWebhook: vi.fn(),
        updateWebhook: vi.fn(),
        deleteWebhook: vi.fn(),
      },
      secretsStore: {
        get: vi.fn().mockReturnValue(storedSecret),
        set: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(false),
      },
      getWebhookConfig: () => config,
      onSecretResolved: (secret) => {
        resolvedSecret = secret;
      },
      logger: makeLogger(),
    };

    expect(getWebhookSecret()).toBeNull();

    const registrar = new WebhookRegistrar(deps);
    await registrar.register();

    expect(getWebhookSecret()).toBe(storedSecret);
  });

  it("registrar.stop() is idempotent and safe to call multiple times", () => {
    const config = makeWebhookConfig();
    const registrar = new WebhookRegistrar({
      linearClient: {
        listWebhooks: vi.fn(),
        createWebhook: vi.fn(),
        updateWebhook: vi.fn(),
        deleteWebhook: vi.fn(),
      },
      secretsStore: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
      getWebhookConfig: () => config,
      onSecretResolved: vi.fn(),
      logger: makeLogger(),
    });

    expect(() => {
      registrar.stop();
      registrar.stop();
    }).not.toThrow();
  });

  it("registrar does nothing when webhook config is absent", async () => {
    const onSecretResolved = vi.fn();
    const registrar = new WebhookRegistrar({
      linearClient: {
        listWebhooks: vi.fn(),
        createWebhook: vi.fn(),
        updateWebhook: vi.fn(),
        deleteWebhook: vi.fn(),
      },
      secretsStore: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
      getWebhookConfig: () => null,
      onSecretResolved,
      logger: makeLogger(),
    });

    await registrar.register();

    expect(onSecretResolved).not.toHaveBeenCalled();
  });
});
