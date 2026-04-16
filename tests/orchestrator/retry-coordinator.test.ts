import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { OutcomeContext } from "../../src/orchestrator/context.js";
import type {
  Issue,
  ModelSelection,
  RunOutcome,
  RuntimeIssueView,
  ServiceConfig,
  Workspace,
} from "../../src/core/types.js";
import type { RetryRuntimeEntry, RunningEntry } from "../../src/orchestrator/runtime-types.js";
import type { PreparedWorkerOutcome } from "../../src/orchestrator/worker-outcome/types.js";
import { buildOutcomeView } from "../../src/orchestrator/outcome-view-builder.js";
import { createRetryCoordinator } from "../../src/orchestrator/retry-coordinator.js";
import { createIssue, createWorkspace, createModelSelection, createRunningEntry } from "./issue-test-factories.js";
import { attachOutcomeRuntimeFinalizers } from "./outcome-runtime-finalizers.js";

interface RetryHarness {
  ctx: OutcomeContext;
  retryEntries: Map<string, RetryRuntimeEntry>;
  runningEntries: Map<string, RunningEntry>;
  detailViews: Map<string, RuntimeIssueView>;
  completedViews: Map<string, RuntimeIssueView>;
  claimIssue: ReturnType<typeof vi.fn>;
  releaseIssueClaim: ReturnType<typeof vi.fn>;
  notify: ReturnType<typeof vi.fn>;
  markDirty: ReturnType<typeof vi.fn>;
  pushEvent: ReturnType<typeof vi.fn>;
  resolveModelSelection: ReturnType<typeof vi.fn>;
  launchWorker: ReturnType<typeof vi.fn>;
  hasAvailableStateSlot: ReturnType<typeof vi.fn>;
  attemptStore: {
    updateAttempt: ReturnType<typeof vi.fn>;
    createAttempt: ReturnType<typeof vi.fn>;
  };
  tracker: {
    fetchIssueStatesByIds: ReturnType<typeof vi.fn>;
    resolveStateId: ReturnType<typeof vi.fn>;
    updateIssueState: ReturnType<typeof vi.fn>;
    createComment: ReturnType<typeof vi.fn>;
  };
  workspaceManager: {
    removeWorkspace: ReturnType<typeof vi.fn>;
  };
  logger: {
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };
}

afterEach(() => {
  vi.useRealTimers();
});

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

function makePrepared(
  outcome: RunOutcome,
  entry: RunningEntry,
  issue: Issue,
  workspace: Workspace,
  modelSelection: ModelSelection,
  attempt: number | null,
  overrides: Partial<PreparedWorkerOutcome> = {},
): PreparedWorkerOutcome {
  return { outcome, entry, issue, latestIssue: issue, workspace, attempt, modelSelection, ...overrides };
}

