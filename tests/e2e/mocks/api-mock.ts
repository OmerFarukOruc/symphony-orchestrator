import type { Page, Route } from "@playwright/test";

import { buildSetupStatus, type SetupStatus } from "./data/setup-status";
import { buildRuntimeSnapshot, type RuntimeSnapshot } from "./data/runtime-snapshot";
import { buildConfig, buildConfigOverlay, buildConfigSchema } from "./data/config";
import { buildSecrets } from "./data/secrets";
import { buildIssueDetail, type IssueDetail } from "./data/issue-detail";
import { buildAttemptRecord, type AttemptRecord } from "./data/attempts";
import { buildPrRecord, type PrRecord } from "./data/pr";
import { buildCheckpointRecord, type CheckpointRecord } from "./data/checkpoint";
import { buildGitContext, type GitContextResponse } from "./data/git-context";

export interface ApiMockOverrides {
  setupStatus?: SetupStatus;
  runtimeSnapshot?: RuntimeSnapshot;
  runtimeInfo?: Record<string, unknown>;
  gitContext?: GitContextResponse;
  config?: Record<string, unknown>;
  configOverlay?: { overlay: Record<string, unknown> };
  configSchema?: unknown;
  secrets?: { keys: string[] };
  transitions?: { transitions: Record<string, string[]> };
  issueDetail?: Record<string, IssueDetail>;
  attemptRecords?: Record<string, AttemptRecord>;
  /** Override the PR list returned by GET /api/v1/prs. */
  prRecords?: PrRecord[];
  /** Override the checkpoints list returned by GET /api/v1/attempts/:id/checkpoints. */
  checkpointRecords?: Record<string, CheckpointRecord[]>;
  notifications?: {
    notifications: Array<Record<string, unknown>>;
    unreadCount: number;
    totalCount: number;
  };

  /** Override individual route handlers */
  routeOverrides?: Record<string, (route: Route) => Promise<void> | void>;
}

