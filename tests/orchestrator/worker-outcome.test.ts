import { describe, expect, it, vi } from "vitest";

import { handleWorkerOutcome } from "../../src/orchestrator/worker-outcome/index.js";
import { handleWorkerFailure } from "../../src/orchestrator/worker-failure.js";
import type {
  Issue,
  ModelSelection,
  RunOutcome,
  RuntimeIssueView,
  ServiceConfig,
  Workspace,
} from "../../src/core/types.js";
import type { OutcomeContext } from "../../src/orchestrator/context.js";
import type { RetryRuntimeEntry, RunningEntry } from "../../src/orchestrator/runtime-types.js";
import { createRetryCoordinator } from "../../src/orchestrator/retry-coordinator.js";

type TestOutcomeContext = OutcomeContext & { retryEntries: Map<string, RetryRuntimeEntry> };

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: "issue-1",
    identifier: "MT-1",
    title: "Test issue",
    description: null,
    priority: 1,
    state: "In Progress",
    branchName: null,
    url: null,
    labels: [],
    blockedBy: [],
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

function makeWorkspace(): Workspace {
  return { path: "/tmp/ws/MT-1", workspaceKey: "ws-key", createdNow: true };
}

function makeOutcome(overrides: Partial<RunOutcome> = {}): RunOutcome {
  return {
    kind: "normal",
    errorCode: null,
    errorMessage: null,
    threadId: "thread-1",
    turnId: "turn-1",
    turnCount: 3,
    ...overrides,
  };
}

