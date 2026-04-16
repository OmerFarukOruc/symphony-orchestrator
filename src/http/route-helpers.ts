import type { Request, Response } from "express";

import type { RuntimeSnapshot } from "../core/types.js";
import { redactSensitiveValue } from "../core/content-sanitizer.js";
import type { ObservabilitySummary } from "../observability/snapshot.js";
import { isRecord } from "../utils/type-guards.js";

export function issueNotFound(response: Response): void {
  response.status(404).json({ error: { code: "not_found", message: "Unknown issue identifier" } });
}

export function methodNotAllowed(response: Response, allowedMethods: string[] = ["GET"]): void {
  response.setHeader("Allow", allowedMethods.join(", "));
  response.status(405).json({
    error: {
      code: "method_not_allowed",
      message: "Method Not Allowed",
    },
  });
}

export function serializeSnapshot(snapshot: RuntimeSnapshot): Record<string, unknown> {
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
      count: column.count ?? column.issues?.length ?? 0,
      issues: column.issues ?? [],
    })),
    codex_totals: {
      input_tokens: snapshot.codexTotals.inputTokens,
      output_tokens: snapshot.codexTotals.outputTokens,
      total_tokens: snapshot.codexTotals.totalTokens,
      seconds_running: snapshot.codexTotals.secondsRunning,
      cost_usd: snapshot.codexTotals.costUsd,
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
      metadata: event.metadata ?? null,
    })),
    stall_events: snapshot.stallEvents?.map((e) => ({
      at: e.at,
      issue_id: e.issueId,
      issue_identifier: e.issueIdentifier,
      silent_ms: e.silentMs,
      timeout_ms: e.timeoutMs,
    })),
    system_health: snapshot.systemHealth
      ? {
          status: snapshot.systemHealth.status,
          checked_at: snapshot.systemHealth.checkedAt,
          running_count: snapshot.systemHealth.runningCount,
          message: snapshot.systemHealth.message,
        }
      : undefined,
    webhook_health: snapshot.webhookHealth
      ? {
          status: snapshot.webhookHealth.status,
          effective_interval_ms: snapshot.webhookHealth.effectiveIntervalMs,
          stats: {
            deliveries_received: snapshot.webhookHealth.stats.deliveriesReceived,
            last_delivery_at: snapshot.webhookHealth.stats.lastDeliveryAt,
            last_event_type: snapshot.webhookHealth.stats.lastEventType,
          },
          last_delivery_at: snapshot.webhookHealth.lastDeliveryAt,
          last_event_type: snapshot.webhookHealth.lastEventType,
        }
      : undefined,
  };
}

export function serializeObservabilitySummary(summary: ObservabilitySummary): Record<string, unknown> {
  return {
    generated_at: summary.generatedAt,
    snapshot_root: summary.snapshotRoot,
    components: summary.components.map((component) => ({
      component: component.component,
      pid: component.pid,
      updated_at: component.updatedAt,
      metrics: Object.fromEntries(
        Object.entries(component.metrics).map(([name, metric]) => [
          name,
          {
            total: metric.total,
            success: metric.success,
            failure: metric.failure,
            last_at: metric.lastAt ?? null,
            last_success_at: metric.lastSuccessAt ?? null,
            last_failure_at: metric.lastFailureAt ?? null,
            last_failure_reason: metric.lastFailureReason ?? null,
          },
        ]),
      ),
      health: Object.fromEntries(
        Object.entries(component.health).map(([surface, health]) => [
          surface,
          {
            surface: health.surface,
            component: health.component,
            status: health.status,
            updated_at: health.updatedAt,
            reason: health.reason ?? null,
            details: health.details ?? null,
          },
        ]),
      ),
      traces: component.traces.map((trace) => ({
        id: trace.id,
        component: trace.component,
        metric: trace.metric,
        operation: trace.operation,
        outcome: trace.outcome,
        correlation_id: trace.correlationId,
        started_at: trace.startedAt,
        ended_at: trace.endedAt,
        duration_ms: trace.durationMs,
        reason: trace.reason,
        data: trace.data ?? null,
      })),
      sessions: Object.fromEntries(
        Object.entries(component.sessions).map(([key, session]) => [
          key,
          {
            key: session.key,
            component: session.component,
            status: session.status,
            updated_at: session.updatedAt,
            correlation_id: session.correlationId,
            metadata: session.metadata ?? null,
          },
        ]),
      ),
    })),
    health: {
      status: summary.health.status,
      counts: summary.health.counts,
      surfaces: summary.health.surfaces.map((surface) => ({
        surface: surface.surface,
        component: surface.component,
        status: surface.status,
        updated_at: surface.updatedAt,
        reason: surface.reason ?? null,
        details: surface.details ?? null,
      })),
    },
    traces: summary.traces.map((trace) => ({
      id: trace.id,
      component: trace.component,
      metric: trace.metric,
      operation: trace.operation,
      outcome: trace.outcome,
      correlation_id: trace.correlationId,
      started_at: trace.startedAt,
      ended_at: trace.endedAt,
      duration_ms: trace.durationMs,
      reason: trace.reason,
      data: trace.data ?? null,
    })),
    session_state: summary.sessionState.map((session) => ({
      key: session.key,
      component: session.component,
      status: session.status,
      updated_at: session.updatedAt,
      correlation_id: session.correlationId,
      metadata: session.metadata ?? null,
    })),
    runtime_state: summary.runtimeState,
    raw_metrics: summary.rawMetrics,
  };
}

function isSensitiveKey(key: string): boolean {
  return /(api_?key|token|secret|webhook|password|auth)/i.test(key);
}

function isSensitiveBranch(path: string[]): boolean {
  return path.some((segment) => /(headers?|credentials?|auth)/i.test(segment));
}

function hasSensitiveKeyInPath(path: string[]): boolean {
  return path.some(isSensitiveKey);
}

function sanitizeConfigValueAtPath(value: unknown, path: string[]): unknown {
  const underSensitivePath = hasSensitiveKeyInPath(path) || isSensitiveBranch(path);
  if (Array.isArray(value)) {
    return value.map((item, index) => sanitizeConfigValueAtPath(item, [...path, String(index)]));
  }
  if (!isRecord(value)) {
    return underSensitivePath ? "[REDACTED]" : redactSensitiveValue(value);
  }
  const sanitized: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    const nextPath = [...path, key];
    const underSensitiveBranch = hasSensitiveKeyInPath(path) || isSensitiveBranch(nextPath);
    sanitized[key] =
      isSensitiveKey(key) || underSensitiveBranch ? "[REDACTED]" : sanitizeConfigValueAtPath(child, nextPath);
  }
  return sanitized;
}

export function sanitizeConfigValue(value: unknown, path?: string[]): unknown {
  return sanitizeConfigValueAtPath(value, path ?? new Array<string>());
}

export function refreshReason(request: Request): string {
  return request.get("x-risoluto-reason") ?? "http_refresh";
}
