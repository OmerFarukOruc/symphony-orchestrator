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
  codexCapabilities?: Record<string, unknown>;
  codexThreads?: { data: Array<Record<string, unknown>>; nextCursor: string | null };
  codexLoadedThreads?: { data: string[] };
  codexFeatures?: { data: Array<Record<string, unknown>>; nextCursor: string | null };
  codexCollaborationModes?: { data: Array<Record<string, unknown>> };
  codexMcp?: { data: Array<Record<string, unknown>>; nextCursor: string | null };
  codexUserInputRequests?: { data: Array<Record<string, unknown>> };
  codexAccount?: Record<string, unknown>;
  codexRateLimits?: Record<string, unknown>;
  codexThreadDetail?: Record<string, unknown>;

  /** Override individual route handlers */
  routeOverrides?: Record<string, (route: Route) => Promise<void> | void>;
}

interface PreparedApiMockData {
  setupStatus: SetupStatus;
  snapshot: RuntimeSnapshot;
  runtimeInfo: Record<string, unknown>;
  gitContext: GitContextResponse;
  config: Record<string, unknown>;
  configOverlay: { overlay: Record<string, unknown> };
  configSchema: unknown;
  secrets: { keys: string[] };
  transitions: { transitions: Record<string, string[]> };
  notifications: {
    notifications: Array<Record<string, unknown>>;
    unreadCount: number;
    totalCount: number;
  };
  codexCapabilities: Record<string, unknown>;
  codexThreads: { data: Array<Record<string, unknown>>; nextCursor: string | null };
  codexLoadedThreads: { data: string[] };
  codexFeatures: { data: Array<Record<string, unknown>>; nextCursor: string | null };
  codexCollaborationModes: { data: Array<Record<string, unknown>> };
  codexMcp: { data: Array<Record<string, unknown>>; nextCursor: string | null };
  codexUserInputRequests: { data: Array<Record<string, unknown>> };
  codexAccount: Record<string, unknown>;
  codexRateLimits: Record<string, unknown>;
  codexThreadDetail: Record<string, unknown>;
}

