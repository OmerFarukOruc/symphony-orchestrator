import { join } from "node:path";

import express, { type Express } from "express";

import { registerConfigApi } from "../config/api.js";
import type { ConfigOverlayStore } from "../config/overlay.js";
import type { ConfigStore } from "../config/store.js";
import type { RuntimeSnapshot } from "../core/types.js";
import { globalMetrics } from "../observability/metrics.js";
import { Orchestrator } from "../orchestrator/orchestrator.js";
import { createPlanningRouter, type PlanningExecutionResult } from "../planning/api.js";
import type { PlannedIssue } from "../planning/skill.js";
import { registerSecretsApi } from "../secrets/api.js";
import type { SecretsStore } from "../secrets/store.js";
import { handleAttemptDetail } from "./attempt-handler.js";
import { handleModelUpdate } from "./model-handler.js";
import { methodNotAllowed, refreshReason, sanitizeConfigValue, serializeSnapshot } from "./route-helpers.js";

import { createRateLimiter } from "./rate-limit.js";

const frontendDist = join(process.cwd(), "dist/frontend");

interface HttpRouteDeps {
  orchestrator: Orchestrator;
  configStore?: ConfigStore;
  configOverlayStore?: ConfigOverlayStore;
  secretsStore?: SecretsStore;
  executePlan?: (issues: PlannedIssue[]) => Promise<PlanningExecutionResult>;
  frontendDir?: string;
}

export function registerHttpRoutes(app: Express, deps: HttpRouteDeps): void {
  const staticRoot = deps.frontendDir ?? frontendDist;
  app.use(express.static(staticRoot));
  registerStateAndMetricsRoutes(app, deps);
  registerExtensionApis(app, deps);
  registerIssueRoutes(app, deps);

  const spaRateLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 120 });
  app.use(spaRateLimiter, (request, response) => {
    if (request.path.startsWith("/api/") || request.path === "/metrics") {
      response.status(404).json({ error: { code: "not_found", message: "Not found" } });
      return;
    }
    response.sendFile(join(staticRoot, "index.html"));
  });
}

function registerStateAndMetricsRoutes(app: Express, deps: HttpRouteDeps): void {
  app
    .route("/api/v1/state")
    .get((_req, res) => {
      res.json(serializeSnapshot(deps.orchestrator.getSnapshot() as RuntimeSnapshot & Record<string, unknown>));
    })
    .all((_req, res) => {
      methodNotAllowed(res);
    });

  app
    .route("/api/v1/runtime")
    .get((_req, res) => {
      res.json({
        version: process.env.npm_package_version ?? "unknown",
        workflow_path: process.env.SYMPHONY_WORKFLOW_PATH ?? "",
        data_dir: process.env.SYMPHONY_DATA_DIR ?? "",
        feature_flags: {},
        provider_summary: "Codex",
      });
    })
    .all((_req, res) => {
      methodNotAllowed(res);
    });

  app
    .route("/metrics")
    .get((_req, res) => {
      res.setHeader("content-type", "text/plain; version=0.0.4; charset=utf-8");
      res.send(globalMetrics.serialize());
    })
    .all((_req, res) => {
      methodNotAllowed(res);
    });

  app
    .route("/api/v1/refresh")
    .post((req, res) => {
      const refresh = deps.orchestrator.requestRefresh(refreshReason(req));
      res.status(202).json({ queued: refresh.queued, coalesced: refresh.coalesced, requested_at: refresh.requestedAt });
    })
    .all((_req, res) => {
      methodNotAllowed(res);
    });
}

function registerIssueRoutes(app: Express, deps: HttpRouteDeps): void {
  app
    .route("/api/v1/:issue_identifier/model")
    .post(async (req, res) => {
      await handleModelUpdate(deps.orchestrator, req, res);
    })
    .all((_req, res) => {
      methodNotAllowed(res);
    });

  app
    .route("/api/v1/:issue_identifier/attempts")
    .get((req, res) => {
      const detail = deps.orchestrator.getIssueDetail(req.params.issue_identifier);
      if (!detail) {
        res.status(404).json({ error: { code: "not_found", message: "Unknown issue identifier" } });
        return;
      }
      res.json({ attempts: detail.attempts ?? [], current_attempt_id: detail.currentAttemptId ?? null });
    })
    .all((_req, res) => {
      methodNotAllowed(res);
    });

  app
    .route("/api/v1/attempts/:attempt_id")
    .get((req, res) => {
      handleAttemptDetail(deps.orchestrator, req, res);
    })
    .all((_req, res) => {
      methodNotAllowed(res);
    });

  app
    .route("/api/v1/:issue_identifier")
    .get((req, res) => {
      const detail = deps.orchestrator.getIssueDetail(req.params.issue_identifier);
      if (!detail) {
        res.status(404).json({ error: { code: "not_found", message: "Unknown issue identifier" } });
        return;
      }
      res.json(detail);
    })
    .all((_req, res) => {
      methodNotAllowed(res);
    });
}

function registerExtensionApis(app: Express, deps: HttpRouteDeps): void {
  if (deps.configStore && deps.configOverlayStore) {
    registerConfigApi(app, {
      getEffectiveConfig: () =>
        sanitizeConfigValue(deps.configStore?.getMergedConfigMap() ?? {}) as Record<string, unknown>,
      configOverlayStore: deps.configOverlayStore,
    });
  }
  if (deps.secretsStore) {
    registerSecretsApi(app, { secretsStore: deps.secretsStore });
  }
  app.use(createPlanningRouter({ executePlan: deps.executePlan ? (issues) => deps.executePlan!(issues) : undefined }));
}
