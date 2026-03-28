import { describe, expect, it, vi, beforeEach } from "vitest";

import {
  handleServiceStopped,
  handleTerminalCleanup,
  handleInactiveIssue,
  handleOperatorAbort,
  handleCancelledOrHardFailure,
} from "../../src/orchestrator/worker-outcome/terminal-paths.js";
import type {
  Issue,
  ModelSelection,
  RunOutcome,
  RuntimeIssueView,
  ServiceConfig,
  Workspace,
} from "../../src/core/types.js";
import type { OutcomeContext } from "../../src/orchestrator/context.js";
import type { RunningEntry } from "../../src/orchestrator/runtime-types.js";
import { createIssue, createWorkspace, createModelSelection, createRunningEntry } from "./issue-test-factories.js";

function makeConfig(): ServiceConfig {
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
    },
  } as unknown as ServiceConfig;
}

function makeOutcome(overrides: Partial<RunOutcome> = {}): RunOutcome {
  return {
    kind: "normal",
    errorCode: null,
    errorMessage: null,
    threadId: null,
    turnId: null,
    turnCount: 1,
    ...overrides,
  };
}

function makeCtx(): OutcomeContext {
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
    getConfig: () => makeConfig(),
    releaseIssueClaim: vi.fn(),
    suppressIssueDispatch: vi.fn(),
    resolveModelSelection: vi.fn().mockReturnValue(createModelSelection()),
    notify: vi.fn(),
    queueRetry: vi.fn(),
  } as unknown as OutcomeContext;
}

describe("handleServiceStopped", () => {
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

  it("sends worker_failed notification with critical severity", () => {
    const outcome = makeOutcome({ errorMessage: "service shutting down" });

    handleServiceStopped(ctx, outcome, entry, issue, workspace, modelSelection, 1);

    expect(ctx.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "worker_failed",
        severity: "critical",
        message: "service shutting down",
      }),
    );
  });

  it("uses default message when errorMessage is null", () => {
    const outcome = makeOutcome({ errorMessage: null });

    handleServiceStopped(ctx, outcome, entry, issue, workspace, modelSelection, 1);

    expect(ctx.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "service stopped before the worker completed",
      }),
    );
  });

  it("releases the issue claim", () => {
    handleServiceStopped(ctx, makeOutcome(), entry, issue, workspace, modelSelection, 1);

    expect(ctx.releaseIssueClaim).toHaveBeenCalledWith(issue.id);
  });

  it("sets completed view with cancelled status", () => {
    const outcome = makeOutcome({ errorMessage: "shutdown" });

    handleServiceStopped(ctx, outcome, entry, issue, workspace, modelSelection, 2);

    const view = ctx.completedViews.get(issue.identifier);
    expect(view).toBeDefined();
    expect(view!.status).toBe("cancelled");
    expect(view!.attempt).toBe(2);
  });

  it("emits issue.completed event with cancelled outcome", () => {
    handleServiceStopped(ctx, makeOutcome(), entry, issue, workspace, modelSelection, 1);

    expect(ctx.deps.eventBus?.emit).toHaveBeenCalledWith("issue.completed", {
      issueId: issue.id,
      identifier: issue.identifier,
      outcome: "cancelled",
    });
  });
});