function json(route: Route, body: unknown, status = 200): Promise<void> {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

function buildObservabilityResponse(snapshot: RuntimeSnapshot) {
  const systemStatus = snapshot.system_health?.status ?? "healthy";
  const healthStatus = systemStatus === "critical" ? "error" : systemStatus === "degraded" ? "warn" : "ok";
  const rawMetrics =
    "# HELP risoluto_http_requests_total Total HTTP requests\n" +
    "# TYPE risoluto_http_requests_total counter\n" +
    "risoluto_http_requests_total 42\n";
  return {
    generated_at: snapshot.generated_at,
    snapshot_root: "/tmp/observability",
    components: [
      {
        component: "orchestrator",
        pid: 4242,
        updated_at: snapshot.generated_at,
        metrics: {
          lifecycle_poll: {
            total: 12,
            success: 12,
            failure: 0,
            last_at: snapshot.generated_at,
            last_success_at: snapshot.generated_at,
            last_failure_at: null,
            last_failure_reason: null,
          },
        },
        health: {
          orchestrator: {
            surface: "orchestrator",
            component: "orchestrator",
            status: healthStatus,
            updated_at: snapshot.generated_at,
            reason: snapshot.system_health?.message ?? "All systems operational",
            details: null,
          },
        },
        traces: [],
        sessions: {},
      },
    ],
    health: {
      status: healthStatus,
      counts: {
        ok: healthStatus === "ok" ? 1 : 0,
        warn: healthStatus === "warn" ? 1 : 0,
        error: healthStatus === "error" ? 1 : 0,
      },
      surfaces: [
        {
          surface: "orchestrator",
          component: "orchestrator",
          status: healthStatus,
          updated_at: snapshot.generated_at,
          reason: snapshot.system_health?.message ?? "All systems operational",
          details: null,
        },
      ],
    },
    traces: [],
    session_state: [],
    runtime_state: snapshot,
    raw_metrics: rawMetrics,
  };
}

function buildDefaultCodexCapabilities(): Record<string, unknown> {
  return {
    connectedAt: "2026-04-08T11:00:00Z",
    initializationError: null,
    methods: {
      "thread/list": "supported",
      "thread/read": "supported",
      "thread/fork": "supported",
      "thread/name/set": "supported",
      "thread/archive": "supported",
      "thread/unarchive": "supported",
      "thread/loaded/list": "supported",
      "experimentalFeature/list": "supported",
      "collaborationMode/list": "supported",
      "mcpServerStatus/list": "supported",
    },
    notifications: {
      "app/list/updated": "enabled",
      "serverRequest/resolved": "enabled",
    },
  };
}

function buildDefaultCodexThreads(): { data: Array<Record<string, unknown>>; nextCursor: string | null } {
  return {
    data: [
      {
        id: "thr_1",
        name: "Bug bash",
        preview: "Summarize the repo",
        modelProvider: "openai",
        updatedAt: 1730910000,
        createdAt: 1730900000,
        status: { type: "idle" },
      },
    ],
    nextCursor: null,
  };
}

function buildDefaultRuntimeInfo(): Record<string, unknown> {
  return {
    version: "0.3.1",
    workflow_path: "/tmp/WORKFLOW.md",
    data_dir: "/tmp/risoluto-data",
    provider_summary: "Codex",
  };
}

function buildDefaultCodexAccount(): Record<string, unknown> {
  return {
    account: {
      type: "chatgpt",
      email: "operator@example.com",
      planType: "pro",
    },
    requiresOpenaiAuth: true,
  };
}

function buildDefaultCodexRateLimits(): Record<string, unknown> {
  return {
    rateLimits: {
      limitId: "codex",
      limitName: "codex",
      primary: {
        usedPercent: 25,
        windowDurationMins: 15,
        resetsAt: 1730947200,
      },
      secondary: null,
    },
    rateLimitsByLimitId: {
      codex: {
        limitId: "codex",
        limitName: "codex",
        primary: {
          usedPercent: 25,
          windowDurationMins: 15,
          resetsAt: 1730947200,
        },
        secondary: null,
      },
    },
  };
}

function buildDefaultCodexThreadDetail(): Record<string, unknown> {
  return {
    thread: {
      id: "thr_1",
      name: "Bug bash",
      preview: "Summarize the repo",
      cwd: "/tmp/workspace",
      sourceKind: "appServer",
      status: { type: "idle" },
      turns: [
        {
          id: "turn_1",
          status: "completed",
          items: [{ type: "userMessage" }, { type: "agentMessage" }],
          error: null,
        },
      ],
    },
  };
}

function buildPreparedCoreData(
  overrides: ApiMockOverrides,
): Omit<
  PreparedApiMockData,
  | "codexCapabilities"
  | "codexThreads"
  | "codexLoadedThreads"
  | "codexFeatures"
  | "codexCollaborationModes"
  | "codexMcp"
  | "codexUserInputRequests"
> {
  return {
    setupStatus: overrides.setupStatus ?? buildSetupStatus(),
    snapshot: overrides.runtimeSnapshot ?? buildRuntimeSnapshot(),
    config: overrides.config ?? buildConfig(),
    configOverlay: overrides.configOverlay ?? buildConfigOverlay(),
    configSchema: overrides.configSchema ?? buildConfigSchema(),
    secrets: overrides.secrets ?? buildSecrets(),
    transitions: overrides.transitions ?? { transitions: {} },
    gitContext: overrides.gitContext ?? buildGitContext(),
    notifications: overrides.notifications ?? { notifications: [], unreadCount: 0, totalCount: 0 },
    runtimeInfo: overrides.runtimeInfo ?? buildDefaultRuntimeInfo(),
  };
}

function buildPreparedCodexData(
  overrides: ApiMockOverrides,
): Pick<
  PreparedApiMockData,
  | "codexCapabilities"
  | "codexThreads"
  | "codexLoadedThreads"
  | "codexFeatures"
  | "codexCollaborationModes"
  | "codexMcp"
  | "codexUserInputRequests"
  | "codexAccount"
  | "codexRateLimits"
  | "codexThreadDetail"
> {
  return {
    codexCapabilities: overrides.codexCapabilities ?? buildDefaultCodexCapabilities(),
    codexThreads: overrides.codexThreads ?? buildDefaultCodexThreads(),
    codexLoadedThreads: overrides.codexLoadedThreads ?? { data: ["thr_1"] },
    codexFeatures: overrides.codexFeatures ?? {
      data: [{ name: "unified_exec", stage: "beta", displayName: "Unified exec", enabled: true }],
      nextCursor: null,
    },
    codexCollaborationModes: overrides.codexCollaborationModes ?? {
      data: [{ name: "default", displayName: "Default", description: "Default collaboration mode" }],
    },
    codexMcp: overrides.codexMcp ?? {
      data: [{ name: "github", status: "ready", authStatus: "authenticated", tools: [1], resources: [] }],
      nextCursor: null,
    },
    codexUserInputRequests: overrides.codexUserInputRequests ?? { data: [] },
    codexAccount: overrides.codexAccount ?? buildDefaultCodexAccount(),
    codexRateLimits: overrides.codexRateLimits ?? buildDefaultCodexRateLimits(),
    codexThreadDetail: overrides.codexThreadDetail ?? buildDefaultCodexThreadDetail(),
  };
}

function buildApiMockData(overrides: ApiMockOverrides): PreparedApiMockData {
  return {
    ...buildPreparedCoreData(overrides),
    ...buildPreparedCodexData(overrides),
  };
}

async function registerSetupRoutes(page: Page, setupStatus: SetupStatus): Promise<void> {
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
}

async function registerCoreRoutes(page: Page, data: PreparedApiMockData): Promise<void> {
  await page.route("**/api/v1/state", (route) => json(route, data.snapshot));
  await page.route("**/api/v1/observability", (route) => json(route, buildObservabilityResponse(data.snapshot)));
  await page.route("**/api/v1/runtime", (route) => json(route, data.runtimeInfo));
  await page.route("**/api/v1/git/context", (route) => json(route, data.gitContext));
  await page.route("**/api/v1/models", (route) =>
    json(route, {
      models: [
        { id: "o3-mini", displayName: "o3-mini", inputModalities: ["text"], isDefault: false },
        { id: "o4-mini", displayName: "o4-mini", inputModalities: ["text"], isDefault: false },
        { id: "gpt-5.4", displayName: "gpt-5.4", inputModalities: ["text", "image"], isDefault: true },
        { id: "gpt-4.1", displayName: "gpt-4.1", inputModalities: ["text"], isDefault: false },
      ],
    }),
  );
  await page.route("**/api/v1/workspaces", (route) =>
    json(route, { workspaces: [], generated_at: new Date().toISOString(), total: 0, active: 0, orphaned: 0 }),
  );
  await page.route("**/api/v1/refresh", (route) =>
    json(route, { queued: true, coalesced: false, requested_at: new Date().toISOString() }),
  );
  await page.route("**/api/v1/config", (route) => {
    if (route.request().url().endsWith("/config")) {
      return json(route, data.config);
    }
    return route.fallback();
  });
  await page.route("**/api/v1/config/overlay", (route) => json(route, data.configOverlay));
  await page.route("**/api/v1/config/schema", (route) => json(route, data.configSchema));
  await page.route("**/api/v1/secrets", (route) => json(route, data.secrets));
  await page.route("**/api/v1/secrets/*", (route) => {
    if (route.request().method() === "POST") {
      return json(route, {}, 201);
    }
    if (route.request().method() === "DELETE") {
      return json(route, {}, 204);
    }
    return route.fallback();
  });
  await page.route("**/api/v1/transitions", (route) => json(route, data.transitions));
  await page.route("**/metrics", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/plain; version=0.0.4; charset=utf-8",
      body: "# HELP risoluto_http_requests_total Total HTTP requests\nrisoluto_http_requests_total 42\n",
    }),
  );
}

