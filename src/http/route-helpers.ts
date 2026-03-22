import type { Request, Response } from "express";

import type { RuntimeSnapshot } from "../core/types.js";
import { redactSensitiveValue } from "../core/content-sanitizer.js";
import { isRecord } from "../utils/type-guards.js";

export function methodNotAllowed(response: Response): void {
  response.status(405).json({
    error: {
      code: "method_not_allowed",
      message: "Method Not Allowed",
    },
  });
}

export function serializeSnapshot(snapshot: RuntimeSnapshot & Record<string, unknown>): Record<string, unknown> {
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
  };
}

function isSensitiveKey(key: string): boolean {
  return /(api_?key|token|secret|webhook|password|auth)/i.test(key);
}

function isSensitiveBranch(path: string[]): boolean {
  return path.some((segment) => /(headers?|credentials?|auth|secrets?)/i.test(segment));
}

export function sanitizeConfigValue(value: unknown, path: string[] = []): unknown {
  if (Array.isArray(value)) {
    return value.map((item, index) => sanitizeConfigValue(item, [...path, String(index)]));
  }
  if (!isRecord(value)) {
    return redactSensitiveValue(value);
  }
  const sanitized: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    const nextPath = [...path, key];
    const underSensitiveBranch = nextPath.some((segment) => isSensitiveKey(segment)) || isSensitiveBranch(nextPath);
    sanitized[key] = isSensitiveKey(key) || underSensitiveBranch ? "[REDACTED]" : sanitizeConfigValue(child, nextPath);
  }
  return sanitized;
}

export function refreshReason(request: Request): string {
  return request.get("x-symphony-reason") ?? "http_refresh";
}
