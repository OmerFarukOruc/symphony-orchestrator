import { describe, expect, it } from "vitest";

import {
  abortResponseSchema,
  attemptDetailResponseSchema,
  attemptsListResponseSchema,
  configOverlayGetResponseSchema,
  configOverlayPatchResponseSchema,
  configOverlayPutRequestSchema,
  configOverlayPutResponseSchema,
  configResponseSchema,
  configSchemaResponseSchema,
  errorResponseSchema,
  gitContextResponseSchema,
  issueDetailResponseSchema,
  modelUpdateResponseSchema,
  refreshResponseSchema,
  runtimeResponseSchema,
  stateResponseSchema,
  transitionResponseSchema,
  transitionsListResponseSchema,
  validationErrorSchema,
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
    generatedAt: "2026-04-01T00:00:00Z",
    counts: { running: 0, retrying: 0 },
    running: [],
    retrying: [],
    workflowColumns: [],
    codexTotals: { inputTokens: 0, outputTokens: 0, totalTokens: 0, secondsRunning: 0, costUsd: 0 },
    rateLimits: null,
    recentEvents: [],
  };

  it("parses a minimal valid state snapshot", () => {
    const result = stateResponseSchema.parse(minimalState);
    expect(result.generatedAt).toBe("2026-04-01T00:00:00Z");
    expect(result.counts.running).toBe(0);
    expect(result.running).toEqual([]);
  });

  it("parses state with optional fields", () => {
    const result = stateResponseSchema.parse({
      ...minimalState,
      queued: [],
      completed: [],
      stallEvents: [],
      systemHealth: { status: "healthy", checkedAt: "2026-04-01T00:00:00Z", runningCount: 0, message: "ok" },
      webhookHealth: {
        status: "active",
        effectiveIntervalMs: 60000,
        stats: { deliveriesReceived: 5, lastDeliveryAt: null, lastEventType: null },
        lastDeliveryAt: null,
        lastEventType: null,
      },
      availableModels: ["gpt-5.4"],
    });
    expect(result.systemHealth?.status).toBe("healthy");
    expect(result.availableModels).toEqual(["gpt-5.4"]);
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
    expect(stateResponseSchema.safeParse({ generatedAt: "x" }).success).toBe(false);
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
    });
    expect(result.issueIdentifier).toBe("ENG-1");
    expect(result.turnCount).toBe(3);
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

describe("gitContextResponseSchema", () => {
  const validGitContext = {
    repos: [
      {
        repoUrl: "https://github.com/org/repo",
        defaultBranch: "main",
        identifierPrefix: "ENG",
        label: null,
        githubOwner: "org",
        githubRepo: "repo",
        configured: true,
      },
    ],
    activeBranches: [],
    githubAvailable: true,
  };

  it("parses a valid git context response", () => {
    const result = gitContextResponseSchema.parse(validGitContext);
    expect(result.repos).toHaveLength(1);
    expect(result.githubAvailable).toBe(true);
  });

  it("parses with github enrichment", () => {
    const result = gitContextResponseSchema.parse({
      ...validGitContext,
      repos: [
        {
          ...validGitContext.repos[0],
          github: {
            description: "A test repo",
            visibility: "private",
            openPrCount: 2,
            pulls: [
              {
                number: 1,
                title: "PR 1",
                author: "dev",
                state: "open",
                updatedAt: "2026-04-01T00:00:00Z",
                url: "https://github.com/org/repo/pull/1",
                headBranch: "feature/1",
                checksStatus: null,
              },
            ],
            recentCommits: [{ sha: "abc1234", message: "fix: something", author: "dev", date: "2026-04-01T00:00:00Z" }],
          },
        },
      ],
    });
    expect(result.repos[0].github?.openPrCount).toBe(2);
  });

  it("parses with active branches", () => {
    const result = gitContextResponseSchema.parse({
      ...validGitContext,
      activeBranches: [
        {
          identifier: "ENG-1",
          branchName: "fix/bug-1",
          status: "running",
          workspacePath: "/tmp/ws-1",
          issueTitle: "Fix bug",
          pullRequestUrl: null,
        },
      ],
    });
    expect(result.activeBranches).toHaveLength(1);
    expect(result.activeBranches[0].branchName).toBe("fix/bug-1");
  });

  it("rejects missing repos", () => {
    const { repos: _, ...incomplete } = validGitContext;
    expect(gitContextResponseSchema.safeParse(incomplete).success).toBe(false);
  });

  it("rejects missing githubAvailable", () => {
    const { githubAvailable: _, ...incomplete } = validGitContext;
    expect(gitContextResponseSchema.safeParse(incomplete).success).toBe(false);
  });
});