function json(route: Route, body: unknown, status = 200): Promise<void> {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

export async function installApiMock(page: Page, overrides: ApiMockOverrides = {}): Promise<void> {
  const setupStatus = overrides.setupStatus ?? buildSetupStatus();
  const snapshot = overrides.runtimeSnapshot ?? buildRuntimeSnapshot();
  const config = overrides.config ?? buildConfig();
  const configOverlay = overrides.configOverlay ?? buildConfigOverlay();
  const configSchema = overrides.configSchema ?? buildConfigSchema();
  const secrets = overrides.secrets ?? buildSecrets();
  const transitions = overrides.transitions ?? { transitions: {} };
  const gitContext = overrides.gitContext ?? buildGitContext();
  const notifications = overrides.notifications ?? { notifications: [], unreadCount: 0, totalCount: 0 };
  const runtimeInfo = overrides.runtimeInfo ?? {
    version: "0.3.1",
    workflow_path: "/tmp/WORKFLOW.md",
    data_dir: "/tmp/risoluto-data",
    feature_flags: {},
    provider_summary: "Codex",
  };

  // Setup
  await page.route("**/api/v1/setup/status", (route) => json(route, setupStatus));
  await page.route("**/api/v1/setup/master-key", (route) => json(route, { key: "sym_test_master_key_abc123" }, 201));
  await page.route("**/api/v1/setup/linear-projects", (route) =>
    json(route, {
      projects: [
        { id: "proj-1", name: "My Project", slugId: "my-project", teamKey: "MYP" },
        { id: "proj-2", name: "Other Project", slugId: "other-project", teamKey: "OTH" },
      ],
    }),
  );
  await page.route("**/api/v1/setup/linear-project", (route) => json(route, { ok: true }));
  await page.route("**/api/v1/setup/repo-routes", (route) => json(route, { routes: [] }));
  await page.route("**/api/v1/setup/repo-route/*", (route) => json(route, { ok: true }));
  await page.route("**/api/v1/setup/openai-key", (route) => json(route, { valid: true }));
  await page.route("**/api/v1/setup/codex-auth", (route) => json(route, { ok: true }));
  await page.route("**/api/v1/setup/github-token", (route) => json(route, { valid: true }));
  await page.route("**/api/v1/setup/detect-default-branch", (route) => json(route, { defaultBranch: "main" }));
  await page.route("**/api/v1/setup/reset", (route) => json(route, { ok: true }));
  await page.route("**/api/v1/setup/create-test-issue", (route) =>
    json(route, { ok: true, issueIdentifier: "TST-1", issueUrl: "https://linear.app/test/issue/TST-1" }),
  );
  await page.route("**/api/v1/setup/create-label", (route) =>
    json(route, { ok: true, labelId: "label-1", labelName: "risoluto" }),
  );
  await page.route("**/api/v1/setup/create-project", (route) =>
    json(route, {
      project: {
        id: "proj-new",
        name: "New Project",
        slugId: "new-project",
        teamKey: "NEW",
        url: "https://linear.app/test/project/new",
      },
    }),
  );

  // State & Runtime
  await page.route("**/api/v1/state", (route) => json(route, snapshot));
  await page.route("**/api/v1/runtime", (route) => json(route, runtimeInfo));
  await page.route("**/api/v1/git/context", (route) => json(route, gitContext));
  await page.route("**/api/v1/models", (route) =>
    json(route, {
      models: [
        { id: "o3-mini", displayName: "o3-mini" },
        { id: "o4-mini", displayName: "o4-mini" },
        { id: "gpt-5.4", displayName: "gpt-5.4" },
        { id: "gpt-4.1", displayName: "gpt-4.1" },
      ],
    }),
  );

  // Workspaces
  await page.route("**/api/v1/workspaces", (route) =>
    json(route, { workspaces: [], generated_at: new Date().toISOString(), total: 0, active: 0, orphaned: 0 }),
  );

  // Refresh
  await page.route("**/api/v1/refresh", (route) =>
    json(route, { queued: true, coalesced: false, requested_at: new Date().toISOString() }),
  );

  // Config
  await page.route("**/api/v1/config", (route) => {
    if (route.request().url().endsWith("/config")) {
      return json(route, config);
    }
    return route.fallback();
  });
  await page.route("**/api/v1/config/overlay", (route) => json(route, configOverlay));
  await page.route("**/api/v1/config/schema", (route) => json(route, configSchema));

  // Secrets
  await page.route("**/api/v1/secrets", (route) => json(route, secrets));
  await page.route("**/api/v1/secrets/*", (route) => {
    if (route.request().method() === "POST") {
      return json(route, {}, 201);
    }
    if (route.request().method() === "DELETE") {
      return json(route, {}, 204);
    }
    return route.fallback();
  });

  // Transitions
  await page.route("**/api/v1/transitions", (route) => json(route, transitions));

  // Metrics
  await page.route("**/metrics", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/plain; version=0.0.4; charset=utf-8",
      body: "# HELP risoluto_http_requests_total Total HTTP requests\nrisoluto_http_requests_total 42\n",
    }),
  );

  // Issue detail — match /api/v1/:identifier but NOT sub-paths
  await page.route(
    /\/api\/v1\/(?!setup|config|secrets|refresh|transitions|state|runtime|attempts|workspaces|models|templates|audit)([^/]+)$/,
    (route) => {
      const url = new URL(route.request().url());
      const segments = url.pathname.split("/");
      const identifier = decodeURIComponent(segments.at(-1) ?? "");

      if (overrides.issueDetail?.[identifier]) {
        return json(route, overrides.issueDetail[identifier]);
      }
      // Default: build from the snapshot if the identifier matches
      const issue = [...snapshot.running, ...snapshot.queued, ...snapshot.completed, ...snapshot.retrying].find(
        (i) => i.identifier === identifier,
      );
      if (issue) {
        return json(route, buildIssueDetail({ ...issue }));
      }
      return json(route, { error: { code: "not_found", message: "Unknown issue identifier" } }, 404);
    },
  );

  // Attempts list
  await page.route(/\/api\/v1\/[^/]+\/attempts$/, (route) => {
    const url = new URL(route.request().url());
    const segments = url.pathname.split("/");
    const identifier = decodeURIComponent(segments.at(-2) ?? "");

    if (overrides.issueDetail?.[identifier]) {
      const detail = overrides.issueDetail[identifier];
      return json(route, { attempts: detail.attempts, current_attempt_id: detail.currentAttemptId });
    }
    const detail = buildIssueDetail();
    return json(route, { attempts: detail.attempts, current_attempt_id: detail.currentAttemptId });
  });

  // Attempt checkpoints — must be registered before the more-general attempts/* route
  await page.route("**/api/v1/attempts/*/checkpoints", (route) => {
    const url = new URL(route.request().url());
    const segments = url.pathname.split("/");
    // pathname: /api/v1/attempts/<id>/checkpoints  →  segments[-2] = id
    const attemptId = decodeURIComponent(segments.at(-2) ?? "");
    const checkpoints = overrides.checkpointRecords?.[attemptId] ?? [buildCheckpointRecord({ attemptId })];
    return json(route, { checkpoints });
  });

  // Single attempt detail
  await page.route("**/api/v1/attempts/*", (route) => {
    const url = new URL(route.request().url());
    const attemptId = decodeURIComponent(url.pathname.split("/").at(-1) ?? "");
    if (overrides.attemptRecords?.[attemptId]) {
      return json(route, overrides.attemptRecords[attemptId]);
    }
    return json(route, buildAttemptRecord({ attemptId }));
  });

  // PR status overview
  await page.route("**/api/v1/prs", (route) => {
    const prs = overrides.prRecords ?? [buildPrRecord()];
    return json(route, { prs });
  });

  await page.route(/\/api\/v1\/notifications(?:\?.*)?$/, (route) => {
    if (route.request().method() === "GET") {
      return json(route, notifications);
    }
    return route.fallback();
  });
  await page.route(/\/api\/v1\/notifications\/[^/]+\/read$/, (route) => {
    if (route.request().method() === "POST") {
      const first = notifications.notifications[0] ?? null;
      return json(route, {
        ok: true,
        notification: first
          ? {
              ...first,
              read: true,
            }
          : null,
        unreadCount: Math.max(0, notifications.unreadCount - 1),
      });
    }
    return route.fallback();
  });
  await page.route("**/api/v1/notifications/read-all", (route) => {
    if (route.request().method() === "POST") {
      return json(route, {
        ok: true,
        updatedCount: notifications.unreadCount,
        unreadCount: 0,
      });
    }
    return route.fallback();
  });

  // Abort
  await page.route(/\/api\/v1\/[^/]+\/abort$/, (route) =>
    json(route, {
      ok: true,
      status: "stopping",
      already_stopping: false,
      requested_at: new Date().toISOString(),
    }),
  );

  // Steer
  await page.route(/\/api\/v1\/[^/]+\/steer$/, (route) => json(route, { ok: true, message: "steer sent" }));

  // Model override
  await page.route(/\/api\/v1\/[^/]+\/model$/, (route) => json(route, {}, 200));

  // Transition
  await page.route(/\/api\/v1\/[^/]+\/transition$/, (route) =>
    json(route, { ok: true, from: "In Progress", to: "Done" }),
  );

  // Templates
  await page.route("**/api/v1/templates", (route) => {
    if (route.request().method() === "GET") {
      return json(route, {
        templates: [
          {
            id: "default",
            name: "Default Template",
            body: "You are working on {{ issue.id }}.",
            createdAt: "2026-03-20T10:00:00Z",
            updatedAt: "2026-03-25T12:00:00Z",
          },
        ],
      });
    }
    if (route.request().method() === "POST") {
      return json(route, {
        template: {
          id: "new-tmpl",
          name: "New Template",
          body: "",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });
    }
    return route.fallback();
  });
  await page.route("**/api/v1/templates/**/preview", (route) =>
    json(route, { rendered: "You are working on PROJ-42.", error: null }),
  );
  await page.route("**/api/v1/templates/*", (route) => {
    if (route.request().method() === "PUT") {
      return json(route, {
        template: {
          id: "default",
          name: "Default Template",
          body: "Updated body",
          createdAt: "2026-03-20T10:00:00Z",
          updatedAt: new Date().toISOString(),
        },
      });
    }
    if (route.request().method() === "DELETE") {
      return json(route, { deleted: true });
    }
    return route.fallback();
  });

  // Audit
  await page.route("**/api/v1/audit*", (route) =>
    json(route, {
      entries: [
        {
          id: 1,
          tableName: "config",
          key: "codex.model",
          path: null,
          operation: "update",
          previousValue: '"gpt-4.1"',
          newValue: '"gpt-5.4"',
          actor: "dashboard",
          requestId: "req_001",
          timestamp: "2026-03-28T10:30:00Z",
        },
        {
          id: 2,
          tableName: "secrets",
          key: "OPENAI_API_KEY",
          path: null,
          operation: "set",
          previousValue: null,
          newValue: "[REDACTED]",
          actor: "dashboard",
          requestId: "req_002",
          timestamp: "2026-03-28T09:15:00Z",
        },
      ],
      total: 2,
    }),
  );

  // Apply any custom route overrides last
  if (overrides.routeOverrides) {
    for (const [pattern, handler] of Object.entries(overrides.routeOverrides)) {
      await page.route(pattern, handler);
    }
  }
}
