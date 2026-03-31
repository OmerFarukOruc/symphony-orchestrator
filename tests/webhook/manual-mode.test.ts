import { describe, expect, it, vi } from "vitest";

import { evaluateWebhookConfig } from "../../src/cli/services.js";
import type { RisolutoLogger, WebhookConfig } from "../../src/core/types.js";

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
    webhookSecret: "whsec_test_secret_value",
    pollingStretchMs: 120000,
    pollingBaseMs: 15000,
    healthCheckIntervalMs: 300000,
    ...overrides,
  };
}

describe("evaluateWebhookConfig", () => {
  it("returns true and logs info when both webhookUrl and webhookSecret are present", () => {
    const logger = makeLogger();
    const config = makeWebhookConfig();

    const result = evaluateWebhookConfig(config, logger);

    expect(result).toBe(true);
    expect(logger.info).toHaveBeenCalledWith(
      { webhookUrl: config.webhookUrl },
      expect.stringContaining("webhook mode enabled"),
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("returns false and does nothing when webhookUrl is absent (null config)", () => {
    const logger = makeLogger();

    const result = evaluateWebhookConfig(null, logger);

    expect(result).toBe(false);
    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("returns false and does nothing when webhookUrl is absent (undefined config)", () => {
    const logger = makeLogger();

    const result = evaluateWebhookConfig(undefined, logger);

    expect(result).toBe(false);
    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("returns false and logs a warning when webhookUrl is present but webhookSecret is missing", () => {
    const logger = makeLogger();
    const config = makeWebhookConfig({ webhookSecret: "" });

    const result = evaluateWebhookConfig(config, logger);

    expect(result).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(
      { webhookUrl: config.webhookUrl },
      expect.stringContaining("webhook_secret is missing"),
    );
    expect(logger.info).not.toHaveBeenCalled();
  });

  it("returns false when webhookUrl is empty string (config derived as null by builder)", () => {
    const logger = makeLogger();
    // Builder returns null when webhookUrl is empty, but test the edge case
    const config = makeWebhookConfig({ webhookUrl: "" });

    const result = evaluateWebhookConfig(config, logger);

    expect(result).toBe(false);
    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });
});

describe("webhook config integration", () => {
  it("config.webhook is populated when webhook section is present in workflow", async () => {
    const { deriveServiceConfig } = await import("../../src/config/builders.js");
    const config = deriveServiceConfig({
      config: {
        tracker: { kind: "linear", api_key: "lin_test", project_slug: "TEST" },
        codex: { command: "codex", auth: { mode: "api_key", source_home: "/tmp" } },
        agent: {},
        webhook: {
          webhook_url: "https://risoluto.example.com/webhooks/linear",
          webhook_secret: "whsec_test",
        },
      },
      promptTemplate: "Work on the issue.",
    });

    expect(config.webhook).not.toBeNull();
    expect(config.webhook?.webhookUrl).toBe("https://risoluto.example.com/webhooks/linear");
    expect(config.webhook?.webhookSecret).toBe("whsec_test");
    expect(config.webhook?.pollingStretchMs).toBe(120000);
    expect(config.webhook?.pollingBaseMs).toBe(15000);
    expect(config.webhook?.healthCheckIntervalMs).toBe(300000);
  });

  it("config.webhook is null when webhook section is absent", async () => {
    const { deriveServiceConfig } = await import("../../src/config/builders.js");
    const config = deriveServiceConfig({
      config: {
        tracker: { kind: "linear", api_key: "lin_test", project_slug: "TEST" },
        codex: { command: "codex", auth: { mode: "api_key", source_home: "/tmp" } },
        agent: {},
      },
      promptTemplate: "Work on the issue.",
    });

    expect(config.webhook).toBeNull();
  });

  it("config.webhook is null when webhook_url is empty", async () => {
    const { deriveServiceConfig } = await import("../../src/config/builders.js");
    const config = deriveServiceConfig({
      config: {
        tracker: { kind: "linear", api_key: "lin_test", project_slug: "TEST" },
        codex: { command: "codex", auth: { mode: "api_key", source_home: "/tmp" } },
        agent: {},
        webhook: { webhook_url: "" },
      },
      promptTemplate: "Work on the issue.",
    });

    expect(config.webhook).toBeNull();
  });

  it("config.webhook has empty webhookSecret when only webhook_url is set", async () => {
    const { deriveServiceConfig } = await import("../../src/config/builders.js");
    const config = deriveServiceConfig({
      config: {
        tracker: { kind: "linear", api_key: "lin_test", project_slug: "TEST" },
        codex: { command: "codex", auth: { mode: "api_key", source_home: "/tmp" } },
        agent: {},
        webhook: {
          webhook_url: "https://risoluto.example.com/webhooks/linear",
        },
      },
      promptTemplate: "Work on the issue.",
    });

    expect(config.webhook).not.toBeNull();
    expect(config.webhook?.webhookUrl).toBe("https://risoluto.example.com/webhooks/linear");
    expect(config.webhook?.webhookSecret).toBe("");
  });
});