describe("configResponseSchema", () => {
  it("parses a freeform config object", () => {
    const result = configResponseSchema.parse({ codex: { model: "gpt-5.4" }, server: { port: 4000 } });
    expect(result.codex).toEqual({ model: "gpt-5.4" });
  });

  it("parses empty config", () => {
    const result = configResponseSchema.parse({});
    expect(result).toEqual({});
  });

  it("rejects non-object values", () => {
    expect(configResponseSchema.safeParse("string").success).toBe(false);
    expect(configResponseSchema.safeParse(123).success).toBe(false);
  });
});

describe("configSchemaResponseSchema", () => {
  it("parses a freeform schema object", () => {
    const result = configSchemaResponseSchema.parse({
      overlay_put_body_examples: [],
      routes: { get_config: "GET /api/v1/config" },
    });
    expect(result.routes).toEqual({ get_config: "GET /api/v1/config" });
  });

  it("rejects non-object values", () => {
    expect(configSchemaResponseSchema.safeParse(42).success).toBe(false);
  });
});

describe("configOverlayGetResponseSchema", () => {
  it("parses a valid overlay get response", () => {
    const result = configOverlayGetResponseSchema.parse({
      overlay: { codex: { model: "gpt-5.4" } },
    });
    expect(result.overlay.codex).toEqual({ model: "gpt-5.4" });
  });

  it("accepts empty overlay", () => {
    const result = configOverlayGetResponseSchema.parse({ overlay: {} });
    expect(result.overlay).toEqual({});
  });

  it("rejects missing overlay key", () => {
    expect(configOverlayGetResponseSchema.safeParse({}).success).toBe(false);
  });
});

describe("configOverlayPutResponseSchema", () => {
  it("parses a valid overlay put response", () => {
    const result = configOverlayPutResponseSchema.parse({
      updated: true,
      overlay: { codex: { model: "gpt-5.4" } },
    });
    expect(result.updated).toBe(true);
  });

  it("rejects missing updated field", () => {
    expect(configOverlayPutResponseSchema.safeParse({ overlay: {} }).success).toBe(false);
  });

  it("rejects missing overlay field", () => {
    expect(configOverlayPutResponseSchema.safeParse({ updated: true }).success).toBe(false);
  });
});

describe("configOverlayPatchResponseSchema", () => {
  it("parses a valid overlay patch response", () => {
    const result = configOverlayPatchResponseSchema.parse({
      updated: true,
      overlay: { server: { port: 4001 } },
    });
    expect(result.updated).toBe(true);
  });

  it("rejects non-boolean updated", () => {
    expect(configOverlayPatchResponseSchema.safeParse({ updated: "yes", overlay: {} }).success).toBe(false);
  });
});

describe("configOverlayPutRequestSchema", () => {
  it("parses a request with patch field", () => {
    const result = configOverlayPutRequestSchema.parse({
      patch: { codex: { model: "gpt-5.4" } },
    });
    expect(result.patch).toEqual({ codex: { model: "gpt-5.4" } });
  });

  it("parses a request without patch field (direct overlay)", () => {
    const result = configOverlayPutRequestSchema.parse({
      codex: { model: "gpt-5.4" },
    });
    expect(result.codex).toEqual({ model: "gpt-5.4" });
  });

  it("accepts empty object", () => {
    const result = configOverlayPutRequestSchema.parse({});
    expect(result).toEqual({});
  });

  it("rejects non-object values", () => {
    expect(configOverlayPutRequestSchema.safeParse("string").success).toBe(false);
  });
});