async function registerCodexRoutes(page: Page, data: PreparedApiMockData): Promise<void> {
  await page.route("**/api/v1/codex/capabilities", (route) => json(route, data.codexCapabilities));
  await page.route("**/api/v1/codex/threads", (route) => {
    if (route.request().method() === "GET") {
      return json(route, data.codexThreads);
    }
    return route.fallback();
  });
  await page.route(/\/api\/v1\/codex\/threads\/[^/?]+(?:\?.*)?$/, (route) => {
    if (route.request().method() === "GET") {
      return json(route, data.codexThreadDetail);
    }
    return route.fallback();
  });
  await page.route("**/api/v1/codex/threads/loaded", (route) => json(route, data.codexLoadedThreads));
  await page.route("**/api/v1/codex/features", (route) => json(route, data.codexFeatures));
  await page.route("**/api/v1/codex/collaboration-modes", (route) => json(route, data.codexCollaborationModes));
  await page.route("**/api/v1/codex/mcp", (route) => {
    if (route.request().method() === "GET") {
      return json(route, data.codexMcp);
    }
    return route.fallback();
  });
  await page.route("**/api/v1/codex/mcp/reload", (route) => json(route, { ok: true }));
  await page.route("**/api/v1/codex/mcp/oauth/login", (route) =>
    json(route, { authUrl: "https://chatgpt.com/mcp/github/login" }),
  );
  await page.route("**/api/v1/codex/threads/*/fork", (route) => json(route, { thread: { id: "thr_forked" } }));
  await page.route("**/api/v1/codex/threads/*/name", (route) => json(route, { ok: true }));
  await page.route("**/api/v1/codex/threads/*/archive", (route) => json(route, {}));
  await page.route("**/api/v1/codex/threads/*/unarchive", (route) => json(route, {}));
  await page.route("**/api/v1/codex/threads/*/unsubscribe", (route) => json(route, { status: "unsubscribed" }));
  await page.route("**/api/v1/codex/account", (route) => json(route, data.codexAccount));
  await page.route("**/api/v1/codex/account/rate-limits", (route) => json(route, data.codexRateLimits));
  await page.route("**/api/v1/codex/account/login/start", (route) =>
    json(route, {
      type: "chatgpt",
      loginId: "login_1",
      authUrl: "https://chatgpt.com/login/mock",
    }),
  );
  await page.route("**/api/v1/codex/account/login/cancel", (route) => json(route, { ok: true }));
  await page.route("**/api/v1/codex/account/logout", (route) => json(route, { ok: true }));
  await page.route("**/api/v1/codex/requests/user-input", (route) => json(route, data.codexUserInputRequests));
  await page.route("**/api/v1/codex/requests/user-input/*/respond", (route) => json(route, { ok: true }));
}