function makeHarness(
  overrides: {
    config?: ServiceConfig;
    isRunning?: boolean;
    latestIssue?: Issue | null;
  } = {},
): RetryHarness {
  const config = overrides.config ?? makeConfig();
  const isRunning = overrides.isRunning ?? true;
  const latestIssue = overrides.latestIssue ?? createIssue();
  const runningEntries = new Map<string, RunningEntry>();
  const retryEntries = new Map<string, RetryRuntimeEntry>();
  const detailViews = new Map<string, RuntimeIssueView>();
  const completedViews = new Map<string, RuntimeIssueView>();
  const claimIssue = vi.fn();
  const releaseIssueClaim = vi.fn();
  const notify = vi.fn();
  const markDirty = vi.fn();
  const pushEvent = vi.fn();
  const resolveModelSelection = vi.fn().mockReturnValue(createModelSelection());
  const launchWorker = vi.fn().mockResolvedValue(undefined);
  const hasAvailableStateSlot = vi.fn().mockReturnValue(true);
  const attemptStore = {
    updateAttempt: vi.fn().mockResolvedValue(undefined),
    createAttempt: vi.fn().mockResolvedValue(undefined),
  };
  const tracker = {
    fetchIssueStatesByIds: vi.fn().mockResolvedValue(latestIssue ? [latestIssue] : []),
    resolveStateId: vi.fn().mockResolvedValue(null),
    updateIssueState: vi.fn().mockResolvedValue(undefined),
    createComment: vi.fn().mockResolvedValue(undefined),
  };
  const workspaceManager = {
    removeWorkspace: vi.fn().mockResolvedValue(undefined),
  };
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  const ctx = {
    runningEntries,
    completedViews,
    detailViews,
    deps: {
      tracker,
      attemptStore,
      workspaceManager,
      eventBus: { emit: vi.fn() },
      logger,
    },
    isRunning: () => isRunning,
    getConfig: () => config,
    releaseIssueClaim,
    markDirty,
    buildOutcomeView: (input) =>
      buildOutcomeView(input.issue, input.workspace, input.entry, input.configuredSelection, input.overrides),
    setDetailView: (identifier, view) => {
      detailViews.set(identifier, view);
      markDirty();
      return view;
    },
    setCompletedView: (identifier, view) => {
      completedViews.set(identifier, view);
      markDirty();
      return view;
    },
    resolveModelSelection,
    notify,
  } as OutcomeContext;

  attachOutcomeRuntimeFinalizers(ctx, { retryEntries });

  const retryCoordinator = createRetryCoordinator(
    {
      tracker,
      attemptStore,
      workspaceManager,
      logger,
    },
    {
      runningEntries,
      retryEntries,
      detailViews,
      completedViews,
      isRunning: () => isRunning,
      getConfig: () => config,
      claimIssue,
      releaseIssueClaim,
      hasAvailableStateSlot,
      markDirty,
      notify,
      pushEvent,
      resolveModelSelection,
      setDetailView: (identifier, view) => {
        detailViews.set(identifier, view);
        markDirty();
        return view;
      },
      setCompletedView: (identifier, view) => {
        completedViews.set(identifier, view);
        markDirty();
        return view;
      },
      launchWorker,
    },
  );
  ctx.retryCoordinator = retryCoordinator;

  return {
    ctx,
    retryEntries,
    runningEntries,
    detailViews,
    completedViews,
    claimIssue,
    releaseIssueClaim,
    notify,
    markDirty,
    pushEvent,
    resolveModelSelection,
    launchWorker,
    hasAvailableStateSlot,
    attemptStore,
    tracker,
    workspaceManager,
    logger,
  };
}

function getRetryEntry(harness: RetryHarness, issueId = "issue-1"): RetryRuntimeEntry {
  const retryEntry = harness.retryEntries.get(issueId);
  expect(retryEntry).toBeDefined();
  return retryEntry!;
}

