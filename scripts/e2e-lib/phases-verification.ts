/**
 * E2E lifecycle verification phase: verify-api-surface.
 *
 * Hits every relevant API endpoint after a successful issue lifecycle
 * and validates response shapes. Uses per-endpoint try/catch so a
 * single endpoint failure doesn't prevent validation of the rest.
 */

import type { PhaseResult, RunContext } from "./types.js";
import { fetchJson, sleep } from "./helpers.js";

// ---------------------------------------------------------------------------
// Types for API responses (top-level shape only)
// ---------------------------------------------------------------------------

interface CheckResult {
  endpoint: string;
  status: "pass" | "fail" | "skip";
  error?: string;
}

// ---------------------------------------------------------------------------
// Endpoint checks
// ---------------------------------------------------------------------------

async function checkState(baseUrl: string): Promise<CheckResult> {
  const endpoint = "/api/v1/state";
  const data = (await fetchJson(`${baseUrl}${endpoint}`)) as Record<string, unknown>;
  const required = [
    "generated_at",
    "counts",
    "running",
    "retrying",
    "completed",
    "queued",
    "codex_totals",
    "workflow_columns",
    "recent_events",
  ];
  const missing = required.filter((key) => !(key in data));
  if (missing.length > 0) {
    return { endpoint, status: "fail", error: `missing keys: ${missing.join(", ")}` };
  }
  return { endpoint, status: "pass" };
}

async function checkIssueDetail(baseUrl: string, identifier: string): Promise<CheckResult> {
  const endpoint = `/api/v1/${identifier}`;
  const data = (await fetchJson(`${baseUrl}${endpoint}`)) as Record<string, unknown>;
  const required = ["identifier", "title", "attempts", "currentAttemptId"];
  const missing = required.filter((key) => !(key in data));
  if (missing.length > 0) {
    return { endpoint, status: "fail", error: `missing keys: ${missing.join(", ")}` };
  }
  return { endpoint, status: "pass" };
}

async function checkIssueAttempts(
  baseUrl: string,
  identifier: string,
): Promise<{ result: CheckResult; attemptId: string | null }> {
  const endpoint = `/api/v1/${identifier}/attempts`;
  const data = (await fetchJson(`${baseUrl}${endpoint}`)) as Record<string, unknown>;
  const required = ["attempts", "current_attempt_id"];
  const missing = required.filter((key) => !(key in data));
  if (missing.length > 0) {
    return {
      result: { endpoint, status: "fail", error: `missing keys: ${missing.join(", ")}` },
      attemptId: null,
    };
  }
  const attempts = data["attempts"] as Array<Record<string, unknown>>;
  const attemptId = attempts.length > 0 ? String(attempts[0]["id"] ?? "") : null;
  return { result: { endpoint, status: "pass" }, attemptId };
}

async function checkAttemptDetail(baseUrl: string, attemptId: string): Promise<CheckResult> {
  const endpoint = `/api/v1/attempts/${attemptId}`;
  const data = (await fetchJson(`${baseUrl}${endpoint}`)) as Record<string, unknown>;
  const required = ["id", "status"];
  const missing = required.filter((key) => !(key in data));
  if (missing.length > 0) {
    return { endpoint, status: "fail", error: `missing keys: ${missing.join(", ")}` };
  }
  return { endpoint, status: "pass" };
}

async function checkRuntime(baseUrl: string): Promise<CheckResult> {
  const endpoint = "/api/v1/runtime";
  const data = (await fetchJson(`${baseUrl}${endpoint}`)) as Record<string, unknown>;
  const required = ["version", "data_dir"];
  const missing = required.filter((key) => !(key in data));
  if (missing.length > 0) {
    return { endpoint, status: "fail", error: `missing keys: ${missing.join(", ")}` };
  }
  return { endpoint, status: "pass" };
}

async function checkModels(baseUrl: string): Promise<CheckResult> {
  const endpoint = "/api/v1/models";
  const data = (await fetchJson(`${baseUrl}${endpoint}`)) as Record<string, unknown>;
  if (!("models" in data)) {
    return { endpoint, status: "fail", error: "missing key: models" };
  }
  return { endpoint, status: "pass" };
}

async function checkMetrics(baseUrl: string): Promise<CheckResult> {
  const endpoint = "/metrics";
  const response = await fetch(`${baseUrl}${endpoint}`);
  if (!response.ok) {
    return { endpoint, status: "fail", error: `HTTP ${String(response.status)}` };
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/plain")) {
    return { endpoint, status: "fail", error: `unexpected content-type: ${contentType}` };
  }
  const body = await response.text();
  if (!body.includes("# TYPE")) {
    return { endpoint, status: "fail", error: "response missing Prometheus # TYPE lines" };
  }
  return { endpoint, status: "pass" };
}

async function checkWorkspaces(baseUrl: string): Promise<CheckResult> {
  const endpoint = "/api/v1/workspaces";
  // Use raw fetch — handler returns 503 when workspaceRoot is falsy
  const response = await fetch(`${baseUrl}${endpoint}`);
  if (response.status === 503) {
    return { endpoint, status: "skip", error: "503 — workspace config not available" };
  }
  if (!response.ok) {
    return { endpoint, status: "fail", error: `HTTP ${String(response.status)}` };
  }
  const data = (await response.json()) as Record<string, unknown>;
  const required = ["workspaces", "generated_at", "total", "active", "orphaned"];
  const missing = required.filter((key) => !(key in data));
  if (missing.length > 0) {
    return { endpoint, status: "fail", error: `missing keys: ${missing.join(", ")}` };
  }
  return { endpoint, status: "pass" };
}

