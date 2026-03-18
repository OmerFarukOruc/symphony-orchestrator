import type { Express } from "express";

import { registerConfigApi } from "../config/api.js";
import type { ConfigStore } from "../config/store.js";
import type { ConfigOverlayStore } from "../config/overlay.js";
import { renderDashboardTemplate } from "../dashboard/template.js";
import { renderLogsTemplate } from "../dashboard/logs-template.js";
import { globalMetrics } from "../observability/metrics.js";
import { Orchestrator } from "../orchestrator/orchestrator.js";
import { createPlanningRouter, type PlanningExecutionResult } from "../planning/api.js";
import type { PlannedIssue } from "../planning/skill.js";
import { registerSecretsApi } from "../secrets/api.js";
import type { SecretsStore } from "../secrets/store.js";
import type { RuntimeSnapshot } from "../core/types.js";
import { handleAttemptDetail } from "./attempt-handler.js";
import { handleModelUpdate } from "./model-handler.js";
import { methodNotAllowed, serializeSnapshot, sanitizeConfigValue, refreshReason } from "./route-helpers.js";

interface HttpRouteDeps {
  orchestrator: Orchestrator;
  configStore?: ConfigStore;
  configOverlayStore?: ConfigOverlayStore;
  secretsStore?: SecretsStore;
  executePlan?: (issues: PlannedIssue[]) => Promise<PlanningExecutionResult>;
}

export function registerHttpRoutes(app: Express, deps: HttpRouteDeps): void {
  registerPageRoutes(app);
  registerExtensionApis(app, deps);
  registerApiRoutes(app, deps);
}

function registerPageRoutes(app: Express): void {
  app
    .route("/")
    .get((_req, res) => {
      res.type("html").send(renderDashboardTemplate());
    })
    .all((_req, res) => {
      methodNotAllowed(res);
    });
  app
    .route("/logs/:issue_identifier")
    .get((req, res) => {
      res.type("html").send(renderLogsTemplate(req.params.issue_identifier));
    })
    .all((_req, res) => {
      methodNotAllowed(res);
    });
}

function registerApiRoutes(app: Express, deps: HttpRouteDeps): void {
  app
    .route("/api/v1/state")
    .get((_req, res) => {
      res.json(serializeSnapshot(deps.orchestrator.getSnapshot() as RuntimeSnapshot & Record<string, unknown>));
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
