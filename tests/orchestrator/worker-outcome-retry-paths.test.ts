import { describe, expect, it, vi, beforeEach } from "vitest";

import { handleContinuationRetry } from "../../src/orchestrator/worker-outcome/retry-paths.js";
import { handleContinuationExhausted } from "../../src/orchestrator/worker-outcome/retry-paths.js";
import { handleErrorRetry } from "../../src/orchestrator/worker-outcome/retry-paths.js";
import { handleModelOverrideRetry } from "../../src/orchestrator/worker-outcome/retry-paths.js";
import { queueRetryWithDelay } from "../../src/orchestrator/worker-outcome/retry-paths.js";
import type { Issue, ModelSelection, RuntimeIssueView, ServiceConfig, Workspace } from "../../src/core/types.js";
import type { OutcomeContext } from "../../src/orchestrator/context.js";
import type { RunningEntry } from "../../src/orchestrator/runtime-types.js";
import { createIssue, createWorkspace, createModelSelection, createRunningEntry } from "./issue-test-factories.js";

function makeConfig(overrides: Partial<ServiceConfig["agent"]> = {}): ServiceConfig {
  return {
    tracker: {
      kind: "linear",
      apiKey: "key",
      endpoint: "https://api.linear.app/graphql",
      projectSlug: "MT",
      activeStates: ["In Progress"],
      terminalStates: ["Done", "Canceled"],
    },
    agent: {
      maxConcurrentAgents: 5,
      maxConcurrentAgentsByState: {},
      maxTurns: 10,
      maxRetryBackoffMs: 300_000,
      maxContinuationAttempts: 5,
      successState: null,
      stallTimeoutMs: 1_200_000,
      ...overrides,
    },
  } as unknown as ServiceConfig;
}

function makeCtx(overrides: { config?: ServiceConfig } = {}): OutcomeContext {
  const config = overrides.config ?? makeConfig();
  return {
    runningEntries: new Map<string, RunningEntry>(),
    completedViews: new Map<string, RuntimeIssueView>(),
    detailViews: new Map<string, RuntimeIssueView>(),
    deps: {
      tracker: {
        fetchIssueStatesByIds: vi.fn().mockResolvedValue([]),
        resolveStateId: vi.fn().mockResolvedValue(null),
        updateIssueState: vi.fn().mockResolvedValue(undefined),
        createComment: vi.fn().mockResolvedValue(undefined),
      },
      attemptStore: {
        updateAttempt: vi.fn().mockResolvedValue(undefined),
      },
      workspaceManager: {
        removeWorkspace: vi.fn().mockResolvedValue(undefined),
      },
      eventBus: { emit: vi.fn() },
      logger: { info: vi.fn(), warn: vi.fn() },
    },
    isRunning: () => true,
    getConfig: () => config,
    releaseIssueClaim: vi.fn(),
    resolveModelSelection: vi.fn().mockReturnValue(createModelSelection()),
    notify: vi.fn(),
    queueRetry: vi.fn(),
  } as unknown as OutcomeContext;
}

describe("handleContinuationRetry", () => {
  let ctx: OutcomeContext;
  let issue: Issue;
  let entry: RunningEntry;
  let workspace: Workspace;
  let modelSelection: ModelSelection;

  beforeEach(() => {
    ctx = makeCtx();
    issue = createIssue();
    entry = createRunningEntry({ sessionId: "session-abc" });
    workspace = createWorkspace();
    modelSelection = createModelSelection();
  });

  it("queues retry with 1000ms delay and reason 'continuation'", () => {
    handleContinuationRetry(ctx, entry, issue, workspace, modelSelection, 2);

    expect(ctx.queueRetry).toHaveBeenCalledWith(issue, 3, 1000, "continuation", { threadId: "session-abc" });
  });

  it("passes entry sessionId as threadId metadata", () => {
    const customEntry = createRunningEntry({ sessionId: "custom-thread" });
    handleContinuationRetry(ctx, customEntry, issue, workspace, modelSelection, 1);

    expect(ctx.queueRetry).toHaveBeenCalledWith(expect.anything(), 2, 1000, "continuation", {
      threadId: "custom-thread",
    });
  });

  it("treats null attempt as 0 and queues attempt 1", () => {
    handleContinuationRetry(ctx, entry, issue, workspace, modelSelection, null);

    expect(ctx.queueRetry).toHaveBeenCalledWith(issue, 1, 1000, "continuation", expect.any(Object));
  });

  it("logs the retry with issue metadata", () => {
    handleContinuationRetry(ctx, entry, issue, workspace, modelSelection, 3);

    expect(ctx.deps.logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        issue_id: issue.id,
        issue_identifier: issue.identifier,
        attempt: 4,
        delay_ms: 1000,
        reason: "continuation",
      }),
      "worker retry queued",
    );
  });
});