function makeEntry(overrides: Partial<RunningEntry> = {}): RunningEntry {
  return {
    runId: "run-abc",
    issue: makeIssue(),
    workspace: makeWorkspace(),
    startedAtMs: Date.now() - 5000,
    lastEventAtMs: Date.now(),
    attempt: 1,
    abortController: new AbortController(),
    promise: Promise.resolve(),
    cleanupOnExit: false,
    status: "running",
    sessionId: "sess-xyz",
    tokenUsage: null,
    modelSelection: { model: "gpt-4o", reasoningEffort: "high", source: "default" },
    lastAgentMessageContent: null,
    repoMatch: null,
    queuePersistence: () => undefined,
    flushPersistence: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as RunningEntry;
}

function makeConfig(overrides: Partial<ServiceConfig["tracker"]> = {}): ServiceConfig {
  return {
    tracker: {
      kind: "linear",
      apiKey: "key",
      endpoint: "https://api.linear.app/graphql",
      projectSlug: "MT",
      activeStates: ["In Progress"],
      terminalStates: ["Done", "Canceled"],
      ...overrides,
    },
    agent: {
      maxConcurrentAgents: 5,
      maxConcurrentAgentsByState: {},
      maxTurns: 10,
      maxRetryBackoffMs: 300000,
      maxContinuationAttempts: 5,
      successState: null,
      stallTimeoutMs: 1200000,
    },
  } as unknown as ServiceConfig;
}

function makeCtx(
  overrides: {
    isRunning?: boolean;
    latestIssue?: Issue | null;
    config?: ServiceConfig;
  } = {},
): TestOutcomeContext {
  const { isRunning = true, latestIssue = makeIssue(), config = makeConfig() } = overrides;

  const runningEntries = new Map<string, RunningEntry>();
  const retryEntries = new Map<string, RetryRuntimeEntry>();
  const completedViews = new Map<string, RuntimeIssueView>();
  const detailViews = new Map<string, RuntimeIssueView>();
  const notify = vi.fn();
  const releaseIssueClaim = vi.fn();
  const markDirty = vi.fn();
  const attemptStore = {
    updateAttempt: vi.fn().mockResolvedValue(undefined),
    createAttempt: vi.fn().mockResolvedValue(undefined),
  };
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const resolveModelSelection = vi.fn().mockReturnValue({
    model: "gpt-4o",
    reasoningEffort: "high",
    source: "default",
  } as ModelSelection);
  const pushEvent = vi.fn();
  const launchWorker = vi.fn().mockResolvedValue(undefined);
  const hasAvailableStateSlot = vi.fn().mockReturnValue(true);
  const claimIssue = vi.fn();

  const ctx = {
    runningEntries,
    completedViews,
    detailViews,
    retryEntries,
    deps: {
      tracker: {
        fetchIssueStatesByIds: vi.fn().mockResolvedValue(latestIssue ? [latestIssue] : [makeIssue()]),
        resolveStateId: vi.fn().mockResolvedValue(null),
        updateIssueState: vi.fn().mockResolvedValue(undefined),
        createComment: vi.fn().mockResolvedValue(undefined),
      },
      attemptStore,
      workspaceManager: {
        removeWorkspace: vi.fn().mockResolvedValue(undefined),
      },
      gitManager: {
        commitAndPush: vi.fn().mockResolvedValue({ pushed: false, branchName: "mt-1" }),
        createPullRequest: vi.fn().mockResolvedValue({ html_url: "https://github.com/org/repo/pull/1" }),
      },
      logger,
    },
    isRunning: () => isRunning,
    getConfig: () => config,
    releaseIssueClaim,
    markDirty,
    resolveModelSelection,
    notify,
  } as TestOutcomeContext;

  ctx.retryCoordinator = createRetryCoordinator(
    {
      tracker: ctx.deps.tracker,
      attemptStore,
      workspaceManager: ctx.deps.workspaceManager,
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
      launchWorker,
    },
  );

  return ctx;
}

function getCompletedView(ctx: OutcomeContext, identifier = "MT-1"): RuntimeIssueView {
  const view = ctx.completedViews.get(identifier);
  expect(view).toBeDefined();
  return view!;
}

function getRetryEntry(ctx: TestOutcomeContext, issueId = "issue-1"): RetryRuntimeEntry {
  const retryEntry = ctx.retryEntries.get(issueId);
  expect(retryEntry).toBeDefined();
  return retryEntry!;
}

function expectRetryDelay(
  ctx: TestOutcomeContext,
  startedAtMs: number,
  expectedDelayMs: number,
  issueId = "issue-1",
): RetryRuntimeEntry {
  const retryEntry = getRetryEntry(ctx, issueId);
  const actualDelay = retryEntry.dueAtMs - startedAtMs;
  expect(actualDelay).toBeGreaterThanOrEqual(expectedDelayMs);
  expect(actualDelay).toBeLessThanOrEqual(expectedDelayMs + 25);
  return retryEntry;
}

describe("handleWorkerOutcome - service stopped path", () => {
  it("calls handleServiceStopped and releases claim when not running", async () => {
    const ctx = makeCtx({ isRunning: false });
    const entry = makeEntry();
    ctx.runningEntries.set("issue-1", entry);

    await handleWorkerOutcome(
      ctx,
      makeOutcome({ kind: "cancelled", errorCode: "shutdown" }),
      entry,
      makeIssue(),
      makeWorkspace(),
      1,
    );

    expect(ctx.releaseIssueClaim).toHaveBeenCalledWith("issue-1");
    expect(ctx.notify).toHaveBeenCalledWith(expect.objectContaining({ type: "worker_failed" }));
    expect(ctx.completedViews.size).toBe(1);
  });
});

describe("handleWorkerOutcome - terminal state path", () => {
  it("removes workspace and releases claim when issue moves to terminal state", async () => {
    const ctx = makeCtx({ latestIssue: makeIssue({ state: "Done" }) });
    const entry = makeEntry();
    ctx.runningEntries.set("issue-1", entry);

    await handleWorkerOutcome(ctx, makeOutcome(), entry, makeIssue(), makeWorkspace(), 1);

    expect(ctx.deps.workspaceManager.removeWorkspace).toHaveBeenCalledWith(
      "MT-1",
      expect.objectContaining({ identifier: "MT-1", state: "Done" }),
    );
    expect(ctx.releaseIssueClaim).toHaveBeenCalledWith("issue-1");
    expect(ctx.retryEntries.size).toBe(0);
  });

  it("removes workspace when cleanupOnExit is true regardless of issue state", async () => {
    const ctx = makeCtx();
    const entry = makeEntry({ cleanupOnExit: true });
    ctx.runningEntries.set("issue-1", entry);

    await handleWorkerOutcome(ctx, makeOutcome(), entry, makeIssue(), makeWorkspace(), 1);

    expect(ctx.deps.workspaceManager.removeWorkspace).toHaveBeenCalledWith(
      "MT-1",
      expect.objectContaining({ identifier: "MT-1" }),
    );
  });
});

describe("handleWorkerOutcome - inactive (non-terminal) state", () => {
  it("sets status to paused and releases claim when issue becomes inactive", async () => {
    const ctx = makeCtx({ latestIssue: makeIssue({ state: "Backlog" }) });
    const entry = makeEntry();
    ctx.runningEntries.set("issue-1", entry);

    await handleWorkerOutcome(ctx, makeOutcome(), entry, makeIssue(), makeWorkspace(), 1);

    expect(ctx.deps.workspaceManager.removeWorkspace).not.toHaveBeenCalled();
    expect(ctx.releaseIssueClaim).toHaveBeenCalledWith("issue-1");
    expect(ctx.retryEntries.size).toBe(0);
    const view = getCompletedView(ctx);
    expect(view.status).toBe("paused");
  });
});

describe("handleWorkerOutcome - hard failure path", () => {
  it("does not retry for cancelled outcome", async () => {
    const ctx = makeCtx();
    const entry = makeEntry();
    ctx.runningEntries.set("issue-1", entry);

    await handleWorkerOutcome(
      ctx,
      makeOutcome({ kind: "cancelled", errorCode: "turn_input_required" }),
      entry,
      makeIssue(),
      makeWorkspace(),
      1,
    );

    expect(ctx.retryEntries.size).toBe(0);
    expect(ctx.notify).toHaveBeenCalledWith(expect.objectContaining({ type: "worker_failed" }));
  });

  it("does not retry for hard failure codes like startup_failed", async () => {
    const ctx = makeCtx();
    const entry = makeEntry();
    ctx.runningEntries.set("issue-1", entry);

    await handleWorkerOutcome(
      ctx,
      makeOutcome({ kind: "failed", errorCode: "startup_failed" }),
      entry,
      makeIssue(),
      makeWorkspace(),
      1,
    );

    expect(ctx.retryEntries.size).toBe(0);
  });
});

describe("handleWorkerOutcome - model_override_updated path", () => {
  it("re-queues at 0ms delay when model override was the reason", async () => {
    const ctx = makeCtx();
    const entry = makeEntry();
    ctx.runningEntries.set("issue-1", entry);
    const before = Date.now();

    await handleWorkerOutcome(
      ctx,
      makeOutcome({ kind: "cancelled", errorCode: "model_override_updated" }),
      entry,
      makeIssue(),
      makeWorkspace(),
      1,
    );

    const retryEntry = expectRetryDelay(ctx, before, 0);
    expect(retryEntry.attempt).toBe(1);
    expect(retryEntry.error).toBe("model_override_updated");
  });

  it("ignores stop signals and still retries when a late model override arrives", async () => {
    const ctx = makeCtx();
    const entry = makeEntry({
      lastAgentMessageContent: "RISOLUTO_STATUS: DONE",
    });
    ctx.runningEntries.set("issue-1", entry);
    const before = Date.now();

    await handleWorkerOutcome(
      ctx,
      makeOutcome({ kind: "cancelled", errorCode: "model_override_updated" }),
      entry,
      makeIssue(),
      makeWorkspace(),
      2,
    );

    const retryEntry = expectRetryDelay(ctx, before, 0);
    expect(retryEntry.attempt).toBe(2);
    expect(retryEntry.error).toBe("model_override_updated");
    expect(ctx.completedViews.size).toBe(0);
  });
});

describe("handleWorkerOutcome - stop signal detection", () => {
  it("marks done and triggers git post-run when RISOLUTO_STATUS: DONE detected", async () => {
    const ctx = makeCtx();
    const entry = makeEntry({
      lastAgentMessageContent: "I have completed the work.\n\nRISOLUTO_STATUS: DONE",
      repoMatch: {
        repoUrl: "https://github.com/org/repo",
        defaultBranch: "main",
        identifierPrefix: "MT",
        githubOwner: "org",
        githubRepo: "repo",
        githubTokenEnv: "GITHUB_TOKEN",
        matchedBy: "identifier_prefix",
      },
    });
    ctx.runningEntries.set("issue-1", entry);

    await handleWorkerOutcome(ctx, makeOutcome({ kind: "normal" }), entry, makeIssue(), makeWorkspace(), 1);

    expect(ctx.notify).toHaveBeenCalledWith(expect.objectContaining({ type: "worker_completed" }));
    expect(ctx.retryEntries.size).toBe(0);
    const view = getCompletedView(ctx);
    expect(view.status).toBe("completed");
  });

  it("propagates pullRequestUrl to completedViews when git post-run creates a PR", async () => {
    const ctx = makeCtx();
    const gitMock = ctx.deps.gitManager as unknown as {
      commitAndPush: ReturnType<typeof vi.fn>;
    };
    gitMock.commitAndPush.mockResolvedValueOnce({ pushed: true, branchName: "mt-1" });
    const entry = makeEntry({
      lastAgentMessageContent: "RISOLUTO_STATUS: DONE",
      repoMatch: {
        repoUrl: "https://github.com/org/repo",
        defaultBranch: "main",
        identifierPrefix: "MT",
        githubOwner: "org",
        githubRepo: "repo",
        githubTokenEnv: "GITHUB_TOKEN",
        matchedBy: "identifier_prefix",
      },
    });
    ctx.runningEntries.set("issue-1", entry);

    await handleWorkerOutcome(ctx, makeOutcome({ kind: "normal" }), entry, makeIssue(), makeWorkspace(), 1);

    const view = getCompletedView(ctx);
    expect(view.status).toBe("completed");
    expect(view.pullRequestUrl).toBe("https://github.com/org/repo/pull/1");
  });

  it("marks paused when RISOLUTO_STATUS: BLOCKED detected", async () => {
    const ctx = makeCtx();
    const entry = makeEntry({
      lastAgentMessageContent: "I cannot proceed.\n\nRISOLUTO_STATUS: BLOCKED",
    });
    ctx.runningEntries.set("issue-1", entry);

    await handleWorkerOutcome(ctx, makeOutcome({ kind: "normal" }), entry, makeIssue(), makeWorkspace(), 1);

    expect(ctx.notify).toHaveBeenCalledWith(expect.objectContaining({ type: "worker_failed" }));
    const view = getCompletedView(ctx);
    expect(view.status).toBe("paused");
    expect(ctx.deps.attemptStore.updateAttempt).toHaveBeenLastCalledWith(
      "run-abc",
      expect.objectContaining({ status: "paused", stopSignal: "blocked" }),
    );
  });

  it("handles case-insensitive RISOLUTO_STATUS variations", async () => {
    const ctx = makeCtx();
    const entry = makeEntry({
      lastAgentMessageContent: "RISOLUTO STATUS: done",
    });
    ctx.runningEntries.set("issue-1", entry);

    await handleWorkerOutcome(ctx, makeOutcome({ kind: "normal" }), entry, makeIssue(), makeWorkspace(), 1);

    expect(ctx.notify).toHaveBeenCalledWith(expect.objectContaining({ type: "worker_completed" }));
  });

  it("does not detect stop signal from completion-like prose without explicit marker", async () => {
    const ctx = makeCtx();
    const entry = makeEntry({
      lastAgentMessageContent: "I am done with the work and everything looks complete.",
    });
    ctx.runningEntries.set("issue-1", entry);
    const before = Date.now();

    await handleWorkerOutcome(ctx, makeOutcome({ kind: "normal" }), entry, makeIssue(), makeWorkspace(), 1);

    // Should queue continuation retry, not mark as done
    const retryEntry = expectRetryDelay(ctx, before, 1000);
    expect(retryEntry.attempt).toBe(2);
    expect(retryEntry.error).toBe("continuation");
    expect(retryEntry.threadId).toBe("sess-xyz");
  });
});

describe("handleWorkerOutcome - smart retry routing via codexErrorInfo", () => {
  it("routes Unauthorized to hard_fail (no retry)", async () => {
    const ctx = makeCtx();
    const entry = makeEntry();
    ctx.runningEntries.set("issue-1", entry);

    await handleWorkerOutcome(
      ctx,
      makeOutcome({
        kind: "failed",
        errorCode: "turn_failed",
        codexErrorInfo: { type: "Unauthorized", message: "invalid key" },
      }),
      entry,
      makeIssue(),
      makeWorkspace(),
      1,
    );

    expect(ctx.retryEntries.size).toBe(0);
    expect(ctx.notify).toHaveBeenCalledWith(expect.objectContaining({ type: "worker_failed" }));
  });

  it("routes RateLimited to retry with 30s default delay", async () => {
    const ctx = makeCtx();
    const entry = makeEntry();
    ctx.runningEntries.set("issue-1", entry);
    const before = Date.now();

    await handleWorkerOutcome(
      ctx,
      makeOutcome({
        kind: "failed",
        errorCode: "turn_failed",
        codexErrorInfo: { type: "RateLimited", message: "slow down" },
      }),
      entry,
      makeIssue(),
      makeWorkspace(),
      1,
    );

    const retryEntry = expectRetryDelay(ctx, before, 30_000);
    expect(retryEntry.attempt).toBe(2);
    expect(retryEntry.error).toBe("rate_limited");
    expect(retryEntry.threadId).toBeNull();
  });

  it("routes RateLimited with custom retryAfterMs", async () => {
    const ctx = makeCtx();
    const entry = makeEntry();
    ctx.runningEntries.set("issue-1", entry);
    const before = Date.now();

    await handleWorkerOutcome(
      ctx,
      makeOutcome({
        kind: "failed",
        errorCode: "turn_failed",
        codexErrorInfo: { type: "RateLimited", message: "slow down", retryAfterMs: 5000 },
      }),
      entry,
      makeIssue(),
      makeWorkspace(),
      1,
    );

    const retryEntry = expectRetryDelay(ctx, before, 5000);
    expect(retryEntry.attempt).toBe(2);
    expect(retryEntry.error).toBe("rate_limited");
  });

  it("routes UsageLimitExceeded to retry with 60s delay", async () => {
    const ctx = makeCtx();
    const entry = makeEntry();
    ctx.runningEntries.set("issue-1", entry);
    const before = Date.now();

    await handleWorkerOutcome(
      ctx,
      makeOutcome({
        kind: "failed",
        errorCode: "turn_failed",
        codexErrorInfo: { type: "UsageLimitExceeded", message: "limit hit" },
      }),
      entry,
      makeIssue(),
      makeWorkspace(),
      1,
    );

    const retryEntry = expectRetryDelay(ctx, before, 60_000);
    expect(retryEntry.attempt).toBe(2);
    expect(retryEntry.error).toBe("usage_limit");
  });

  it("routes ContextWindowExceeded to default retry (compact not yet implemented)", async () => {
    const ctx = makeCtx();
    const entry = makeEntry();
    ctx.runningEntries.set("issue-1", entry);
    const before = Date.now();

    await handleWorkerOutcome(
      ctx,
      makeOutcome({
        kind: "failed",
        errorCode: "turn_failed",
        codexErrorInfo: { type: "ContextWindowExceeded", message: "too big" },
      }),
      entry,
      makeIssue(),
      makeWorkspace(),
      1,
    );

    // compact_and_retry falls through to handleErrorRetry with exponential backoff
    const retryEntry = expectRetryDelay(ctx, before, 20_000);
    expect(retryEntry.error).toBe("turn_failed");
  });

  it("falls back to default retry when no codexErrorInfo is present", async () => {
    const ctx = makeCtx();
    const entry = makeEntry();
    ctx.runningEntries.set("issue-1", entry);

    await handleWorkerOutcome(
      ctx,
      makeOutcome({ kind: "failed", errorCode: "turn_failed" }),
      entry,
      makeIssue(),
      makeWorkspace(),
      1,
    );

    expect(ctx.retryEntries.size).toBe(1);
  });
});

describe("handleWorkerOutcome - continuation retry", () => {
  it("queues continuation retry for normal outcome with no stop signal", async () => {
    const ctx = makeCtx();
    const entry = makeEntry({ lastAgentMessageContent: null });
    ctx.runningEntries.set("issue-1", entry);
    const before = Date.now();

    await handleWorkerOutcome(ctx, makeOutcome({ kind: "normal" }), entry, makeIssue(), makeWorkspace(), 1);

    const retryEntry = expectRetryDelay(ctx, before, 1000);
    expect(retryEntry.attempt).toBe(2);
    expect(retryEntry.error).toBe("continuation");
    expect(retryEntry.threadId).toBe("sess-xyz");
  });

  it("queues retry with exponential backoff for failure outcomes", async () => {
    const ctx = makeCtx();
    const entry = makeEntry();
    ctx.runningEntries.set("issue-1", entry);
    const before = Date.now();

    await handleWorkerOutcome(
      ctx,
      makeOutcome({ kind: "failed", errorCode: "turn_failed" }),
      entry,
      makeIssue(),
      makeWorkspace(),
      1, // attempt 1 → next attempt is 2, delay = 10000 * 2^(2-1) = 20000
    );

    const retryEntry = expectRetryDelay(ctx, before, 20_000);
    expect(retryEntry.attempt).toBe(2);
  });

  it("caps retry delay at maxRetryBackoffMs", async () => {
    const config = makeConfig();
    config.agent.maxRetryBackoffMs = 5000;
    const ctx = makeCtx({ config });
    const entry = makeEntry();
    ctx.runningEntries.set("issue-1", entry);
    const before = Date.now();

    await handleWorkerOutcome(
      ctx,
      makeOutcome({ kind: "failed", errorCode: "turn_failed" }),
      entry,
      makeIssue(),
      makeWorkspace(),
      10, // very high attempt → would be huge delay, but capped
    );

    expectRetryDelay(ctx, before, 5000);
  });
});

describe("handleWorkerOutcome - max continuation cap", () => {
  it("stops retrying after maxContinuationAttempts is exceeded", async () => {
    const config = makeConfig();
    config.agent.maxContinuationAttempts = 3;
    const ctx = makeCtx({ config });
    const entry = makeEntry({ lastAgentMessageContent: null });
    ctx.runningEntries.set("issue-1", entry);

    // attempt=3 → nextAttempt=4 > maxContinuationAttempts=3 → should stop
    await handleWorkerOutcome(ctx, makeOutcome({ kind: "normal" }), entry, makeIssue(), makeWorkspace(), 3);

    expect(ctx.retryEntries.size).toBe(0);
    expect(ctx.releaseIssueClaim).toHaveBeenCalledWith("issue-1");
    expect(ctx.notify).toHaveBeenCalledWith(expect.objectContaining({ type: "worker_failed" }));
    const view = getCompletedView(ctx);
    expect(view.status).toBe("failed");
    expect(view.error).toBe("max_continuations_exceeded");
  });

  it("still retries when under the continuation limit", async () => {
    const config = makeConfig();
    config.agent.maxContinuationAttempts = 3;
    const ctx = makeCtx({ config });
    const entry = makeEntry({ lastAgentMessageContent: null });
    ctx.runningEntries.set("issue-1", entry);
    const before = Date.now();

    // attempt=2 → nextAttempt=3 <= maxContinuationAttempts=3 → should retry
    await handleWorkerOutcome(ctx, makeOutcome({ kind: "normal" }), entry, makeIssue(), makeWorkspace(), 2);

    const retryEntry = expectRetryDelay(ctx, before, 1000);
    expect(retryEntry.attempt).toBe(3);
    expect(retryEntry.error).toBe("continuation");
  });
});

describe("handleWorkerOutcome - attempt store update", () => {
  it("calls updateAttempt with correct fields", async () => {
    const ctx = makeCtx();
    const entry = makeEntry();
    ctx.runningEntries.set("issue-1", entry);

    const outcome = makeOutcome({ kind: "failed", errorCode: "turn_failed", errorMessage: "turn failed" });
    await handleWorkerOutcome(ctx, outcome, entry, makeIssue(), makeWorkspace(), 2);

    expect(ctx.deps.attemptStore.updateAttempt).toHaveBeenCalledWith(
      "run-abc",
      expect.objectContaining({
        status: "failed",
        errorCode: "turn_failed",
        errorMessage: "turn failed",
        turnCount: 3,
      }),
    );
  });

  it("removes the running entry", async () => {
    const ctx = makeCtx();
    const entry = makeEntry();
    ctx.runningEntries.set("issue-1", entry);

    await handleWorkerOutcome(ctx, makeOutcome(), entry, makeIssue(), makeWorkspace(), 1);

    expect(ctx.runningEntries.has("issue-1")).toBe(false);
  });
});

describe("handleWorkerFailure", () => {
  it("removes running entry, releases claim, and pushes event", async () => {
    const runningEntries = new Map<string, RunningEntry>();
    const entry = makeEntry();
    runningEntries.set("issue-1", entry);
    const releaseIssueClaim = vi.fn();
    const pushEvent = vi.fn();
    const updateAttempt = vi.fn().mockResolvedValue(undefined);
    const warn = vi.fn();

    await handleWorkerFailure(
      {
        runningEntries,
        releaseIssueClaim,
        markDirty: vi.fn(),
        pushEvent,
        deps: { attemptStore: { updateAttempt }, logger: { warn } },
      },
      makeIssue(),
      entry,
      new Error("unexpected crash"),
    );

    expect(runningEntries.has("issue-1")).toBe(false);
    expect(releaseIssueClaim).toHaveBeenCalledWith("issue-1");
    expect(pushEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: "worker_failed", message: "unexpected crash" }),
    );
    expect(updateAttempt).toHaveBeenCalledWith(
      "run-abc",
      expect.objectContaining({ status: "failed", errorCode: "worker_failed" }),
    );
  });

  it("handles non-Error thrown values", async () => {
    const runningEntries = new Map<string, RunningEntry>();
    const entry = makeEntry();
    runningEntries.set("issue-1", entry);
    const pushEvent = vi.fn();
    const updateAttempt = vi.fn().mockResolvedValue(undefined);
    const warn = vi.fn();

    await handleWorkerFailure(
      {
        runningEntries,
        releaseIssueClaim: vi.fn(),
        markDirty: vi.fn(),
        pushEvent,
        deps: { attemptStore: { updateAttempt }, logger: { warn } },
      },
      makeIssue(),
      entry,
      "string error",
    );

    expect(pushEvent).toHaveBeenCalledWith(expect.objectContaining({ message: "string error" }));
  });
});

