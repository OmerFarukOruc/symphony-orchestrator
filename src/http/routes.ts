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
import type { ReasoningEffort, RuntimeSnapshot } from "../types.js";
import { isRecord } from "../utils/type-guards.js";

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

function asModel(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function parseReasoningEffort(
  value: unknown,
): { ok: true; value: ReasoningEffort | null } | { ok: false; code: string; message: string } {
  if (value === null || value === undefined || value === "") {
    return { ok: true, value: null };
  }
  if (typeof value !== "string") {
    return { ok: false, code: "invalid_reasoning_effort", message: "reasoning_effort must be a string" };
  }
  const trimmed = value.trim();
  if (trimmed === "") {
    return { ok: true, value: null };
  }
  const valid: ReasoningEffort[] = ["none", "minimal", "low", "medium", "high", "xhigh"];
  if (valid.includes(trimmed as ReasoningEffort)) {
    return { ok: true, value: trimmed as ReasoningEffort };
  }
  return {
    ok: false,
    code: "invalid_reasoning_effort",
    message: `Invalid reasoning_effort "${trimmed}". Allowed values: ${valid.join(", ")}`,
  };
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
      const model = asModel(request.body?.model);
      const effortResult = parseReasoningEffort(request.body?.reasoning_effort ?? request.body?.reasoningEffort);
      if (!model) {
        response.status(400).json({
          error: {
            code: "invalid_model",
            message: "model is required",
          },
        });
        return;
      }
      if (!effortResult.ok) {
        response.status(400).json({
          error: {
            code: effortResult.code,
            message: effortResult.message,
          },
        });
        return;
      }
      const updated = await deps.orchestrator.updateIssueModelSelection({
        identifier: request.params.issue_identifier,
        model,
        reasoningEffort: effortResult.value,
      });
      if (!updated) {
        response.status(404).json({
          error: {
            code: "not_found",
            message: "Unknown issue identifier",
          },
        });
        return;
      }
      response.status(202).json({
        updated: updated.updated,
        restarted: updated.restarted,
        applies_next_attempt: updated.appliesNextAttempt,
        selection: {
          model: updated.selection.model,
          reasoning_effort: updated.selection.reasoningEffort,
          source: updated.selection.source,
        },
      });
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
      const attempt = deps.orchestrator.getAttemptDetail(request.params.attempt_id);
      if (!attempt) {
        response.status(404).json({
          error: {
            code: "not_found",
            message: "Unknown attempt identifier",
          },
        });
        return;
      }
      response.json(attempt);
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