describe("handleTerminalCleanup", () => {
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

  it("removes workspace", async () => {
    const outcome = makeOutcome({ kind: "normal" });

    await handleTerminalCleanup(ctx, outcome, entry, issue, workspace, modelSelection, 1);

    expect(ctx.deps.workspaceManager.removeWorkspace).toHaveBeenCalledWith(issue.identifier, issue);
  });

  it("swallows workspace removal errors gracefully", async () => {
    const removeWorkspace = ctx.deps.workspaceManager.removeWorkspace as ReturnType<typeof vi.fn>;
    removeWorkspace.mockRejectedValue(new Error("permission denied"));
    const outcome = makeOutcome({ kind: "normal" });

    await handleTerminalCleanup(ctx, outcome, entry, issue, workspace, modelSelection, 1);

    expect(ctx.deps.logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ issue_identifier: issue.identifier, error: "permission denied" }),
      expect.stringContaining("workspace cleanup failed"),
    );
    // Still proceeds with rest of flow
    expect(ctx.completedViews.has(issue.identifier)).toBe(true);
  });

  it("sets completed view with status based on outcome kind", async () => {
    const outcome = makeOutcome({ kind: "cancelled", errorMessage: "user cancelled" });

    await handleTerminalCleanup(ctx, outcome, entry, issue, workspace, modelSelection, 1);

    const view = ctx.completedViews.get(issue.identifier);
    expect(view).toBeDefined();
    expect(view!.status).toBe("cancelled");
    expect(view!.message).toBe("workspace cleaned after terminal state");
  });

  it("maps failed outcome kind to failed status", async () => {
    const outcome = makeOutcome({ kind: "failed", errorCode: "turn_failed", errorMessage: "oops" });

    await handleTerminalCleanup(ctx, outcome, entry, issue, workspace, modelSelection, 2);

    const view = ctx.completedViews.get(issue.identifier);
    expect(view!.status).toBe("failed");
    expect(view!.error).toBe("oops");
  });

  it("uses errorCode as error when errorMessage is null", async () => {
    const outcome = makeOutcome({ kind: "failed", errorCode: "sandbox_error", errorMessage: null });

    await handleTerminalCleanup(ctx, outcome, entry, issue, workspace, modelSelection, 1);

    const view = ctx.completedViews.get(issue.identifier);
    expect(view!.error).toBe("sandbox_error");
  });

  it("emits issue.completed event with mapped outcome", async () => {
    const outcome = makeOutcome({ kind: "timed_out" });

    await handleTerminalCleanup(ctx, outcome, entry, issue, workspace, modelSelection, 1);

    expect(ctx.deps.eventBus?.emit).toHaveBeenCalledWith("issue.completed", {
      issueId: issue.id,
      identifier: issue.identifier,
      outcome: "timed_out",
    });
  });

  it("releases the issue claim", async () => {
    await handleTerminalCleanup(ctx, makeOutcome(), entry, issue, workspace, modelSelection, 1);

    expect(ctx.releaseIssueClaim).toHaveBeenCalledWith(issue.id);
  });
});

describe("handleInactiveIssue", () => {
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

  it("sets completed view with paused status", () => {
    handleInactiveIssue(ctx, makeOutcome(), entry, issue, workspace, modelSelection, null);

    const view = ctx.completedViews.get(issue.identifier);
    expect(view).toBeDefined();
    expect(view!.status).toBe("paused");
    expect(view!.message).toBe("issue is no longer active");
  });

  it("emits issue.completed event with paused outcome", () => {
    handleInactiveIssue(ctx, makeOutcome(), entry, issue, workspace, modelSelection, 1);

    expect(ctx.deps.eventBus?.emit).toHaveBeenCalledWith("issue.completed", {
      issueId: issue.id,
      identifier: issue.identifier,
      outcome: "paused",
    });
  });

  it("releases the issue claim", () => {
    handleInactiveIssue(ctx, makeOutcome(), entry, issue, workspace, modelSelection, 1);

    expect(ctx.releaseIssueClaim).toHaveBeenCalledWith(issue.id);
  });

  it("does not send any notifications", () => {
    handleInactiveIssue(ctx, makeOutcome(), entry, issue, workspace, modelSelection, 1);

    expect(ctx.notify).not.toHaveBeenCalled();
  });
});