describe("RetryCoordinator dispatch", () => {
  let harness: RetryHarness;
  let issue: Issue;
  let entry: RunningEntry;
  let workspace: Workspace;
  let modelSelection: ModelSelection;

  beforeEach(() => {
    harness = makeHarness();
    issue = createIssue();
    entry = createRunningEntry({ sessionId: "session-abc" });
    workspace = createWorkspace();
    modelSelection = createModelSelection();
  });

  it("queues continuation retries with thread metadata", async () => {
    const before = Date.now();

    await harness.ctx.retryCoordinator.dispatch(
      harness.ctx,
      makePrepared(makeOutcome(), entry, issue, workspace, modelSelection, 1),
    );

    const retryEntry = getRetryEntry(harness);
    expect(retryEntry.attempt).toBe(2);
    expect(retryEntry.error).toBe("continuation");
    expect(retryEntry.threadId).toBe("session-abc");
    expect(retryEntry.dueAtMs - before).toBeGreaterThanOrEqual(1_000);
    expect(retryEntry.dueAtMs - before).toBeLessThanOrEqual(1_025);
  });

  it("marks continuation exhaustion as failed without queuing a retry", async () => {
    const limitedHarness = makeHarness({ config: makeConfig({ maxContinuationAttempts: 1 }) });

    await limitedHarness.ctx.retryCoordinator.dispatch(
      limitedHarness.ctx,
      makePrepared(makeOutcome(), entry, issue, workspace, modelSelection, 1),
    );

    expect(limitedHarness.retryEntries.size).toBe(0);
    expect(limitedHarness.releaseIssueClaim).toHaveBeenCalledWith(issue.id);
    expect(limitedHarness.notify).toHaveBeenCalledWith(
      expect.objectContaining({ type: "worker_failed", message: expect.stringContaining("1 continuations") }),
    );
    expect(limitedHarness.completedViews.get(issue.identifier)).toMatchObject({
      status: "failed",
      error: "max_continuations_exceeded",
    });
  });

  it("queues model override retries at the current attempt with no delay", async () => {
    const before = Date.now();

    await harness.ctx.retryCoordinator.dispatch(
      harness.ctx,
      makePrepared(
        makeOutcome({ kind: "cancelled", errorCode: "model_override_updated" }),
        entry,
        issue,
        workspace,
        modelSelection,
        3,
      ),
    );

    const retryEntry = getRetryEntry(harness);
    expect(retryEntry.attempt).toBe(3);
    expect(retryEntry.error).toBe("model_override_updated");
    expect(retryEntry.dueAtMs - before).toBeGreaterThanOrEqual(0);
    expect(retryEntry.dueAtMs - before).toBeLessThanOrEqual(25);
  });

  it("uses exponential backoff for default failure retries", async () => {
    const before = Date.now();

    await harness.ctx.retryCoordinator.dispatch(
      harness.ctx,
      makePrepared(
        makeOutcome({ kind: "failed", errorCode: "turn_failed", threadId: "thread-123" }),
        entry,
        issue,
        workspace,
        modelSelection,
        1,
      ),
    );

    const retryEntry = getRetryEntry(harness);
    expect(retryEntry.attempt).toBe(2);
    expect(retryEntry.error).toBe("turn_failed");
    expect(retryEntry.threadId).toBe("session-abc");
    expect(retryEntry.dueAtMs - before).toBeGreaterThanOrEqual(20_000);
    expect(retryEntry.dueAtMs - before).toBeLessThanOrEqual(20_025);
  });

  it("uses retry-policy delay for rate-limited failures", async () => {
    const before = Date.now();

    await harness.ctx.retryCoordinator.dispatch(
      harness.ctx,
      makePrepared(
        makeOutcome({
          kind: "failed",
          errorCode: "turn_failed",
          codexErrorInfo: { type: "RateLimited", message: "slow down", retryAfterMs: 5000 },
        }),
        entry,
        issue,
        workspace,
        modelSelection,
        1,
      ),
    );

    const retryEntry = getRetryEntry(harness);
    expect(retryEntry.attempt).toBe(2);
    expect(retryEntry.error).toBe("rate_limited");
    expect(retryEntry.threadId).toBeNull();
    expect(retryEntry.dueAtMs - before).toBeGreaterThanOrEqual(5_000);
    expect(retryEntry.dueAtMs - before).toBeLessThanOrEqual(5_025);
  });

  it("routes Unauthorized failures through the hard-failure terminal path", async () => {
    await harness.ctx.retryCoordinator.dispatch(
      harness.ctx,
      makePrepared(
        makeOutcome({
          kind: "failed",
          errorCode: "turn_failed",
          codexErrorInfo: { type: "Unauthorized", message: "invalid key" },
        }),
        entry,
        issue,
        workspace,
        modelSelection,
        1,
      ),
    );

    expect(harness.retryEntries.size).toBe(0);
    expect(harness.notify).toHaveBeenCalledWith(expect.objectContaining({ type: "worker_failed" }));
  });
});

