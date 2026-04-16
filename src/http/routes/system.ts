import type { Express } from "express";

import { readCodexModelCatalog } from "../../codex/model-catalog.js";
import { createObservabilityHub } from "../../observability/hub.js";
import { createMetricsCollector } from "../../observability/metrics.js";
import type { RecoveryReport } from "../../orchestrator/recovery-types.js";
import type { HttpRouteDeps } from "../route-types.js";
import { methodNotAllowed, refreshReason, serializeObservabilitySummary } from "../route-helpers.js";
import { createSSEHandlerWithObserver } from "../sse.js";
import { getOpenApiSpec } from "../openapi.js";
import { getSwaggerHtml } from "../swagger-html.js";
import { handleGetTransitions } from "../transitions-api.js";

export function registerSystemRoutes(app: Express, deps: HttpRouteDeps): void {
  const metrics = deps.metrics ?? createMetricsCollector();
  const observability = deps.observability ?? createObservabilityHub({ archiveDir: deps.archiveDir });
  if (!deps.eventBus) {
    deps.logger?.warn({ msg: "eventBus not provided — /api/v1/events SSE endpoint will not be registered" });
  }

  app
    .route("/api/v1/state")
    .get((_req, res) => {
      res.json(deps.orchestrator.getSerializedState());
    })
    .all((_req, res) => {
      methodNotAllowed(res);
    });

  app
    .route("/api/v1/observability")
    .get(async (_req, res, next) => {
      try {
        const summary = await observability.aggregate({
          runtimeState: deps.orchestrator.getSerializedState(),
          rawMetrics: metrics.serialize(),
          attemptStoreConfigured: Boolean(deps.attemptStore),
        });
        res.json(serializeObservabilitySummary(summary));
      } catch (error) {
        next(error);
      }
    })
    .all((_req, res) => {
      methodNotAllowed(res);
    });

  app
    .route("/api/v1/runtime")
    .get((_req, res) => {
      res.json({
        version: process.env.npm_package_version ?? "unknown",
        data_dir: process.env.RISOLUTO_DATA_DIR ?? "",
        feature_flags: {},
        provider_summary: "Codex",
      });
    })
    .all((_req, res) => {
      methodNotAllowed(res);
    });

  app
    .route("/api/v1/recovery")
    .get((_req, res) => {
      const report = deps.orchestrator.getRecoveryReport();
      res.json(
        report ??
          ({
            generatedAt: null,
            dryRun: false,
            totalScanned: 0,
            resumed: [],
            cleanedUp: [],
            escalated: [],
            skipped: [],
            errors: [],
            results: [],
            durationMs: 0,
          } satisfies RecoveryReport | Record<string, unknown>),
      );
    })
    .all((_req, res) => {
      methodNotAllowed(res);
    });

  app
    .route("/metrics")
    .get((_req, res) => {
      res.setHeader("content-type", "text/plain; version=0.0.4; charset=utf-8");
      res.send(metrics.serialize());
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
      methodNotAllowed(res, ["POST"]);
    });

  if (deps.eventBus) {
    app
      .route("/api/v1/events")
      .get(createSSEHandlerWithObserver(deps.eventBus, observability.getComponent("sse")))
      .all((_req, res) => {
        methodNotAllowed(res);
      });
  }

  app
    .route("/api/v1/models")
    .get(async (_req, res) => {
      const models = await readCodexModelCatalog({
        controlPlane: deps.codexControlPlane,
        secretsStore: deps.secretsStore,
      });
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
