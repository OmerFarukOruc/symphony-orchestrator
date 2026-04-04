import { describe, expect, it } from "vitest";

import {
  abortResponseSchema,
  alertHistoryListResponseSchema,
  automationRunResponseSchema,
  automationRunsListResponseSchema,
  automationsListResponseSchema,
  attemptDetailResponseSchema,
  attemptsListResponseSchema,
  errorResponseSchema,
  issueDetailResponseSchema,
  modelUpdateResponseSchema,
  recoveryReportResponseSchema,
  refreshResponseSchema,
  runtimeResponseSchema,
  stateResponseSchema,
  triggerResponseSchema,
  transitionResponseSchema,
  transitionsListResponseSchema,
  validationErrorSchema,
  webhookAcceptedResponseSchema,
  workspaceInventoryResponseSchema,
} from "../../src/http/response-schemas.js";

describe("refreshResponseSchema", () => {
  it("parses a valid refresh response", () => {
    const result = refreshResponseSchema.parse({
      queued: true,
      coalesced: false,
      requested_at: "2026-03-28T12:00:00Z",
    });
    expect(result.queued).toBe(true);
    expect(result.coalesced).toBe(false);
    expect(result.requested_at).toBe("2026-03-28T12:00:00Z");
  });

  it("rejects missing fields", () => {
    expect(refreshResponseSchema.safeParse({ queued: true }).success).toBe(false);
    expect(refreshResponseSchema.safeParse({ coalesced: false }).success).toBe(false);
    expect(refreshResponseSchema.safeParse({}).success).toBe(false);
  });

  it("rejects non-boolean queued", () => {
    const result = refreshResponseSchema.safeParse({
      queued: "yes",
      coalesced: false,
      requested_at: "2026-03-28T12:00:00Z",
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-string requested_at", () => {
    const result = refreshResponseSchema.safeParse({
      queued: true,
      coalesced: false,
      requested_at: 12345,
    });
    expect(result.success).toBe(false);
  });
});

describe("abortResponseSchema", () => {
  it("parses a valid abort response", () => {
    const result = abortResponseSchema.parse({
      ok: true,
      status: "stopping",
      already_stopping: false,
      requested_at: "2026-03-28T12:00:00Z",
    });
    expect(result.ok).toBe(true);
    expect(result.status).toBe("stopping");
    expect(result.already_stopping).toBe(false);
  });

  it("requires ok to be literal true", () => {
    const result = abortResponseSchema.safeParse({
      ok: false,
      status: "stopping",
      already_stopping: false,
      requested_at: "2026-03-28T12:00:00Z",
    });
    expect(result.success).toBe(false);
  });

  it("requires status to be literal stopping", () => {
    const result = abortResponseSchema.safeParse({
      ok: true,
      status: "stopped",
      already_stopping: false,
      requested_at: "2026-03-28T12:00:00Z",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing fields", () => {
    expect(abortResponseSchema.safeParse({}).success).toBe(false);
    expect(abortResponseSchema.safeParse({ ok: true }).success).toBe(false);
  });
});

describe("transitionResponseSchema", () => {
  it("parses a full transition response", () => {
    const result = transitionResponseSchema.parse({
      ok: true,
      from: "backlog",
      to: "in_progress",
      reason: "manual transition",
    });
    expect(result.ok).toBe(true);
    expect(result.from).toBe("backlog");
    expect(result.to).toBe("in_progress");
    expect(result.reason).toBe("manual transition");
  });

  it("parses a minimal transition response (optional fields omitted)", () => {
    const result = transitionResponseSchema.parse({ ok: false });
    expect(result.ok).toBe(false);
    expect(result.from).toBeUndefined();
    expect(result.to).toBeUndefined();
    expect(result.reason).toBeUndefined();
  });

  it("rejects missing ok field", () => {
    const result = transitionResponseSchema.safeParse({ from: "backlog", to: "done" });
    expect(result.success).toBe(false);
  });

  it("rejects non-boolean ok", () => {
    const result = transitionResponseSchema.safeParse({ ok: "yes" });
    expect(result.success).toBe(false);
  });
});

describe("errorResponseSchema", () => {
  it("parses a valid error response", () => {
    const result = errorResponseSchema.parse({
      error: { code: "NOT_FOUND", message: "Issue not found" },
    });
    expect(result.error.code).toBe("NOT_FOUND");
    expect(result.error.message).toBe("Issue not found");
  });

  it("rejects missing error.code", () => {
    const result = errorResponseSchema.safeParse({
      error: { message: "oops" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing error.message", () => {
    const result = errorResponseSchema.safeParse({
      error: { code: "ERR" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing error envelope", () => {
    const result = errorResponseSchema.safeParse({ code: "ERR", message: "flat" });
    expect(result.success).toBe(false);
  });
});

describe("validationErrorSchema", () => {
  it("parses a valid validation error", () => {
    const result = validationErrorSchema.parse({
      error: "validation_error",
      details: [{ code: "invalid_type", path: ["model"], message: "Expected string, received number" }],
    });
    expect(result.error).toBe("validation_error");
    expect(result.details).toHaveLength(1);
    expect(result.details[0].code).toBe("invalid_type");
    expect(result.details[0].path).toEqual(["model"]);
  });

  it("supports numeric path segments", () => {
    const result = validationErrorSchema.parse({
      error: "validation_error",
      details: [{ code: "too_small", path: ["items", 0, "name"], message: "Required" }],
    });
    expect(result.details[0].path).toEqual(["items", 0, "name"]);
  });

  it("parses with empty details array", () => {
    const result = validationErrorSchema.parse({
      error: "validation_error",
      details: [],
    });
    expect(result.details).toHaveLength(0);
  });

  it("requires error to be literal validation_error", () => {
    const result = validationErrorSchema.safeParse({
      error: "server_error",
      details: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects details without required fields", () => {
    const result = validationErrorSchema.safeParse({
      error: "validation_error",
      details: [{ code: "err" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing details", () => {
    const result = validationErrorSchema.safeParse({ error: "validation_error" });
    expect(result.success).toBe(false);
  });
});

describe("runtimeResponseSchema", () => {
  it("parses a valid runtime response", () => {
    const result = runtimeResponseSchema.parse({
      version: "0.5.0",
      data_dir: "/tmp/.risoluto",
      feature_flags: { sse: true },
      provider_summary: "linear",
    });
    expect(result.version).toBe("0.5.0");
    expect(result.data_dir).toBe("/tmp/.risoluto");
    expect(result.feature_flags).toEqual({ sse: true });
    expect(result.provider_summary).toBe("linear");
  });

  it("accepts empty feature_flags record", () => {
    const result = runtimeResponseSchema.parse({
      version: "1.0.0",
      data_dir: "./data",
      feature_flags: {},
      provider_summary: "github",
    });
    expect(result.feature_flags).toEqual({});
  });

  it("rejects missing fields", () => {
    expect(runtimeResponseSchema.safeParse({}).success).toBe(false);
    expect(runtimeResponseSchema.safeParse({ version: "1.0" }).success).toBe(false);
  });

  it("rejects non-string version", () => {
    const result = runtimeResponseSchema.safeParse({
      version: 1,
      data_dir: "./data",
      feature_flags: {},
      provider_summary: "linear",
    });
    expect(result.success).toBe(false);
  });
});

describe("recoveryReportResponseSchema", () => {
  it("parses a valid recovery report", () => {
    const result = recoveryReportResponseSchema.parse({
      generatedAt: "2026-04-03T17:45:00.000Z",
      dryRun: false,
      totalScanned: 1,
      resumed: ["attempt-1"],
      cleanedUp: [],
      escalated: [],
      skipped: [],
      errors: [],
      results: [
        {
          attemptId: "attempt-1",
          issueId: "issue-1",
          issueIdentifier: "NIN-42",
          persistedStatus: "running",
          attemptNumber: 2,
          threadId: "thread-1",
          workspacePath: "/tmp/ws",
          workspaceExists: true,
          workerAlive: false,
          containerNames: [],
          action: "resume",
          reason: "Workspace and thread id are intact; resume is possible",
          success: true,
          autoCommitSha: null,
          workspacePreserved: false,
          error: null,
        },
      ],
      durationMs: 12,
    });
    expect(result.totalScanned).toBe(1);
    expect(result.resumed).toEqual(["attempt-1"]);
  });

  it("accepts the empty default report shape", () => {
    const result = recoveryReportResponseSchema.parse({
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
    });
    expect(result.generatedAt).toBeNull();
    expect(result.results).toEqual([]);
  });
});

describe("attemptsListResponseSchema", () => {
  it("parses a valid attempts list with entries", () => {
    const result = attemptsListResponseSchema.parse({
      attempts: [
        { id: "a1", status: "done" },
        { id: "a2", status: "running" },
      ],
      current_attempt_id: "a2",
    });
    expect(result.attempts).toHaveLength(2);
    expect(result.current_attempt_id).toBe("a2");
  });

  it("parses with null current_attempt_id", () => {
    const result = attemptsListResponseSchema.parse({
      attempts: [],
      current_attempt_id: null,
    });
    expect(result.attempts).toHaveLength(0);
    expect(result.current_attempt_id).toBeNull();
  });

  it("rejects missing attempts array", () => {
    const result = attemptsListResponseSchema.safeParse({ current_attempt_id: null });
    expect(result.success).toBe(false);
  });

  it("rejects missing current_attempt_id", () => {
    const result = attemptsListResponseSchema.safeParse({ attempts: [] });
    expect(result.success).toBe(false);
  });

  it("rejects non-array attempts", () => {
    const result = attemptsListResponseSchema.safeParse({
      attempts: "not-an-array",
      current_attempt_id: null,
    });
    expect(result.success).toBe(false);
  });
});

describe("webhookAcceptedResponseSchema", () => {
  it("parses a minimal accepted webhook response", () => {
    const result = webhookAcceptedResponseSchema.parse({ ok: true });
    expect(result.ok).toBe(true);
  });

  it("rejects any non-true ok value", () => {
    expect(webhookAcceptedResponseSchema.safeParse({ ok: false }).success).toBe(false);
  });
});

describe("triggerResponseSchema", () => {
  it("parses a trigger refresh response", () => {
    const result = triggerResponseSchema.parse({
      ok: true,
      action: "re_poll",
      queued: true,
      coalesced: false,
    });
    expect(result.action).toBe("re_poll");
    expect(result.queued).toBe(true);
  });

  it("parses a create_issue response with identifiers", () => {
    const result = triggerResponseSchema.parse({
      ok: true,
      action: "create_issue",
      issueId: "issue-1",
      issueIdentifier: "ENG-1",
      issueUrl: "https://tracker.example/issues/ENG-1",
    });
    expect(result.issueIdentifier).toBe("ENG-1");
  });
});

describe("automationsListResponseSchema", () => {
  it("parses automation scheduler state", () => {
    const result = automationsListResponseSchema.parse({
      automations: [
        {
          name: "nightly-report",
          schedule: "0 2 * * *",
          mode: "report",
          enabled: true,
          repoUrl: "https://github.com/acme/app",
          valid: true,
          nextRun: "2026-04-05T00:00:00.000Z",
          lastError: null,
        },
      ],
    });
    expect(result.automations).toHaveLength(1);
  });
});

describe("automationRunsListResponseSchema", () => {
  const run = {
    id: "run-1",
    automationName: "nightly-report",
    mode: "report",
    trigger: "manual",
    repoUrl: "https://github.com/acme/app",
    status: "completed",
    output: "ok",
    details: null,
    issueId: null,
    issueIdentifier: null,
    issueUrl: null,
    error: null,
    startedAt: "2026-04-04T11:00:00.000Z",
    finishedAt: "2026-04-04T11:01:00.000Z",
  };

  it("parses run history lists", () => {
    const result = automationRunsListResponseSchema.parse({
      runs: [run],
      totalCount: 1,
    });
    expect(result.totalCount).toBe(1);
  });

  it("parses manual run responses", () => {
    const result = automationRunResponseSchema.parse({
      ok: true,
      run,
    });
    expect(result.run.id).toBe("run-1");
  });
});

describe("alertHistoryListResponseSchema", () => {
  it("parses alert history lists", () => {
    const result = alertHistoryListResponseSchema.parse({
      history: [
        {
          id: "alert-1",
          ruleName: "worker-failures",
          eventType: "worker.failed",
          severity: "critical",
          status: "delivered",
          channels: ["ops-webhook"],
          deliveredChannels: ["ops-webhook"],
          failedChannels: [],
          message: "ENG-1 matched worker-failures",
          createdAt: "2026-04-04T11:30:00.000Z",
        },
      ],
    });
    expect(result.history).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------ */
/*  New schema tests — Unit 2: OpenAPI Schema Tightening                */
/* ------------------------------------------------------------------ */

describe("transitionsListResponseSchema", () => {
  it("parses a valid transitions response", () => {
    const result = transitionsListResponseSchema.parse({
      transitions: { backlog: ["in_progress"], in_progress: ["done", "backlog"] },
    });
    expect(result.transitions.backlog).toEqual(["in_progress"]);
    expect(result.transitions.in_progress).toEqual(["done", "backlog"]);
  });

  it("accepts empty transitions", () => {
    const result = transitionsListResponseSchema.parse({ transitions: {} });
    expect(result.transitions).toEqual({});
  });

  it("rejects missing transitions key", () => {
    expect(transitionsListResponseSchema.safeParse({}).success).toBe(false);
  });

  it("rejects non-array transition values", () => {
    expect(transitionsListResponseSchema.safeParse({ transitions: { a: "b" } }).success).toBe(false);
  });
});

describe("stateResponseSchema", () => {
  const minimalState = {
    generated_at: "2026-04-01T00:00:00Z",
    counts: { running: 0, retrying: 0 },
    running: [],
    retrying: [],
    workflow_columns: [],
    codex_totals: { input_tokens: 0, output_tokens: 0, total_tokens: 0, seconds_running: 0, cost_usd: 0 },
    rate_limits: null,
    recent_events: [],
  };

  it("parses a minimal valid state snapshot", () => {
    const result = stateResponseSchema.parse(minimalState);
    expect(result.generated_at).toBe("2026-04-01T00:00:00Z");
    expect(result.counts.running).toBe(0);
    expect(result.running).toEqual([]);
  });

  it("parses state with optional fields", () => {
    const result = stateResponseSchema.parse({
      ...minimalState,
      queued: [],
      completed: [],
      stall_events: [],
      system_health: { status: "healthy", checked_at: "2026-04-01T00:00:00Z", running_count: 0, message: "ok" },
      webhook_health: {
        status: "active",
        effective_interval_ms: 60000,
        stats: { deliveries_received: 5, last_delivery_at: null, last_event_type: null },
        last_delivery_at: null,
        last_event_type: null,
      },
      available_models: ["gpt-5.4"],
    });
    expect(result.system_health?.status).toBe("healthy");
    expect(result.available_models).toEqual(["gpt-5.4"]);
  });

  it("parses state with running issues", () => {
    const issueView = {
      issueId: "id-1",
      identifier: "ENG-1",
      title: "Test issue",
      state: "in_progress",
      workspaceKey: "ws-1",
      message: null,
      status: "running",
      updatedAt: "2026-04-01T00:00:00Z",
      attempt: 1,
      error: null,
    };
    const result = stateResponseSchema.parse({
      ...minimalState,
      counts: { running: 1, retrying: 0 },
      running: [issueView],
    });
    expect(result.running).toHaveLength(1);
    expect(result.running[0].identifier).toBe("ENG-1");
  });

  it("rejects missing required fields", () => {
    expect(stateResponseSchema.safeParse({}).success).toBe(false);
    expect(stateResponseSchema.safeParse({ generated_at: "x" }).success).toBe(false);
  });
});

describe("issueDetailResponseSchema", () => {
  const minimalIssueDetail = {
    issueId: "id-1",
    identifier: "ENG-1",
    title: "Fix the bug",
    state: "in_progress",
    workspaceKey: "ws-1",
    message: null,
    status: "running",
    updatedAt: "2026-04-01T00:00:00Z",
    attempt: 1,
    error: null,
    recentEvents: [],
    attempts: [],
    currentAttemptId: null,
  };

  it("parses a valid issue detail", () => {
    const result = issueDetailResponseSchema.parse(minimalIssueDetail);
    expect(result.identifier).toBe("ENG-1");
    expect(result.currentAttemptId).toBeNull();
  });

  it("parses issue detail with optional fields", () => {
    const result = issueDetailResponseSchema.parse({
      ...minimalIssueDetail,
      priority: 2,
      labels: ["bug"],
      model: "gpt-5.4",
      reasoningEffort: "high",
      branchName: "fix/bug-123",
      blockedBy: [{ id: "id-2", identifier: "ENG-2", state: "in_progress" }],
    });
    expect(result.priority).toBe(2);
    expect(result.labels).toEqual(["bug"]);
    expect(result.blockedBy).toHaveLength(1);
  });

  it("rejects missing recentEvents", () => {
    const { recentEvents: _, ...incomplete } = minimalIssueDetail;
    expect(issueDetailResponseSchema.safeParse(incomplete).success).toBe(false);
  });

  it("rejects missing attempts", () => {
    const { attempts: _, ...incomplete } = minimalIssueDetail;
    expect(issueDetailResponseSchema.safeParse(incomplete).success).toBe(false);
  });
});

describe("attemptDetailResponseSchema", () => {
  const validAttempt = {
    attemptId: "att-1",
    attemptNumber: 1,
    startedAt: "2026-04-01T00:00:00Z",
    endedAt: null,
    status: "running",
    model: "gpt-5.4",
    reasoningEffort: "medium",
    tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    costUsd: 0.05,
    errorCode: null,
    errorMessage: null,
    events: [],
  };

  it("parses a valid attempt detail", () => {
    const result = attemptDetailResponseSchema.parse(validAttempt);
    expect(result.attemptId).toBe("att-1");
    expect(result.events).toEqual([]);
  });

  it("parses with events", () => {
    const result = attemptDetailResponseSchema.parse({
      ...validAttempt,
      events: [
        {
          at: "2026-04-01T00:01:00Z",
          issueId: "id-1",
          issueIdentifier: "ENG-1",
          sessionId: null,
          event: "turn_start",
          message: "Starting turn",
        },
      ],
    });
    expect(result.events).toHaveLength(1);
    expect(result.events[0].event).toBe("turn_start");
  });

  it("accepts optional fields", () => {
    const result = attemptDetailResponseSchema.parse({
      ...validAttempt,
      issueIdentifier: "ENG-1",
      title: "Fix bug",
      workspacePath: "/tmp/ws",
      workspaceKey: "ws-1",
      modelSource: "override",
      turnCount: 3,
      threadId: "thread-1",
      turnId: "turn-1",
      appServer: {
        effectiveProvider: "cliproxyapi",
        effectiveModel: "gpt-5.4",
        reasoningEffort: "medium",
        approvalPolicy: "never",
        threadName: "Issue thread",
        threadStatus: "active",
        threadStatusPayload: { type: "active", activeFlags: ["waitingOnApproval"] },
        allowedApprovalPolicies: ["never"],
        allowedSandboxModes: ["workspaceWrite"],
        networkRequirements: { enabled: true },
      },
    });
    expect(result.issueIdentifier).toBe("ENG-1");
    expect(result.turnCount).toBe(3);
    expect(result.appServer?.effectiveProvider).toBe("cliproxyapi");
  });

  it("rejects missing events", () => {
    const { events: _, ...incomplete } = validAttempt;
    expect(attemptDetailResponseSchema.safeParse(incomplete).success).toBe(false);
  });

  it("rejects missing attemptId", () => {
    const { attemptId: _, ...incomplete } = validAttempt;
    expect(attemptDetailResponseSchema.safeParse(incomplete).success).toBe(false);
  });
});

describe("modelUpdateResponseSchema", () => {
  const validUpdate = {
    updated: true,
    restarted: false,
    applies_next_attempt: true,
    selection: {
      model: "gpt-5.4",
      reasoning_effort: "high" as const,
      source: "override" as const,
    },
  };

  it("parses a valid model update response", () => {
    const result = modelUpdateResponseSchema.parse(validUpdate);
    expect(result.updated).toBe(true);
    expect(result.selection.model).toBe("gpt-5.4");
    expect(result.selection.source).toBe("override");
  });

  it("accepts null reasoning_effort", () => {
    const result = modelUpdateResponseSchema.parse({
      ...validUpdate,
      selection: { ...validUpdate.selection, reasoning_effort: null },
    });
    expect(result.selection.reasoning_effort).toBeNull();
  });

  it("rejects missing selection", () => {
    const { selection: _, ...incomplete } = validUpdate;
    expect(modelUpdateResponseSchema.safeParse(incomplete).success).toBe(false);
  });

  it("rejects invalid reasoning_effort", () => {
    const result = modelUpdateResponseSchema.safeParse({
      ...validUpdate,
      selection: { ...validUpdate.selection, reasoning_effort: "extreme" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid source", () => {
    const result = modelUpdateResponseSchema.safeParse({
      ...validUpdate,
      selection: { ...validUpdate.selection, source: "custom" },
    });
    expect(result.success).toBe(false);
  });
});

describe("workspaceInventoryResponseSchema", () => {
  const validInventory = {
    workspaces: [
      {
        workspace_key: "ws-1",
        path: "/tmp/ws-1",
        status: "running" as const,
        strategy: "directory",
        issue: { identifier: "ENG-1", title: "Test", state: "in_progress" },
        disk_bytes: 1024,
        last_modified_at: "2026-04-01T00:00:00Z",
      },
    ],
    generated_at: "2026-04-01T00:00:00Z",
    total: 1,
    active: 1,
    orphaned: 0,
  };

  it("parses a valid workspace inventory", () => {
    const result = workspaceInventoryResponseSchema.parse(validInventory);
    expect(result.workspaces).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.workspaces[0].status).toBe("running");
  });

  it("accepts empty workspaces", () => {
    const result = workspaceInventoryResponseSchema.parse({
      workspaces: [],
      generated_at: "2026-04-01T00:00:00Z",
      total: 0,
      active: 0,
      orphaned: 0,
    });
    expect(result.workspaces).toHaveLength(0);
  });

  it("accepts null issue and disk_bytes", () => {
    const result = workspaceInventoryResponseSchema.parse({
      ...validInventory,
      workspaces: [{ ...validInventory.workspaces[0], issue: null, disk_bytes: null, last_modified_at: null }],
    });
    expect(result.workspaces[0].issue).toBeNull();
    expect(result.workspaces[0].disk_bytes).toBeNull();
  });

  it("rejects invalid workspace status", () => {
    const result = workspaceInventoryResponseSchema.safeParse({
      ...validInventory,
      workspaces: [{ ...validInventory.workspaces[0], status: "invalid" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing generated_at", () => {
    const { generated_at: _, ...incomplete } = validInventory;
    expect(workspaceInventoryResponseSchema.safeParse(incomplete).success).toBe(false);
  });
});