describe("handleContinuationExhausted", () => {
  let ctx: OutcomeContext;
  let issue: Issue;
  let entry: RunningEntry;
  let workspace: Workspace;
  let modelSelection: ModelSelection;

  beforeEach(() => {
    ctx = makeCtx();
    issue = createIssue();
    entry = createRunningEntry();
    workspace = createWorkspace();
    modelSelection = createModelSelection();
  });

  it("sends a critical notification with max continuation message", async () => {
    await handleContinuationExhausted(ctx, entry, issue, workspace, modelSelection, 5);

    expect(ctx.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "worker_failed",
        severity: "critical",
        message: expect.stringContaining("5 continuations"),
      }),
    );
  });

  it("sets a completed view with failed status and max_continuations_exceeded error", async () => {
    await handleContinuationExhausted(ctx, entry, issue, workspace, modelSelection, 3);

    const view = ctx.completedViews.get(issue.identifier);
    expect(view).toBeDefined();
    expect(view!.status).toBe("failed");
    expect(view!.error).toBe("max_continuations_exceeded");
  });

  it("emits issue.completed event with failed outcome", async () => {
    await handleContinuationExhausted(ctx, entry, issue, workspace, modelSelection, 2);

    expect(ctx.deps.eventBus?.emit).toHaveBeenCalledWith("issue.completed", {
      issueId: issue.id,
      identifier: issue.identifier,
      outcome: "failed",
    });
  });

  it("releases the issue claim", async () => {
    await handleContinuationExhausted(ctx, entry, issue, workspace, modelSelection, 2);

    expect(ctx.releaseIssueClaim).toHaveBeenCalledWith(issue.id);
  });

  it("updates attempt store with failed status and error", async () => {
    await handleContinuationExhausted(ctx, entry, issue, workspace, modelSelection, 4);

    expect(ctx.deps.attemptStore.updateAttempt).toHaveBeenCalledWith(entry.runId, {
      status: "failed",
      errorCode: "max_continuations_exceeded",
      errorMessage: expect.stringContaining("5 continuations"),
    });
  });

  it("uses maxContinuationAttempts from config in the message", async () => {
    const config = makeConfig({ maxContinuationAttempts: 10 });
    const customCtx = makeCtx({ config });

    await handleContinuationExhausted(customCtx, entry, issue, workspace, modelSelection, 3);

    expect(customCtx.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("10 continuations"),
      }),
    );
  });
});