describe("RetryCoordinator timer flows", () => {
  it("revalidates queued retries and launches the worker with preserved retry metadata", async () => {
    vi.useFakeTimers();
    const harness = makeHarness();
    const issue = createIssue();
    const entry = createRunningEntry({ sessionId: "session-abc" });
    const prepared = makePrepared(
      makeOutcome({ kind: "failed", errorCode: "turn_failed" }),
      entry,
      issue,
      createWorkspace(),
      createModelSelection(),
      1,
    );

    await harness.ctx.retryCoordinator.dispatch(harness.ctx, prepared);
    const retryEntry = getRetryEntry(harness);
    retryEntry.previousPrFeedback = "Address requested changes";

    await vi.advanceTimersByTimeAsync(20_000);

    expect(harness.launchWorker).toHaveBeenCalledWith(issue, 2, {
      claimHeld: true,
      previousThreadId: "session-abc",
      previousPrFeedback: "Address requested changes",
    });
    expect(harness.retryEntries.has(issue.id)).toBe(false);
  });

  it("re-queues retries when capacity is saturated", async () => {
    vi.useFakeTimers();
    const harness = makeHarness();
    const issue = createIssue();
    const entry = createRunningEntry({ sessionId: "session-abc" });
    harness.runningEntries.set("busy-1", createRunningEntry({ issue: createIssue({ id: "busy-1" }) }));
    harness.runningEntries.set("busy-2", createRunningEntry({ issue: createIssue({ id: "busy-2" }) }));
    harness.runningEntries.set("busy-3", createRunningEntry({ issue: createIssue({ id: "busy-3" }) }));
    harness.runningEntries.set("busy-4", createRunningEntry({ issue: createIssue({ id: "busy-4" }) }));
    harness.runningEntries.set("busy-5", createRunningEntry({ issue: createIssue({ id: "busy-5" }) }));

    await harness.ctx.retryCoordinator.dispatch(
      harness.ctx,
      makePrepared(
        makeOutcome({ kind: "failed", errorCode: "turn_failed" }),
        entry,
        issue,
        createWorkspace(),
        createModelSelection(),
        1,
      ),
    );

    const originalRetry = getRetryEntry(harness);
    const firstDueAtMs = originalRetry.dueAtMs;
    await vi.advanceTimersByTimeAsync(20_000);

    const requeuedRetry = getRetryEntry(harness);
    expect(requeuedRetry.error).toBe("turn_failed");
    expect(requeuedRetry.attempt).toBe(2);
    expect(requeuedRetry.dueAtMs).toBeGreaterThan(firstDueAtMs);
    expect(harness.launchWorker).not.toHaveBeenCalled();
  });

  it("cleans up terminal issues instead of relaunching them", async () => {
    vi.useFakeTimers();
    const terminalIssue = createIssue({ state: "Done" });
    const harness = makeHarness({ latestIssue: terminalIssue });

    await harness.ctx.retryCoordinator.dispatch(
      harness.ctx,
      makePrepared(
        makeOutcome({ kind: "cancelled", errorCode: "model_override_updated" }),
        createRunningEntry(),
        createIssue(),
        createWorkspace(),
        createModelSelection(),
        2,
      ),
    );

    await vi.advanceTimersByTimeAsync(0);

    expect(harness.workspaceManager.removeWorkspace).toHaveBeenCalledWith(terminalIssue.identifier, terminalIssue);
    expect(harness.retryEntries.size).toBe(0);
  });

  it("persists retry launch failures and records a failed view", async () => {
    vi.useFakeTimers();
    const harness = makeHarness();
    const issue = createIssue();
    const entry = createRunningEntry();
    harness.runningEntries.set(issue.id, entry);
    harness.launchWorker.mockRejectedValueOnce(new Error("spawn failed"));

    await harness.ctx.retryCoordinator.dispatch(
      harness.ctx,
      makePrepared(
        makeOutcome({ kind: "cancelled", errorCode: "model_override_updated" }),
        entry,
        issue,
        createWorkspace(),
        createModelSelection(),
        2,
      ),
    );

    await vi.advanceTimersByTimeAsync(0);

    expect(harness.logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ issue_id: issue.id, error: "spawn failed" }),
      "retry-launched worker startup failed",
    );
    expect(harness.completedViews.get(issue.identifier)).toMatchObject({
      status: "failed",
      attempt: 2,
    });
    expect(harness.attemptStore.updateAttempt).toHaveBeenCalledWith(
      entry.runId,
      expect.objectContaining({ status: "failed", errorCode: "worker_failed" }),
    );
  });

  it("cancel removes retry entries and releases claims when nothing is running", async () => {
    vi.useFakeTimers();
    const harness = makeHarness();

    await harness.ctx.retryCoordinator.dispatch(
      harness.ctx,
      makePrepared(
        makeOutcome({ kind: "cancelled", errorCode: "model_override_updated" }),
        createRunningEntry(),
        createIssue(),
        createWorkspace(),
        createModelSelection(),
        2,
      ),
    );

    harness.ctx.retryCoordinator.cancel("issue-1");

    expect(harness.retryEntries.size).toBe(0);
    expect(harness.releaseIssueClaim).toHaveBeenCalledWith("issue-1");
  });
});