describe("handleWorkerOutcome - git post-run failure", () => {
  it("completes issue despite git post-run failure (non-fatal)", async () => {
    const ctx = makeCtx();
    const gitManagerMock = ctx.deps.gitManager as unknown as { commitAndPush: ReturnType<typeof vi.fn> };
    gitManagerMock.commitAndPush.mockRejectedValueOnce(new Error("push rejected"));
    const entry = makeEntry({
      lastAgentMessageContent: "RISOLUTO_STATUS: DONE",
      repoMatch: {
        repoUrl: "https://github.com/org/repo",
        defaultBranch: "main",
        identifierPrefix: "MT",
        githubOwner: "org",
        githubRepo: "repo",
        githubTokenEnv: "GITHUB_TOKEN",
        matchedBy: "identifier_prefix",
      },
    });
    ctx.runningEntries.set("issue-1", entry);

    await handleWorkerOutcome(ctx, makeOutcome({ kind: "normal" }), entry, makeIssue(), makeWorkspace(), 1);

    // Git failure is non-fatal — issue should still complete
    expect(ctx.notify).toHaveBeenCalledWith(expect.objectContaining({ type: "worker_completed" }));
    const view = getCompletedView(ctx);
    expect(view.status).toBe("completed");
    expect(ctx.retryEntries.size).toBe(0);
    // Logs the git failure
    expect(ctx.deps.logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ issue_identifier: "MT-1", error: "push rejected" }),
      expect.stringContaining("git post-run failed"),
    );
  });
});