describe("handleErrorRetry", () => {
  let ctx: OutcomeContext;
  let issue: Issue;

  beforeEach(() => {
    ctx = makeCtx();
    issue = createIssue();
  });

  it("queues retry with exponential backoff (attempt 1 -> delay 20000)", () => {
    const outcome = {
      kind: "failed" as const,
      errorCode: "turn_failed",
      errorMessage: null,
      threadId: "t-1",
      turnId: null,
      turnCount: 1,
    };
    handleErrorRetry(ctx, outcome, issue, 1);

    const queueRetryMock = ctx.queueRetry as unknown as ReturnType<typeof vi.fn>;
    const [, nextAttempt, delayMs, reason] = queueRetryMock.mock.calls[0] as [unknown, number, number, string];
    expect(nextAttempt).toBe(2);
    expect(delayMs).toBe(20_000);
    expect(reason).toBe("turn_failed");
  });

  it("caps delay at maxRetryBackoffMs", () => {
    const config = makeConfig({ maxRetryBackoffMs: 5000 });
    const customCtx = makeCtx({ config });
    const outcome = {
      kind: "failed" as const,
      errorCode: "turn_failed",
      errorMessage: null,
      threadId: null,
      turnId: null,
      turnCount: 1,
    };
    handleErrorRetry(customCtx, outcome, issue, 10);

    const queueRetryMock = customCtx.queueRetry as unknown as ReturnType<typeof vi.fn>;
    const [, , delayMs] = queueRetryMock.mock.calls[0] as [unknown, number, number];
    expect(delayMs).toBe(5000);
  });

  it("uses outcome.errorCode as the retry reason", () => {
    const outcome = {
      kind: "failed" as const,
      errorCode: "sandbox_error",
      errorMessage: null,
      threadId: null,
      turnId: null,
      turnCount: 1,
    };
    handleErrorRetry(ctx, outcome, issue, 0);

    expect(ctx.queueRetry).toHaveBeenCalledWith(issue, 1, expect.any(Number), "sandbox_error", expect.any(Object));
  });

  it("falls back to 'turn_failed' when errorCode is null", () => {
    const outcome = {
      kind: "failed" as const,
      errorCode: null,
      errorMessage: null,
      threadId: null,
      turnId: null,
      turnCount: 1,
    };
    handleErrorRetry(ctx, outcome, issue, 1);

    expect(ctx.queueRetry).toHaveBeenCalledWith(issue, 2, expect.any(Number), "turn_failed", expect.any(Object));
  });

  it("passes entry sessionId when entry is provided", () => {
    const entry = createRunningEntry({ sessionId: "sess-retry" });
    const outcome = {
      kind: "failed" as const,
      errorCode: "turn_failed",
      errorMessage: null,
      threadId: "outcome-thread",
      turnId: null,
      turnCount: 1,
    };
    handleErrorRetry(ctx, outcome, issue, 1, entry);

    expect(ctx.queueRetry).toHaveBeenCalledWith(expect.anything(), 2, expect.any(Number), "turn_failed", {
      threadId: "sess-retry",
    });
  });

  it("falls back to outcome.threadId when no entry is provided", () => {
    const outcome = {
      kind: "failed" as const,
      errorCode: "turn_failed",
      errorMessage: null,
      threadId: "outcome-thread",
      turnId: null,
      turnCount: 1,
    };
    handleErrorRetry(ctx, outcome, issue, 1);

    expect(ctx.queueRetry).toHaveBeenCalledWith(expect.anything(), 2, expect.any(Number), "turn_failed", {
      threadId: "outcome-thread",
    });
  });

  it("treats null attempt as 0", () => {
    const outcome = {
      kind: "failed" as const,
      errorCode: "turn_failed",
      errorMessage: null,
      threadId: null,
      turnId: null,
      turnCount: 1,
    };
    handleErrorRetry(ctx, outcome, issue, null);

    const queueRetryMock = ctx.queueRetry as unknown as ReturnType<typeof vi.fn>;
    const [, nextAttempt, delayMs] = queueRetryMock.mock.calls[0] as [unknown, number, number];
    expect(nextAttempt).toBe(1);
    expect(delayMs).toBe(10_000); // 10000 * 2^0
  });
});

describe("handleModelOverrideRetry", () => {
  let ctx: OutcomeContext;
  let issue: Issue;

  beforeEach(() => {
    ctx = makeCtx();
    issue = createIssue();
  });

  it("queues retry with 0ms delay and reason 'model_override_updated'", () => {
    handleModelOverrideRetry(ctx, issue, 2);

    expect(ctx.queueRetry).toHaveBeenCalledWith(issue, 2, 0, "model_override_updated");
  });

  it("treats null attempt as 1", () => {
    handleModelOverrideRetry(ctx, issue, null);

    expect(ctx.queueRetry).toHaveBeenCalledWith(issue, 1, 0, "model_override_updated");
  });

  it("preserves the current attempt number", () => {
    handleModelOverrideRetry(ctx, issue, 5);

    expect(ctx.queueRetry).toHaveBeenCalledWith(issue, 5, 0, "model_override_updated");
  });
});

describe("queueRetryWithDelay", () => {
  let ctx: OutcomeContext;
  let issue: Issue;

  beforeEach(() => {
    ctx = makeCtx();
    issue = createIssue();
  });

  it("queues retry with specified delay and reason", () => {
    queueRetryWithDelay(ctx, issue, 2, 30_000, "rate_limited");

    expect(ctx.queueRetry).toHaveBeenCalledWith(issue, 3, 30_000, "rate_limited", undefined);
  });

  it("logs the queued retry", () => {
    queueRetryWithDelay(ctx, issue, 1, 5000, "usage_limit");

    expect(ctx.deps.logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        issue_id: issue.id,
        issue_identifier: issue.identifier,
        attempt: 2,
        delay_ms: 5000,
        reason: "usage_limit",
      }),
      "worker retry queued",
    );
  });

  it("treats null attempt as 0 and queues attempt 1", () => {
    queueRetryWithDelay(ctx, issue, null, 1000, "custom_reason");

    expect(ctx.queueRetry).toHaveBeenCalledWith(issue, 1, 1000, "custom_reason", undefined);
  });
});
