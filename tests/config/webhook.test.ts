import { describe, expect, it } from "vitest";

import { webhookConfigSchema } from "../../src/config/schemas/index.js";
import { deriveServiceConfig } from "../../src/config/builders.js";
import type { WorkflowDefinition } from "../../src/core/types.js";

function createWorkflow(config: Record<string, unknown>): WorkflowDefinition {
  return {
    config,
    promptTemplate: "Work on the issue.",
  };
}

// ---------------------------------------------------------------------------
// Zod schema validation
// ---------------------------------------------------------------------------

describe("webhookConfigSchema", () => {
  it("applies defaults for empty input", () => {
    const result = webhookConfigSchema.parse({});
    expect(result.webhookUrl).toBeUndefined();
    expect(result.webhookSecret).toBeUndefined();
    expect(result.pollingStretchMs).toBe(120000);
    expect(result.pollingBaseMs).toBe(15000);
    expect(result.healthCheckIntervalMs).toBe(300000);
  });

  it("preserves a valid HTTPS webhook URL", () => {
    const result = webhookConfigSchema.parse({
      webhookUrl: "https://example.com/webhook",
    });
    expect(result.webhookUrl).toBe("https://example.com/webhook");
  });

  it("preserves all provided values", () => {
    const result = webhookConfigSchema.parse({
      webhookUrl: "https://hooks.example.com/linear",
      webhookSecret: "whsec_abc123",
      pollingStretchMs: 60000,
      pollingBaseMs: 5000,
      healthCheckIntervalMs: 600000,
    });
    expect(result.webhookUrl).toBe("https://hooks.example.com/linear");
    expect(result.webhookSecret).toBe("whsec_abc123");
    expect(result.pollingStretchMs).toBe(60000);
    expect(result.pollingBaseMs).toBe(5000);
    expect(result.healthCheckIntervalMs).toBe(600000);
  });

  it("rejects HTTP (non-HTTPS) webhook URL", () => {
    expect(() =>
      webhookConfigSchema.parse({
        webhookUrl: "http://example.com/webhook",
      }),
    ).toThrow();
  });

  it("rejects invalid URL format", () => {
    expect(() =>
      webhookConfigSchema.parse({
        webhookUrl: "not-a-url",
      }),
    ).toThrow();
  });

  it("rejects negative pollingStretchMs", () => {
    expect(() =>
      webhookConfigSchema.parse({
        pollingStretchMs: -1,
      }),
    ).toThrow();
  });

  it("rejects zero pollingBaseMs", () => {
    expect(() =>
      webhookConfigSchema.parse({
        pollingBaseMs: 0,
      }),
    ).toThrow();
  });

  it("rejects negative healthCheckIntervalMs", () => {
    expect(() =>
      webhookConfigSchema.parse({
        healthCheckIntervalMs: -500,
      }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Builder integration (deriveServiceConfig → deriveWebhookConfig)
// ---------------------------------------------------------------------------

describe("deriveWebhookConfig via deriveServiceConfig", () => {
  it("returns null when webhook section is missing entirely", () => {
    const config = deriveServiceConfig(createWorkflow({}));
    expect(config.webhook).toBeNull();
  });

  it("returns null when webhook section is empty", () => {
    const config = deriveServiceConfig(createWorkflow({ webhook: {} }));
    expect(config.webhook).toBeNull();
  });

  it("returns null when webhook_url is empty string", () => {
    const config = deriveServiceConfig(createWorkflow({ webhook: { webhook_url: "" } }));
    expect(config.webhook).toBeNull();
  });

  it("parses full webhook config with snake_case keys", () => {
    const config = deriveServiceConfig(
      createWorkflow({
        webhook: {
          webhook_url: "https://hooks.example.com/linear",
          webhook_secret: "whsec_test",
          polling_stretch_ms: 90000,
          polling_base_ms: 10000,
          health_check_interval_ms: 600000,
        },
      }),
    );

    expect(config.webhook).toEqual({
      webhookUrl: "https://hooks.example.com/linear",
      webhookSecret: "whsec_test",
      pollingStretchMs: 90000,
      pollingBaseMs: 10000,
      healthCheckIntervalMs: 600000,
    });
  });

  it("accepts camelCase webhook keys and numeric strings from API-style payloads", () => {
    const config = deriveServiceConfig(
      createWorkflow({
        webhook: {
          webhookUrl: "https://hooks.example.com/linear",
          webhookSecret: "whsec_test",
          pollingStretchMs: "120000",
          pollingBaseMs: "15000",
          healthCheckIntervalMs: "60000",
        },
      }),
    );

    expect(config.webhook).toEqual({
      webhookUrl: "https://hooks.example.com/linear",
      webhookSecret: "whsec_test",
      pollingStretchMs: 120000,
      pollingBaseMs: 15000,
      healthCheckIntervalMs: 60000,
    });
  });

  it("uses defaults for omitted numeric fields when webhook_url is present", () => {
    const config = deriveServiceConfig(
      createWorkflow({
        webhook: {
          webhook_url: "https://hooks.example.com/linear",
        },
      }),
    );

    expect(config.webhook).not.toBeNull();
    expect(config.webhook!.webhookUrl).toBe("https://hooks.example.com/linear");
    expect(config.webhook!.webhookSecret).toBe("");
    expect(config.webhook!.pollingStretchMs).toBe(120000);
    expect(config.webhook!.pollingBaseMs).toBe(15000);
    expect(config.webhook!.healthCheckIntervalMs).toBe(300000);
  });

  it("resolves $ENV_VAR in webhook_url via process.env", () => {
    const prev = { ...process.env };
    process.env.WEBHOOK_ENDPOINT = "https://resolved.example.com/hook";
    process.env.LINEAR_WEBHOOK_SECRET = "whsec_resolved";

    try {
      const config = deriveServiceConfig(
        createWorkflow({
          webhook: {
            webhook_url: "$WEBHOOK_ENDPOINT",
            webhook_secret: "$LINEAR_WEBHOOK_SECRET",
          },
        }),
      );

      expect(config.webhook).not.toBeNull();
      expect(config.webhook!.webhookUrl).toBe("https://resolved.example.com/hook");
      expect(config.webhook!.webhookSecret).toBe("whsec_resolved");
    } finally {
      process.env.WEBHOOK_ENDPOINT = prev.WEBHOOK_ENDPOINT;
      process.env.LINEAR_WEBHOOK_SECRET = prev.LINEAR_WEBHOOK_SECRET;
    }
  });

  it("resolves webhook_secret via $SECRET: prefix", () => {
    const config = deriveServiceConfig(
      createWorkflow({
        webhook: {
          webhook_url: "https://hooks.example.com/linear",
          webhook_secret: "$SECRET:linear.webhook.secret",
        },
      }),
      {
        secretResolver: (name: string) => {
          if (name === "linear.webhook.secret") return "whsec_from_secret";
          return undefined;
        },
      },
    );

    expect(config.webhook!.webhookSecret).toBe("whsec_from_secret");
  });

  it("falls back to empty string when webhook_secret env var is unresolved", () => {
    const config = deriveServiceConfig(
      createWorkflow({
        webhook: {
          webhook_url: "https://hooks.example.com/linear",
          webhook_secret: "$MISSING_SECRET",
        },
      }),
      {
        secretResolver: () => undefined,
      },
    );

    expect(config.webhook!.webhookSecret).toBe("");
  });

  it("ignores non-numeric values for polling fields and uses defaults", () => {
    const config = deriveServiceConfig(
      createWorkflow({
        webhook: {
          webhook_url: "https://hooks.example.com/linear",
          polling_stretch_ms: "not-a-number",
          polling_base_ms: null,
          health_check_interval_ms: undefined,
        },
      }),
    );

    expect(config.webhook!.pollingStretchMs).toBe(120000);
    expect(config.webhook!.pollingBaseMs).toBe(15000);
    expect(config.webhook!.healthCheckIntervalMs).toBe(300000);
  });
});
