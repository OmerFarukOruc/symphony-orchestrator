import { describe, expect, it } from "vitest";

import { deriveServiceConfig, deriveTrackerConfig } from "../../src/config/builders.js";
import type { WorkflowDefinition } from "../../src/core/types.js";

function createWorkflow(config: Record<string, unknown>): WorkflowDefinition {
  return {
    config,
    promptTemplate: "Work on the issue.",
  };
}

describe("deriveServiceConfig", () => {
  it("normalizes tracker endpoints when deriving the tracker section directly", () => {
    expect(
      deriveTrackerConfig({
        kind: "github",
        endpoint: "https://api.github.com",
      }).endpoint,
    ).toBe("https://api.github.com");
  });

  it("defaults polling to 15 seconds", () => {
    const config = deriveServiceConfig(
      createWorkflow({
        tracker: {
          kind: "linear",
          api_key: "lin_test",
          project_slug: "TEST",
        },
        codex: {
          command: "codex",
          auth: {
            mode: "api_key",
            source_home: "/tmp",
          },
        },
        agent: {},
      }),
    );

    expect(config.polling.intervalMs).toBe(15000);
  });

  it("falls back to camelCase aliases when the snake_case value is null", () => {
    const config = deriveServiceConfig(
      createWorkflow({
        tracker: {
          kind: "linear",
          api_key: "lin_test",
          project_slug: "TEST",
        },
        codex: {
          command: "codex",
          auth: {
            mode: "api_key",
            source_home: "/tmp",
          },
        },
        webhook: {
          webhook_url: "https://example.test/webhook",
          webhook_secret: null,
          webhookSecret: "secret-from-overlay",
        },
        agent: {},
      }),
    );

    expect(config.webhook?.webhookSecret).toBe("secret-from-overlay");
  });

  it("preserves camelCase aliases across webhook, agent, and merge-policy sections", () => {
    const config = deriveServiceConfig(
      createWorkflow({
        tracker: {
          kind: "linear",
          api_key: "lin_test",
          project_slug: "TEST",
        },
        codex: {
          command: "codex",
          auth: {
            mode: "api_key",
            source_home: "/tmp",
          },
        },
        webhook: {
          webhookUrl: "https://example.test/webhook",
          webhookSecret: "secret-from-overlay",
          pollingStretchMs: 45_000,
        },
        agent: {
          preflightCommands: ["pnpm lint"],
          autoRetryOnReviewFeedback: true,
          prMonitorIntervalMs: 12_000,
          autoMerge: {
            enabled: true,
            allowedPaths: ["src/"],
            requireLabels: ["safe-to-merge"],
            excludeLabels: ["blocked"],
            maxChangedFiles: 5,
            maxDiffLines: 200,
          },
        },
      }),
    );

    expect(config.webhook).toMatchObject({
      webhookUrl: "https://example.test/webhook",
      webhookSecret: "secret-from-overlay",
      pollingStretchMs: 45_000,
    });
    expect(config.agent.preflightCommands).toEqual(["pnpm lint"]);
    expect(config.agent.autoRetryOnReviewFeedback).toBe(true);
    expect(config.agent.prMonitorIntervalMs).toBe(12_000);
    expect(config.agent.autoMerge).toMatchObject({
      enabled: true,
      allowedPaths: ["src/"],
      requireLabels: ["safe-to-merge"],
      excludeLabels: ["blocked"],
      maxChangedFiles: 5,
      maxDiffLines: 200,
    });
  });
});
