import type { Page, Route } from "@playwright/test";

import { buildSetupStatus, type SetupStatus } from "./data/setup-status";
import { buildRuntimeSnapshot, type RuntimeSnapshot } from "./data/runtime-snapshot";
import { buildConfig, buildConfigOverlay, buildConfigSchema } from "./data/config";
import { buildSecrets } from "./data/secrets";
import { buildIssueDetail, type IssueDetail } from "./data/issue-detail";
import { buildAttemptRecord, type AttemptRecord } from "./data/attempts";

export interface ApiMockOverrides {
  setupStatus?: SetupStatus;
  runtimeSnapshot?: RuntimeSnapshot;
  runtimeInfo?: Record<string, unknown>;
  config?: Record<string, unknown>;
  configOverlay?: { overlay: Record<string, unknown> };
  configSchema?: unknown;
  secrets?: { keys: string[] };
  transitions?: { transitions: Record<string, string[]> };
  issueDetail?: Record<string, IssueDetail>;
  attemptRecords?: Record<string, AttemptRecord>;

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
  const runtimeInfo = overrides.runtimeInfo ?? {
    version: "0.3.1",
    workflow_path: "/tmp/WORKFLOW.md",
    data_dir: "/tmp/symphony-data",
    feature_flags: {},
    provider_summary: "Codex",
  };

  // Setup
  await page.route("**/api/v1/setup/status", (route) => json(route, setupStatus));
  await page.route("**/api/v1/setup/create-test-issue", (route) =>
    json(route, { ok: true, issueIdentifier: "TST-1", issueUrl: "https://linear.app/test/issue/TST-1" }),
  );
  await page.route("**/api/v1/setup/create-label", (route) =>
    json(route, { ok: true, labelId: "label-1", labelName: "symphony" }),
  );

  // State & Runtime
  await page.route("**/api/v1/state", (route) => json(route, snapshot));
  await page.route("**/api/v1/runtime", (route) => json(route, runtimeInfo));

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
      body: "# HELP symphony_http_requests_total Total HTTP requests\nsymphony_http_requests_total 42\n",
    }),
  );

  // Issue detail — match /api/v1/:identifier but NOT sub-paths
  await page.route(
    /\/api\/v1\/(?!setup|config|secrets|refresh|transitions|state|runtime|attempts)([^/]+)$/,
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

  // Single attempt detail
  await page.route("**/api/v1/attempts/*", (route) => {
    const url = new URL(route.request().url());
    const attemptId = decodeURIComponent(url.pathname.split("/").at(-1) ?? "");
    if (overrides.attemptRecords?.[attemptId]) {
      return json(route, overrides.attemptRecords[attemptId]);
    }
    return json(route, buildAttemptRecord({ attemptId }));
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

  // Model override
  await page.route(/\/api\/v1\/[^/]+\/model$/, (route) => json(route, {}, 200));

  // Transition
  await page.route(/\/api\/v1\/[^/]+\/transition$/, (route) =>
    json(route, { ok: true, from: "In Progress", to: "Done" }),
  );

  // Apply any custom route overrides last
  if (overrides.routeOverrides) {
    for (const [pattern, handler] of Object.entries(overrides.routeOverrides)) {
      await page.route(pattern, handler);
    }
  }
}
