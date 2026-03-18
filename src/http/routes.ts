import type { Express, Request, Response } from "express";

import { registerConfigApi } from "../config-api.js";
import type { ConfigStore } from "../config.js";
import type { ConfigOverlayStore } from "../config-overlay.js";
import { renderDashboardTemplate } from "../dashboard-template.js";
import { renderLogsTemplate } from "../logs-template.js";
import { globalMetrics } from "../metrics.js";
import { Orchestrator } from "../orchestrator.js";
import { createPlanningRouter, type PlanningExecutionResult } from "../planning-api.js";
import type { PlannedIssue } from "../planning-skill.js";
import { registerSecretsApi } from "../secrets-api.js";
import type { SecretsStore } from "../secrets-store.js";
import type { RuntimeSnapshot } from "../types.js";
import { isRecord } from "../utils/type-guards.js";
import { handleAttemptDetail } from "./attempt-handler.js";
import { handleModelUpdate } from "./model-handler.js";

function methodNotAllowed(response: Response): void {
  response.status(405).json({
    error: {
      code: "method_not_allowed",
      message: "Method Not Allowed",
    },
  });
}

function serializeSnapshot(snapshot: RuntimeSnapshot & Record<string, unknown>): Record<string, unknown> {
  return {
    generated_at: snapshot.generatedAt,
    counts: snapshot.counts,
    queued: snapshot.queued ?? [],
    running: snapshot.running,
    retrying: snapshot.retrying,
    completed: snapshot.completed ?? [],
    workflow_columns: (snapshot.workflowColumns ?? []).map((column) => ({
      key: column.key,
      label: column.label,
      kind: column.kind,
      terminal: Boolean(column.terminal),
      count: column.count,
      issues: column.issues,
    })),
    codex_totals: {
      input_tokens: snapshot.codexTotals.inputTokens,
      output_tokens: snapshot.codexTotals.outputTokens,
      total_tokens: snapshot.codexTotals.totalTokens,
      seconds_running: snapshot.codexTotals.secondsRunning,
    },
    rate_limits: snapshot.rateLimits,
    recent_events: snapshot.recentEvents.map((event) => ({
      at: event.at,
      issue_id: event.issueId,
      issue_identifier: event.issueIdentifier,
      session_id: event.sessionId,
      event: event.event,
      message: event.message,
      content: event.content ?? null,
    })),
  };
}

function isSensitiveKey(key: string): boolean {
  return /(api_?key|token|secret|webhook|password|auth)/i.test(key);
}

function sanitizeConfigValue(value: unknown, path: string[] = []): unknown {
  if (Array.isArray(value)) {
    return value.map((item, index) => sanitizeConfigValue(item, [...path, String(index)]));
  }
  if (!isRecord(value)) {
    return value;
  }
  const sanitized: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    sanitized[key] = isSensitiveKey(key) ? "[REDACTED]" : sanitizeConfigValue(child, [...path, key]);
  }
  return sanitized;
}

function refreshReason(request: Request): string {
  return request.get("x-symphony-reason") ?? "http_refresh";
}

export interface HttpRouteDeps {
  orchestrator: Orchestrator;
  configStore?: ConfigStore;
  configOverlayStore?: ConfigOverlayStore;
  secretsStore?: SecretsStore;
  executePlan?: (issues: PlannedIssue[]) => Promise<PlanningExecutionResult>;
}

export function registerHttpRoutes(app: Express, deps: HttpRouteDeps): void {
  app
    .route("/")
    .get((_request, response) => {
      response.type("html").send(renderDashboardTemplate());
    })
    .all((_request, response) => {
      methodNotAllowed(response);
    });

  app
    .route("/logs/:issue_identifier")
    .get((request, response) => {
      response.type("html").send(renderLogsTemplate(request.params.issue_identifier));
    })
    .all((_request, response) => {
      methodNotAllowed(response);
    });

  app
    .route("/api/v1/state")
    .get((_request, response) => {
      response.json(serializeSnapshot(deps.orchestrator.getSnapshot() as RuntimeSnapshot & Record<string, unknown>));
    })
    .all((_request, response) => {
      methodNotAllowed(response);
    });

  app
    .route("/metrics")
    .get((_request, response) => {
      response.setHeader("content-type", "text/plain; version=0.0.4; charset=utf-8");
      response.send(globalMetrics.serialize());
    })
    .all((_request, response) => {
      methodNotAllowed(response);
    });

  app
    .route("/api/v1/refresh")
    .post((request, response) => {
      const refresh = deps.orchestrator.requestRefresh(refreshReason(request));
      response.status(202).json({
        queued: refresh.queued,
        coalesced: refresh.coalesced,
        requested_at: refresh.requestedAt,
      });
    })
    .all((_request, response) => {
      methodNotAllowed(response);
    });

  if (deps.configStore && deps.configOverlayStore) {
    registerConfigApi(app, {
      getEffectiveConfig: () =>
        sanitizeConfigValue(deps.configStore?.getMergedConfigMap() ?? {}) as Record<string, unknown>,
      configOverlayStore: deps.configOverlayStore,
    });
  }

  if (deps.secretsStore) {
    registerSecretsApi(app, {
      secretsStore: deps.secretsStore,
    });
  }

  app.use(
    createPlanningRouter({
      executePlan: deps.executePlan ? (issues) => deps.executePlan!(issues) : undefined,
    }),
  );

  app
    .route("/api/v1/:issue_identifier/model")
    .post(async (request, response) => {
      await handleModelUpdate(deps.orchestrator, request, response);
    })
    .all((_request, response) => {
      methodNotAllowed(response);
    });

  app
    .route("/api/v1/:issue_identifier/attempts")
    .get((request, response) => {
      const detail = deps.orchestrator.getIssueDetail(request.params.issue_identifier);
      if (!detail) {
        response.status(404).json({
          error: {
            code: "not_found",
            message: "Unknown issue identifier",
          },
        });
        return;
      }
      response.json({
        attempts: detail.attempts ?? [],
        current_attempt_id: detail.currentAttemptId ?? null,
      });
    })
    .all((_request, response) => {
      methodNotAllowed(response);
    });

  app
    .route("/api/v1/attempts/:attempt_id")
    .get((request, response) => {
      handleAttemptDetail(deps.orchestrator, request, response);
    })
    .all((_request, response) => {
      methodNotAllowed(response);
    });

  app
    .route("/api/v1/:issue_identifier")
    .get((request, response) => {
      const detail = deps.orchestrator.getIssueDetail(request.params.issue_identifier);
      if (!detail) {
        response.status(404).json({
          error: {
            code: "not_found",
            message: "Unknown issue identifier",
          },
        });
        return;
      }
      response.json(detail);
    })
    .all((_request, response) => {
      methodNotAllowed(response);
    });
}