async function registerIssueAndAttemptRoutes(
  page: Page,
  overrides: ApiMockOverrides,
  snapshot: RuntimeSnapshot,
): Promise<void> {
  await page.route(
    /\/api\/v1\/(?!setup|config|secrets|refresh|transitions|state|runtime|attempts|workspaces|models|templates|audit)([^/]+)$/,
    (route) => {
      const url = new URL(route.request().url());
      const segments = url.pathname.split("/");
      const identifier = decodeURIComponent(segments.at(-1) ?? "");

      if (overrides.issueDetail?.[identifier]) {
        return json(route, overrides.issueDetail[identifier]);
      }
      const issue = [...snapshot.running, ...snapshot.queued, ...snapshot.completed, ...snapshot.retrying].find(
        (item) => item.identifier === identifier,
      );
      if (issue) {
        return json(route, buildIssueDetail({ ...issue }));
      }
      return json(route, { error: { code: "not_found", message: "Unknown issue identifier" } }, 404);
    },
  );
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
  await page.route("**/api/v1/attempts/*/checkpoints", (route) => {
    const url = new URL(route.request().url());
    const segments = url.pathname.split("/");
    const attemptId = decodeURIComponent(segments.at(-2) ?? "");
    const checkpoints = overrides.checkpointRecords?.[attemptId] ?? [buildCheckpointRecord({ attemptId })];
    return json(route, { checkpoints });
  });
  await page.route("**/api/v1/attempts/*", (route) => {
    const url = new URL(route.request().url());
    const attemptId = decodeURIComponent(url.pathname.split("/").at(-1) ?? "");
    if (overrides.attemptRecords?.[attemptId]) {
      return json(route, overrides.attemptRecords[attemptId]);
    }
    return json(route, buildAttemptRecord({ attemptId }));
  });
  await page.route("**/api/v1/prs", (route) => {
    const prs = overrides.prRecords ?? [buildPrRecord()];
    return json(route, { prs });
  });
  await page.route(/\/api\/v1\/[^/]+\/abort$/, (route) =>
    json(route, {
      ok: true,
      status: "stopping",
      already_stopping: false,
      requested_at: new Date().toISOString(),
    }),
  );
  await page.route(/\/api\/v1\/[^/]+\/steer$/, (route) => json(route, { ok: true, message: "steer sent" }));
  await page.route(/\/api\/v1\/[^/]+\/model$/, (route) => json(route, {}, 200));
  await page.route(/\/api\/v1\/[^/]+\/transition$/, (route) =>
    json(route, { ok: true, from: "In Progress", to: "Done" }),
  );
}

async function registerNotificationRoutes(
  page: Page,
  notifications: PreparedApiMockData["notifications"],
): Promise<void> {
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
}

async function registerTemplateAndAuditRoutes(page: Page): Promise<void> {
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
}

async function applyRouteOverrides(page: Page, routeOverrides: ApiMockOverrides["routeOverrides"]): Promise<void> {
  if (!routeOverrides) {
    return;
  }
  for (const [pattern, handler] of Object.entries(routeOverrides)) {
    await page.route(pattern, handler);
  }
}

export async function installApiMock(page: Page, overrides: ApiMockOverrides = {}): Promise<void> {
  const data = buildApiMockData(overrides);
  await registerSetupRoutes(page, data.setupStatus);
  await registerCoreRoutes(page, data);
  await registerCodexRoutes(page, data);
  await registerIssueAndAttemptRoutes(page, overrides, data.snapshot);
  await registerNotificationRoutes(page, data.notifications);
  await registerTemplateAndAuditRoutes(page);
  await applyRouteOverrides(page, overrides.routeOverrides);
}
