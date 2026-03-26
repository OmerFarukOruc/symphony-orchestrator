import type { FastifyReply, FastifyRequest } from "fastify";

import type { RuntimeSnapshot } from "../core/types.js";
import { redactSensitiveValue } from "../core/content-sanitizer.js";
import { isRecord } from "../utils/type-guards.js";
import type { ErrorEnvelope } from "./openapi.js";

/**
 * Error codes used across the API.
 *
 * Standard codes:
 * - method_not_allowed: HTTP 405 - Method not allowed on this endpoint
 * - not_found: HTTP 404 - Resource not found
 * - invalid_model: HTTP 400 - Invalid model parameter
 * - invalid_reasoning_effort: HTTP 400 - Invalid reasoning_effort value
 * - invalid_secret_key: HTTP 400 - Secret key format invalid
 * - invalid_secret_value: HTTP 400 - Secret value must be non-empty string
 * - secret_not_found: HTTP 404 - Secret key not found
 * - missing_target_state: HTTP 400 - target_state parameter required
 * - unavailable: HTTP 503 - Service/component unavailable
 */
export type ErrorCode =
  | "method_not_allowed"
  | "not_found"
  | "invalid_model"
  | "invalid_reasoning_effort"
  | "invalid_secret_key"
  | "invalid_secret_value"
  | "secret_not_found"
  | "missing_target_state"
  | "unavailable";

export function createError(code: ErrorCode, message: string): ErrorEnvelope {
  return {
    error: {
      code,
      message,
    },
  };
}

export function methodNotAllowed(reply: FastifyReply): void {
  reply.status(405).send(createError("method_not_allowed", "Method Not Allowed"));
}

export function notFound(reply: FastifyReply, message = "Unknown issue identifier"): void {
  reply.status(404).send(createError("not_found", message));
}

export function invalidModel(reply: FastifyReply, message = "model is required"): void {
  reply.status(400).send(createError("invalid_model", message));
}

export function invalidReasoningEffort(reply: FastifyReply, message: string): void {
  reply.status(400).send(createError("invalid_reasoning_effort", message));
}

export function invalidSecretKey(reply: FastifyReply): void {
  reply.status(400).send(createError("invalid_secret_key", "secret key must match /^[A-Za-z0-9._:-]+$/"));
}

export function invalidSecretValue(reply: FastifyReply): void {
  reply.status(400).send(createError("invalid_secret_value", "secret value must be a non-empty string"));
}

export function secretNotFound(reply: FastifyReply): void {
  reply.status(404).send(createError("secret_not_found", "secret key not found"));
}

export function missingTargetState(reply: FastifyReply): void {
  reply.status(400).send(createError("missing_target_state", "target_state is required"));
}

export function unavailable(reply: FastifyReply, message: string): void {
  reply.status(503).send(createError("unavailable", message));
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

export function refreshReason(request: FastifyRequest): string {
  const header = request.headers["x-symphony-reason"];
  return typeof header === "string" ? header : "http_refresh";
}
