import { afterEach, describe, expect, it, vi } from "vitest";

import { deriveServiceConfig } from "../../src/config/builders.js";
import {
  normalizeAlerts,
  normalizeAutomations,
  normalizeNotifications,
  normalizeTriggers,
} from "../../src/config/normalizers.js";
import type { WorkflowDefinition } from "../../src/core/types.js";

function createWorkflow(config: Record<string, unknown>): WorkflowDefinition {
  return {
    config,
    promptTemplate: "Work on {{ issue.identifier }}.",
  };
}

describe("notification config normalization", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("normalizes legacy slack config and mirrors it into channels", () => {
    const result = normalizeNotifications({
      slack: { webhook_url: "https://hooks.slack.com/services/T000/B000/XXX", verbosity: "verbose" },
    });

    expect(result.slack).toEqual({
      webhookUrl: "https://hooks.slack.com/services/T000/B000/XXX",
      verbosity: "verbose",
    });
    expect(result.channels).toEqual([
      {
        type: "slack",
        name: "slack",
        enabled: true,
        minSeverity: "info",
        webhookUrl: "https://hooks.slack.com/services/T000/B000/XXX",
        verbosity: "verbose",
      },
    ]);
  });

  it("normalizes explicit webhook and desktop channels", () => {
    vi.stubEnv("RISOLUTO_ALLOWED_NOTIFICATION_WEBHOOK_HOSTS", "notify.example");

    const result = normalizeNotifications({
      channels: [
        { type: "webhook", name: "ops", url: "https://notify.example/hook", min_severity: "warning" },
        { type: "desktop", name: "desktop-local", enabled: true },
      ],
    });

    expect(result.channels).toEqual([
      {
        type: "webhook",
        name: "ops",
        enabled: true,
        minSeverity: "warning",
        url: "https://notify.example/hook",
        headers: {},
      },
      {
        type: "desktop",
        name: "desktop-local",
        enabled: true,
        minSeverity: "info",
      },
    ]);
  });

  it("rejects non-allowlisted generic webhook hosts", () => {
    expect(() =>
      normalizeNotifications({
        channels: [{ type: "webhook", name: "ops", url: "https://notify.example/hook" }],
      }),
    ).toThrow(/not allowlisted/);
  });
});

describe("trigger and automation normalization", () => {
  it("normalizes triggers", () => {
    const result = normalizeTriggers({
      api_key: "secret",
      allowed_actions: ["create_issue", "refresh_issue", "unknown"],
      github_secret: "github-secret",
      rate_limit_per_minute: 45,
    });

    expect(result).toEqual({
      apiKey: "secret",
      allowedActions: ["create_issue", "refresh_issue"],
      githubSecret: "github-secret",
      rateLimitPerMinute: 45,
    });
  });

  it("normalizes automations", () => {
    const result = normalizeAutomations([
      {
        name: "nightly-triage",
        schedule: "0 2 * * *",
        mode: "report",
        prompt: "Summarize stale issues.",
        repo_url: "https://github.com/org/repo",
      },
    ]);

    expect(result).toEqual([
      {
        name: "nightly-triage",
        schedule: "0 2 * * *",
        mode: "report",
        prompt: "Summarize stale issues.",
        enabled: true,
        repoUrl: "https://github.com/org/repo",
      },
    ]);
  });

  it("normalizes alerts", () => {
    const result = normalizeAlerts({
      rules: [
        {
          name: "worker-failures",
          type: "worker_failed",
          severity: "critical",
          channels: ["slack", "ops"],
          cooldown_ms: 300000,
        },
      ],
    });

    expect(result).toEqual({
      rules: [
        {
          name: "worker-failures",
          type: "worker_failed",
          severity: "critical",
          channels: ["slack", "ops"],
          cooldownMs: 300000,
          enabled: true,
        },
      ],
    });
  });
});

describe("deriveServiceConfig notification bundle sections", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("derives notifications, triggers, automations, and alerts together", () => {
    vi.stubEnv("RISOLUTO_ALLOWED_NOTIFICATION_WEBHOOK_HOSTS", "notify.example");

    const config = deriveServiceConfig(
      createWorkflow({
        tracker: {
          kind: "linear",
          api_key: "lin_test",
          project_slug: "TEST",
        },
        notifications: {
          slack: { webhook_url: "https://hooks.slack.com/services/T000/B000/XXX", verbosity: "critical" },
          channels: [{ type: "webhook", name: "ops", url: "https://notify.example/hook" }],
        },
        triggers: {
          api_key: "trigger-secret",
          allowed_actions: ["refresh_issue"],
        },
        automations: [
          {
            name: "nightly-triage",
            schedule: "0 2 * * *",
            mode: "report",
            prompt: "Summarize stale issues.",
          },
        ],
        alerts: {
          rules: [{ name: "worker-failures", type: "worker_failed", channels: ["slack"], severity: "critical" }],
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

    expect(config.notifications?.channels).toHaveLength(2);
    expect(config.triggers?.allowedActions).toEqual(["refresh_issue"]);
    expect(config.automations).toHaveLength(1);
    expect(config.alerts?.rules).toHaveLength(1);
  });
});