async function checkGitContext(baseUrl: string): Promise<CheckResult> {
  const endpoint = "/api/v1/git/context";
  const data = (await fetchJson(`${baseUrl}${endpoint}`)) as Record<string, unknown>;
  const required = ["repos", "activeBranches", "githubAvailable"];
  const missing = required.filter((key) => !(key in data));
  if (missing.length > 0) {
    return { endpoint, status: "fail", error: `missing keys: ${missing.join(", ")}` };
  }
  return { endpoint, status: "pass" };
}

async function checkSSE(baseUrl: string): Promise<CheckResult> {
  const endpoint = "/api/v1/events";
  // Layer 1: connection timeout (5s)
  const response = await fetch(`${baseUrl}${endpoint}`, {
    signal: AbortSignal.timeout(5000),
    headers: { accept: "text/event-stream" },
  });
  if (!response.ok) {
    return { endpoint, status: "fail", error: `HTTP ${String(response.status)}` };
  }
  if (!response.body) {
    return { endpoint, status: "fail", error: "no response body (SSE stream missing)" };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  // Layer 2: read timeout (3s) — race reader against a timer.
  // Cancel the reader in both the timeout and error paths so the stream
  // is not left open until the fetch signal fires.
  let readResult: ReadableStreamReadResult<Uint8Array>;
  try {
    readResult = await Promise.race([
      reader.read(),
      sleep(3000).then((): never => {
        throw new Error("SSE read timeout — no data within 3s");
      }),
    ]);
  } catch (error_) {
    reader.cancel().catch(() => {});
    throw error_;
  }

  reader.cancel().catch(() => {});

  if (readResult.done) {
    return { endpoint, status: "fail", error: "SSE stream closed immediately" };
  }

  const chunk = decoder.decode(readResult.value);
  if (!chunk.includes("connected")) {
    return { endpoint, status: "fail", error: `first SSE frame missing "connected": ${chunk.slice(0, 100)}` };
  }

  return { endpoint, status: "pass" };
}

// ---------------------------------------------------------------------------
// Phase entry point
// ---------------------------------------------------------------------------

export async function verifyApiSurface(ctx: RunContext): Promise<PhaseResult> {
  const start = Date.now();
  const checks: CheckResult[] = [];
  const errors: string[] = [];

  const identifier = ctx.issueIdentifier!;

  // Helper: run a check with per-endpoint error isolation
  async function runCheck(fn: () => Promise<CheckResult>): Promise<void> {
    try {
      const result = await fn();
      checks.push(result);
      if (result.status === "fail") {
        errors.push(`${result.endpoint}: ${result.error ?? "unknown error"}`);
      }
    } catch (error_: unknown) {
      const message = error_ instanceof Error ? error_.message : String(error_);
      // Extract endpoint name from error or use "unknown"
      const endpoint = message.includes("/api/")
        ? (message.split(" ").find((w) => w.includes("/api/")) ?? "unknown")
        : "unknown";
      checks.push({ endpoint, status: "fail", error: message });
      errors.push(`${endpoint}: ${message}`);
    }
  }

  // Run all checks — each isolated so one failure doesn't block the rest
  await runCheck(() => checkState(ctx.baseUrl));
  await runCheck(() => checkIssueDetail(ctx.baseUrl, identifier));

  let attemptId: string | null = null;
  await runCheck(async () => {
    const { result, attemptId: extractedId } = await checkIssueAttempts(ctx.baseUrl, identifier);
    attemptId = extractedId;
    return result;
  });

  if (attemptId) {
    await runCheck(() => checkAttemptDetail(ctx.baseUrl, attemptId!));
  } else {
    checks.push({
      endpoint: "/api/v1/attempts/{attempt_id}",
      status: "skip",
      error: "no attempt ID available from previous check",
    });
  }

  await runCheck(() => checkRuntime(ctx.baseUrl));
  await runCheck(() => checkModels(ctx.baseUrl));
  await runCheck(() => checkMetrics(ctx.baseUrl));
  await runCheck(() => checkWorkspaces(ctx.baseUrl));
  await runCheck(() => checkGitContext(ctx.baseUrl));
  await runCheck(() => checkSSE(ctx.baseUrl));

  const passed = checks.filter((c) => c.status === "pass").length;
  const failed = checks.filter((c) => c.status === "fail").length;
  const skipped = checks.filter((c) => c.status === "skip").length;

  if (failed > 0) {
    return {
      phase: "verify-api-surface",
      status: "fail",
      durationMs: Date.now() - start,
      error: { message: `${String(failed)} endpoint(s) failed: ${errors.join("; ")}` },
      data: { checkedEndpoints: checks.length, passed, failed, skipped, checks },
    };
  }

  return {
    phase: "verify-api-surface",
    status: "pass",
    durationMs: Date.now() - start,
    data: { checkedEndpoints: checks.length, passed, failed, skipped, checks },
  };
}
