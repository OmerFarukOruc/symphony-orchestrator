import { afterEach, describe, expect, it, vi } from "vitest";

import { deriveServiceConfig } from "../../src/config/builders.js";
import { normalizeGitHub, normalizeNotifications } from "../../src/config/normalizers.js";
import {
  normalizeGitHubApiBaseUrl,
  normalizeNotificationWebhookUrl,
  normalizeSlackWebhookUrl,
  normalizeTrackerEndpoint,
} from "../../src/config/url-policy.js";
import type { WorkflowDefinition } from "../../src/core/types.js";

function createWorkflow(config: Record<string, unknown>): WorkflowDefinition {
  return {
    config,
    promptTemplate: "Work on {{ issue.identifier }}.",
  };
}

describe("config URL policy", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows the default Linear tracker endpoint", () => {
    expect(normalizeTrackerEndpoint("linear", "https://api.linear.app/graphql")).toBe("https://api.linear.app/graphql");
  });

  it("rejects non-allowlisted tracker hosts", () => {
    expect(() => normalizeTrackerEndpoint("linear", "https://evil.example/graphql")).toThrow(
      /tracker\.endpoint host evil\.example is not allowlisted/,
    );
  });

  it("allows explicitly allowlisted enterprise hosts for GitHub endpoints", () => {
    vi.stubEnv("RISOLUTO_ALLOWED_GITHUB_API_HOSTS", "github.example.test");
    vi.stubEnv("RISOLUTO_ALLOWED_TRACKER_HOSTS", "api.github.enterprise.com");
    expect(normalizeGitHubApiBaseUrl("https://github.example.test/api")).toBe("https://github.example.test/api");
    expect(normalizeTrackerEndpoint("github", "https://api.github.enterprise.com")).toBe(
      "https://api.github.enterprise.com",
    );
  });

  it("rejects lookalike GitHub hosts unless explicitly allowlisted", () => {
    expect(() => normalizeGitHubApiBaseUrl("https://github.example.test/api")).toThrow(/not allowlisted/);
  });

  it("allows env-configured custom tracker hosts", () => {
    vi.stubEnv("RISOLUTO_ALLOWED_TRACKER_HOSTS", "tracker.internal.example");
    expect(normalizeTrackerEndpoint("linear", "https://tracker.internal.example/graphql")).toBe(
      "https://tracker.internal.example/graphql",
    );
  });

  it("restricts Slack webhooks to Slack hosts unless env override is present", () => {
    expect(normalizeSlackWebhookUrl("https://hooks.slack.com/services/T000/B000/XXX")).toBe(
      "https://hooks.slack.com/services/T000/B000/XXX",
    );
    expect(() => normalizeSlackWebhookUrl("https://notify.example/hook")).toThrow(/not allowlisted/);
    vi.stubEnv("RISOLUTO_ALLOWED_SLACK_WEBHOOK_HOSTS", "notify.example");
    expect(normalizeSlackWebhookUrl("https://notify.example/hook")).toBe("https://notify.example/hook");
  });

  it("restricts generic notification webhooks to explicit allowlists", () => {
    expect(() => normalizeNotificationWebhookUrl("https://notify.example/hook")).toThrow(/not allowlisted/);
    vi.stubEnv("RISOLUTO_ALLOWED_NOTIFICATION_WEBHOOK_HOSTS", "notify.example");
    expect(normalizeNotificationWebhookUrl("https://notify.example/hook")).toBe("https://notify.example/hook");
  });

  it("normalizers apply URL policy checks", () => {
    expect(() =>
      normalizeNotifications({
        slack: { webhook_url: "https://notify.example/hook", verbosity: "critical" },
      }),
    ).toThrow(/not allowlisted/);

    expect(() =>
      normalizeGitHub({
        token: "ghp_token123",
        api_base_url: "https://evil.example/api",
      }),
    ).toThrow(/not allowlisted/);
  });

  it("deriveServiceConfig rejects disallowed tracker endpoints", () => {
    expect(() =>
      deriveServiceConfig(
        createWorkflow({
          tracker: {
            kind: "linear",
            api_key: "lin_test",
            project_slug: "TEST",
            endpoint: "https://evil.example/graphql",
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
      ),
    ).toThrow(/tracker\.endpoint host evil\.example is not allowlisted/);
  });
});