describe("detectStopSignal edge cases", () => {
  it("detects RISOLUTO_STATUS: DONE with extra whitespace", async () => {
    const ctx = makeCtx();
    const entry = makeEntry({
      lastAgentMessageContent: "  RISOLUTO_STATUS:   DONE  ",
    });
    ctx.runningEntries.set("issue-1", entry);

    await handleWorkerOutcome(ctx, makeOutcome({ kind: "normal" }), entry, makeIssue(), makeWorkspace(), 1);

    expect(ctx.notify).toHaveBeenCalledWith(expect.objectContaining({ type: "worker_completed" }));
  });

  it("detects risoluto status: done (space instead of underscore)", async () => {
    const ctx = makeCtx();
    const entry = makeEntry({
      lastAgentMessageContent: "risoluto status: done",
    });
    ctx.runningEntries.set("issue-1", entry);

    await handleWorkerOutcome(ctx, makeOutcome({ kind: "normal" }), entry, makeIssue(), makeWorkspace(), 1);

    expect(ctx.notify).toHaveBeenCalledWith(expect.objectContaining({ type: "worker_completed" }));
  });

  it("detects RISOLUTO STATUS: BLOCKED (space instead of underscore)", async () => {
    const ctx = makeCtx();
    const entry = makeEntry({
      lastAgentMessageContent: "RISOLUTO STATUS: BLOCKED",
    });
    ctx.runningEntries.set("issue-1", entry);

    await handleWorkerOutcome(ctx, makeOutcome({ kind: "normal" }), entry, makeIssue(), makeWorkspace(), 1);

    const view = getCompletedView(ctx);
    expect(view.status).toBe("paused");
  });

  it("detects signal embedded mid-message", async () => {
    const ctx = makeCtx();
    const entry = makeEntry({
      lastAgentMessageContent: "I finished the task.\nRISOLUTO_STATUS: DONE\nClosing now.",
    });
    ctx.runningEntries.set("issue-1", entry);

    await handleWorkerOutcome(ctx, makeOutcome({ kind: "normal" }), entry, makeIssue(), makeWorkspace(), 1);

    expect(ctx.notify).toHaveBeenCalledWith(expect.objectContaining({ type: "worker_completed" }));
  });

  it("detects stop signal even from timed-out outcomes", async () => {
    const ctx = makeCtx();
    const entry = makeEntry({
      lastAgentMessageContent: "RISOLUTO_STATUS: DONE",
    });
    ctx.runningEntries.set("issue-1", entry);

    await handleWorkerOutcome(
      ctx,
      makeOutcome({ kind: "timed_out", errorCode: "turn_timeout" }),
      entry,
      makeIssue(),
      makeWorkspace(),
      1,
    );

    // Agent said DONE before timeout — should complete, not retry
    expect(ctx.notify).toHaveBeenCalledWith(expect.objectContaining({ type: "worker_completed" }));
    expect(ctx.retryEntries.size).toBe(0);
  });

  it("detects stop signal even from failed outcomes", async () => {
    const ctx = makeCtx();
    const entry = makeEntry({
      lastAgentMessageContent: "RISOLUTO_STATUS: DONE",
    });
    ctx.runningEntries.set("issue-1", entry);

    await handleWorkerOutcome(
      ctx,
      makeOutcome({ kind: "failed", errorCode: "turn_failed" }),
      entry,
      makeIssue(),
      makeWorkspace(),
      1,
    );

    // Agent said DONE before failure — should complete, not retry
    expect(ctx.notify).toHaveBeenCalledWith(expect.objectContaining({ type: "worker_completed" }));
    expect(ctx.retryEntries.size).toBe(0);
  });
});