describe("handleOperatorAbort", () => {
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

  it("sends worker_failed notification with info severity", () => {
    const outcome = makeOutcome({ errorMessage: "operator stopped this", errorCode: "operator_abort" });

    handleOperatorAbort(ctx, outcome, entry, issue, workspace, modelSelection, 1);

    expect(ctx.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "worker_failed",
        severity: "info",
        message: "operator stopped this",
        metadata: expect.objectContaining({ errorCode: "operator_abort" }),
      }),
    );
  });

  it("uses default message when errorMessage is null", () => {
    const outcome = makeOutcome({ errorMessage: null, errorCode: "operator_abort" });

    handleOperatorAbort(ctx, outcome, entry, issue, workspace, modelSelection, 1);

    expect(ctx.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "worker cancelled by operator request",
      }),
    );
  });

  it("sets completed view with cancelled status", () => {
    const outcome = makeOutcome({ errorCode: "operator_abort" });

    handleOperatorAbort(ctx, outcome, entry, issue, workspace, modelSelection, 3);

    const view = ctx.completedViews.get(issue.identifier);
    expect(view).toBeDefined();
    expect(view!.status).toBe("cancelled");
    expect(view!.error).toBe("operator_abort");
    expect(view!.attempt).toBe(3);
  });

  it("emits issue.completed event with cancelled outcome", () => {
    handleOperatorAbort(ctx, makeOutcome(), entry, issue, workspace, modelSelection, 1);

    expect(ctx.deps.eventBus?.emit).toHaveBeenCalledWith("issue.completed", {
      issueId: issue.id,
      identifier: issue.identifier,
      outcome: "cancelled",
    });
  });

  it("calls suppressIssueDispatch", () => {
    handleOperatorAbort(ctx, makeOutcome(), entry, issue, workspace, modelSelection, 1);

    expect(ctx.suppressIssueDispatch).toHaveBeenCalledWith(issue);
  });

  it("releases the issue claim", () => {
    handleOperatorAbort(ctx, makeOutcome(), entry, issue, workspace, modelSelection, 1);

    expect(ctx.releaseIssueClaim).toHaveBeenCalledWith(issue.id);
  });
});

describe("handleCancelledOrHardFailure", () => {
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

  it("sends worker_failed notification with critical severity", () => {
    const outcome = makeOutcome({ kind: "failed", errorMessage: "startup crashed", errorCode: "startup_failed" });

    handleCancelledOrHardFailure(ctx, outcome, entry, issue, workspace, modelSelection, 1);

    expect(ctx.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "worker_failed",
        severity: "critical",
        message: "startup crashed",
        metadata: expect.objectContaining({ errorCode: "startup_failed" }),
      }),
    );
  });

  it("uses default message when errorMessage is null", () => {
    const outcome = makeOutcome({ kind: "failed", errorMessage: null });

    handleCancelledOrHardFailure(ctx, outcome, entry, issue, workspace, modelSelection, 1);

    expect(ctx.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "worker stopped without a retry",
      }),
    );
  });

  it("maps cancelled kind to cancelled status in view", () => {
    const outcome = makeOutcome({ kind: "cancelled", errorCode: "shutdown" });

    handleCancelledOrHardFailure(ctx, outcome, entry, issue, workspace, modelSelection, 2);

    const view = ctx.completedViews.get(issue.identifier);
    expect(view).toBeDefined();
    expect(view!.status).toBe("cancelled");
    expect(view!.error).toBe("shutdown");
  });

  it("maps non-cancelled kind to failed status in view", () => {
    const outcome = makeOutcome({ kind: "failed", errorCode: "startup_failed" });

    handleCancelledOrHardFailure(ctx, outcome, entry, issue, workspace, modelSelection, 1);

    const view = ctx.completedViews.get(issue.identifier);
    expect(view!.status).toBe("failed");
  });

  it("emits issue.completed event with cancelled outcome for cancelled kind", () => {
    const outcome = makeOutcome({ kind: "cancelled" });

    handleCancelledOrHardFailure(ctx, outcome, entry, issue, workspace, modelSelection, 1);

    expect(ctx.deps.eventBus?.emit).toHaveBeenCalledWith("issue.completed", {
      issueId: issue.id,
      identifier: issue.identifier,
      outcome: "cancelled",
    });
  });

  it("emits issue.completed event with failed outcome for non-cancelled kind", () => {
    const outcome = makeOutcome({ kind: "failed" });

    handleCancelledOrHardFailure(ctx, outcome, entry, issue, workspace, modelSelection, 1);

    expect(ctx.deps.eventBus?.emit).toHaveBeenCalledWith("issue.completed", {
      issueId: issue.id,
      identifier: issue.identifier,
      outcome: "failed",
    });
  });

  it("releases the issue claim", () => {
    handleCancelledOrHardFailure(ctx, makeOutcome(), entry, issue, workspace, modelSelection, 1);

    expect(ctx.releaseIssueClaim).toHaveBeenCalledWith(issue.id);
  });

  it("does not call suppressIssueDispatch", () => {
    handleCancelledOrHardFailure(ctx, makeOutcome(), entry, issue, workspace, modelSelection, 1);

    expect(ctx.suppressIssueDispatch).not.toHaveBeenCalled();
  });
});
