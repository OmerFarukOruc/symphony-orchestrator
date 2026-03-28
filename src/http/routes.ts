import { join } from "node:path";

import express, { type Express } from "express";

import rateLimit from "express-rate-limit";

import { registerConfigApi } from "../config/api.js";
import type { ConfigOverlayPort } from "../config/overlay.js";
import type { ConfigStore } from "../config/store.js";
import type { TypedEventBus } from "../core/event-bus.js";
import { fetchCodexModels } from "../codex/model-list.js";
import type { SymphonyEventMap } from "../core/symphony-events.js";
import { globalMetrics } from "../observability/metrics.js";
import type { OrchestratorPort } from "../orchestrator/port.js";
import { registerSecretsApi } from "../secrets/api.js";
import type { SecretsStore } from "../secrets/store.js";
import { registerSetupApi } from "../setup/api.js";
import type { PromptTemplateStore } from "../prompt/store.js";
import { registerTemplateApi } from "../prompt/api.js";
import type { AuditLogger } from "../audit/logger.js";
import { registerAuditApi } from "../audit/api.js";
import type { TrackerPort } from "../tracker/port.js";

import { handleAttemptDetail } from "./attempt-handler.js";
import { handleGitContext } from "./git-context.js";
import { handleModelUpdate } from "./model-handler.js";
import { getOpenApiSpec } from "./openapi.js";
import { modelUpdateSchema, steerSchema, transitionSchema } from "./request-schemas.js";
import { methodNotAllowed, refreshReason, sanitizeConfigValue } from "./route-helpers.js";
import { createSSEHandler } from "./sse.js";
import { getSwaggerHtml } from "./swagger-html.js";
import { handleTransition } from "./transition-handler.js";
import { handleGetTransitions } from "./transitions-api.js";
import { validateBody } from "./validation.js";
import { handleWorkspaceInventory, handleWorkspaceRemove } from "./workspace-inventory.js";

const frontendDist = join(process.cwd(), "dist/frontend");

interface HttpRouteDeps {
  orchestrator: OrchestratorPort;
  tracker?: TrackerPort;
  configStore?: ConfigStore;
  configOverlayStore?: ConfigOverlayPort;
  secretsStore?: SecretsStore;
  eventBus?: TypedEventBus<SymphonyEventMap>;

  templateStore?: PromptTemplateStore;
  auditLogger?: AuditLogger;
  frontendDir?: string;
  archiveDir?: string;
}

export function registerHttpRoutes(app: Express, deps: HttpRouteDeps): void {
  const staticRoot = deps.frontendDir ?? frontendDist;

  app.use(express.static(staticRoot));
  const apiLimiter = rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true, legacyHeaders: false });
  app.use("/api/", apiLimiter);
  app.use("/metrics", apiLimiter);
  registerStateAndMetricsRoutes(app, deps);
  registerDocsRoutes(app);
  registerExtensionApis(app, deps);
  registerGitRoutes(app, deps);
  registerWorkspaceRoutes(app, deps);
  registerIssueRoutes(app, deps);

  app.use((request, response) => {
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
      res.json(deps.orchestrator.getSerializedState());
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

  if (deps.eventBus) {
    app
      .route("/api/v1/events")
      .get(createSSEHandler(deps.eventBus))
      .all((_req, res) => {
        methodNotAllowed(res);
      });
  }

  app
    .route("/api/v1/models")
    .get(async (_req, res) => {
      const apiKey = deps.secretsStore?.get("OPENAI_API_KEY") ?? undefined;
      const models = await fetchCodexModels(apiKey);
      res.json({ models });
    })
    .all((_req, res) => {
      methodNotAllowed(res);
    });

  app
    .route("/api/v1/transitions")
    .get((req, res) => {
      handleGetTransitions({ orchestrator: deps.orchestrator, configStore: deps.configStore }, req, res);
    })
    .all((_req, res) => {
      methodNotAllowed(res);
    });
}

function registerDocsRoutes(app: Express): void {
  app
    .route("/api/v1/openapi.json")
    .get((_req, res) => {
      res.json(getOpenApiSpec());
    })
    .all((_req, res) => {
      methodNotAllowed(res);
    });

  app
    .route("/api/docs")
    .get((_req, res) => {
      res.type("html").send(getSwaggerHtml());
    })
    .all((_req, res) => {
      methodNotAllowed(res);
    });
}

function registerIssueRoutes(app: Express, deps: HttpRouteDeps): void {
  app
    .route("/api/v1/:issue_identifier/abort")
    .post((req, res) => {
      const result = deps.orchestrator.abortIssue(req.params.issue_identifier);
      if (!result.ok) {
        const status = result.code === "not_found" ? 404 : 409;
        res.status(status).json({ error: { code: result.code, message: result.message } });
        return;
      }
      res.status(result.alreadyStopping ? 200 : 202).json({
        ok: true,
        status: "stopping",
        already_stopping: result.alreadyStopping,
        requested_at: result.requestedAt,
      });
    })
    .all((_req, res) => {
      methodNotAllowed(res);
    });

  app
    .route("/api/v1/:issue_identifier/model")
    .post(validateBody(modelUpdateSchema), async (req, res) => {
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
    .route("/api/v1/:issue_identifier/transition")
    .post(validateBody(transitionSchema), async (req, res) => {
      await handleTransition(
        { orchestrator: deps.orchestrator, tracker: deps.tracker, configStore: deps.configStore },
        req,
        res,
      );
    })
    .all((_req, res) => {
      methodNotAllowed(res);
    });

  app
    .route("/api/v1/:issue_identifier/steer")
    .post(validateBody(steerSchema), async (req, res) => {
      const result = await deps.orchestrator.steerIssue(req.params.issue_identifier, req.body.message);
      if (!result) {
        res.status(404).json({ error: { code: "not_found", message: "issue not running" } });
        return;
      }
      res.json({ ok: result.ok, message: result.ok ? "steer sent" : "steer failed" });
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

function registerGitRoutes(app: Express, deps: HttpRouteDeps): void {
  app
    .route("/api/v1/git/context")
    .get(async (req, res) => {
      await handleGitContext(
        {
          orchestrator: deps.orchestrator,
          configStore: deps.configStore,
          secretsStore: deps.secretsStore,
        },
        req,
        res,
      );
    })
    .all((_req, res) => {
      methodNotAllowed(res);
    });
}

function registerWorkspaceRoutes(app: Express, deps: HttpRouteDeps): void {
  app
    .route("/api/v1/workspaces")
    .get(async (req, res) => {
      await handleWorkspaceInventory(
        {
          orchestrator: deps.orchestrator,
          configStore: deps.configStore,
        },
        req,
        res,
      );
    })
    .all((_req, res) => {
      methodNotAllowed(res);
    });

  app
    .route("/api/v1/workspaces/:workspace_key")
    .delete(async (req, res) => {
      await handleWorkspaceRemove(
        {
          orchestrator: deps.orchestrator,
          configStore: deps.configStore,
        },
        req,
        res,
      );
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
  if (deps.secretsStore && deps.configOverlayStore && deps.archiveDir) {
    registerSetupApi(app, {
      secretsStore: deps.secretsStore,
      configOverlayStore: deps.configOverlayStore,
      orchestrator: deps.orchestrator,
      archiveDir: deps.archiveDir,
    });
  }
  if (deps.templateStore) {
    registerTemplateApi(app, { templateStore: deps.templateStore });
  }
  if (deps.auditLogger) {
    registerAuditApi(app, { auditLogger: deps.auditLogger });
  }
}
