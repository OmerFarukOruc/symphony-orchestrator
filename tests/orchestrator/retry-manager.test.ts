import { describe, expect, it, vi, afterEach } from "vitest";

import { clearRetryEntry, queueRetry, revalidateAndLaunchRetry } from "../../src/orchestrator/retry-manager.js";
import type { Issue } from "../../src/core/types.js";
import type { RetryRuntimeEntry, RunningEntry } from "../../src/orchestrator/runtime-types.js";

afterEach(() => {
  vi.useRealTimers();
});

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

function makeRetryEntry(issueId: string, timer: NodeJS.Timeout | null = null): RetryRuntimeEntry {
  return {
    issueId,
    identifier: "MT-1",
    attempt: 1,
    dueAtMs: Date.now() + 5000,
    error: null,
    timer,
    issue: makeIssue({ id: issueId }),
    workspaceKey: null,
  };
}

describe("clearRetryEntry", () => {
  it("removes the retry entry and releases the issue claim", () => {
    const retryEntries = new Map([["issue-1", makeRetryEntry("issue-1")]]);
    const runningEntries = new Map<string, RunningEntry>();
    const releaseIssueClaim = vi.fn();

    clearRetryEntry({ retryEntries, runningEntries, releaseIssueClaim }, "issue-1");

    expect(retryEntries.has("issue-1")).toBe(false);
    expect(releaseIssueClaim).toHaveBeenCalledWith("issue-1");
  });

  it("cancels the timer before removing", () => {
    vi.useFakeTimers();
    const launched: string[] = [];
    const timer = setTimeout(() => launched.push("fired"), 1000);
    const retryEntries = new Map([["issue-1", makeRetryEntry("issue-1", timer)]]);
    const runningEntries = new Map<string, RunningEntry>();
    const releaseIssueClaim = vi.fn();

    clearRetryEntry({ retryEntries, runningEntries, releaseIssueClaim }, "issue-1");
    vi.runAllTimers();

    expect(launched).toEqual([]);
  });

  it("does not release claim when a running entry exists", () => {
    const retryEntries = new Map([["issue-1", makeRetryEntry("issue-1")]]);
    const runningEntries = new Map([["issue-1", {} as RunningEntry]]);
    const releaseIssueClaim = vi.fn();

    clearRetryEntry({ retryEntries, runningEntries, releaseIssueClaim }, "issue-1");

    expect(releaseIssueClaim).not.toHaveBeenCalled();
  });

  it("is a no-op for unknown issueId", () => {
    const retryEntries = new Map<string, RetryRuntimeEntry>();
    const runningEntries = new Map<string, RunningEntry>();
    const releaseIssueClaim = vi.fn();

    expect(() => clearRetryEntry({ retryEntries, runningEntries, releaseIssueClaim }, "unknown")).not.toThrow();
    expect(releaseIssueClaim).toHaveBeenCalledWith("unknown");
  });
});

describe("queueRetry", () => {
  it("does not queue when orchestrator is not running", () => {
    vi.useFakeTimers();
    const retryEntries = new Map<string, RetryRuntimeEntry>();
    const notify = vi.fn();
    const revalidateAndLaunchRetry = vi.fn();
    const handleRetryLaunchFailure = vi.fn();
    const ctx = {
      isRunning: () => false,
      claimIssue: vi.fn(),
      retryEntries,
      detailViews: new Map(),
      notify,
      revalidateAndLaunchRetry,
      handleRetryLaunchFailure,
    };

    queueRetry(ctx, makeIssue(), 1, 1000, null);
    expect(retryEntries.size).toBe(0);
    expect(ctx.claimIssue).not.toHaveBeenCalled();
  });

  it("stores a retry entry and fires notification", () => {
    vi.useFakeTimers();
    const retryEntries = new Map<string, RetryRuntimeEntry>();
    const notify = vi.fn();
    const revalidateAndLaunchRetry = vi.fn().mockResolvedValue(undefined);
    const handleRetryLaunchFailure = vi.fn().mockResolvedValue(undefined);
    const ctx = {
      isRunning: () => true,
      claimIssue: vi.fn(),
      retryEntries,
      detailViews: new Map(),
      notify,
      revalidateAndLaunchRetry,
      handleRetryLaunchFailure,
    };

    queueRetry(ctx, makeIssue(), 2, 5000, "turn_failed");

    expect(retryEntries.has("issue-1")).toBe(true);
    const entry = retryEntries.get("issue-1")!;
    expect(entry.attempt).toBe(2);
    expect(entry.error).toBe("turn_failed");
    expect(ctx.claimIssue).toHaveBeenCalledWith("issue-1");
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ type: "worker_retry" }));
  });

  it("stores threadId in retry entry when metadata is provided", () => {
    vi.useFakeTimers();
    const retryEntries = new Map<string, RetryRuntimeEntry>();
    const ctx = {
      isRunning: () => true,
      claimIssue: vi.fn(),
      retryEntries,
      detailViews: new Map(),
      notify: vi.fn(),
      revalidateAndLaunchRetry: vi.fn().mockResolvedValue(undefined),
      handleRetryLaunchFailure: vi.fn().mockResolvedValue(undefined),
    };

    queueRetry(ctx, makeIssue(), 2, 5000, "turn_failed", { threadId: "prev-thread-1" });

    const entry = retryEntries.get("issue-1")!;
    expect(entry.threadId).toBe("prev-thread-1");
  });

  it("stores null threadId when no metadata is provided", () => {
    vi.useFakeTimers();
    const retryEntries = new Map<string, RetryRuntimeEntry>();
    const ctx = {
      isRunning: () => true,
      claimIssue: vi.fn(),
      retryEntries,
      detailViews: new Map(),
      notify: vi.fn(),
      revalidateAndLaunchRetry: vi.fn().mockResolvedValue(undefined),
      handleRetryLaunchFailure: vi.fn().mockResolvedValue(undefined),
    };

    queueRetry(ctx, makeIssue(), 2, 5000, "turn_failed");

    const entry = retryEntries.get("issue-1")!;
    expect(entry.threadId).toBeNull();
  });

  it("replaces an existing timer when re-queuing for the same issue", () => {
    vi.useFakeTimers();
    const fired: number[] = [];
    const firstTimer = setTimeout(() => fired.push(1), 10000);
    const retryEntries = new Map([["issue-1", makeRetryEntry("issue-1", firstTimer)]]);
    const notify = vi.fn();
    const revalidateAndLaunchRetry = vi.fn().mockResolvedValue(undefined);
    const handleRetryLaunchFailure = vi.fn().mockResolvedValue(undefined);
    const ctx = {
      isRunning: () => true,
      claimIssue: vi.fn(),
      retryEntries,
      detailViews: new Map(),
      notify,
      revalidateAndLaunchRetry,
      handleRetryLaunchFailure,
    };

    queueRetry(ctx, makeIssue(), 2, 5000, null);
    vi.advanceTimersByTime(20000);

    // First timer cancelled, only new timer should have fired
    expect(fired).toEqual([]);
    expect(revalidateAndLaunchRetry).toHaveBeenCalledTimes(1);
  });

  it("launches revalidation after the delay fires", () => {
    vi.useFakeTimers();
    const retryEntries = new Map<string, RetryRuntimeEntry>();
    const revalidateAndLaunchRetry = vi.fn().mockResolvedValue(undefined);
    const handleRetryLaunchFailure = vi.fn().mockResolvedValue(undefined);
    const ctx = {
      isRunning: () => true,
      claimIssue: vi.fn(),
      retryEntries,
      detailViews: new Map(),
      notify: vi.fn(),
      revalidateAndLaunchRetry,
      handleRetryLaunchFailure,
    };

    queueRetry(ctx, makeIssue(), 1, 2000, null);
    vi.advanceTimersByTime(2001);

    expect(revalidateAndLaunchRetry).toHaveBeenCalledWith("issue-1", 1);
  });
});

describe("revalidateAndLaunchRetry", () => {
  function makeCtx(
    overrides: {
      hasRetryEntry?: boolean;
      isRunning?: boolean;
      latestIssue?: Issue | null;
      runningCount?: number;
      hasSlot?: boolean;
    } = {},
  ) {
    const {
      hasRetryEntry = true,
      isRunning = true,
      latestIssue = makeIssue(),
      runningCount = 0,
      hasSlot = true,
    } = overrides;

    const retryEntry = makeRetryEntry("issue-1");
    const retryEntries = new Map<string, RetryRuntimeEntry>();
    if (hasRetryEntry) retryEntries.set("issue-1", retryEntry);

    const runningEntries = new Map<string, RunningEntry>();
    for (let i = 0; i < runningCount; i++) {
      runningEntries.set(`running-${i}`, {} as RunningEntry);
    }

    const config = {
      tracker: { activeStates: ["In Progress"], terminalStates: ["Done"] },
      agent: { maxConcurrentAgents: 5, maxConcurrentAgentsByState: {} },
    };

    return {
      retryEntries,
      runningEntries,
      deps: {
        tracker: {
          fetchIssueStatesByIds: vi.fn().mockResolvedValue(latestIssue ? [latestIssue] : []),
        },
        workspaceManager: { removeWorkspace: vi.fn().mockResolvedValue(undefined) },
        logger: { warn: vi.fn() },
      },
      getConfig: () =>
        config as unknown as Parameters<typeof revalidateAndLaunchRetry>[0]["getConfig"] extends () => infer C
          ? C
          : never,
      isRunning: () => isRunning,
      clearRetryEntry: vi.fn(),
      hasAvailableStateSlot: vi.fn().mockReturnValue(hasSlot),
      queueRetry: vi.fn(),
      launchWorker: vi.fn().mockResolvedValue(undefined),
    };
  }

  it("returns early when no retry entry exists", async () => {
    const ctx = makeCtx({ hasRetryEntry: false });
    await revalidateAndLaunchRetry(ctx, "issue-1", 1);
    expect(ctx.deps.tracker.fetchIssueStatesByIds).not.toHaveBeenCalled();
  });

  it("returns early when orchestrator is not running", async () => {
    const ctx = makeCtx({ isRunning: false });
    await revalidateAndLaunchRetry(ctx, "issue-1", 1);
    expect(ctx.deps.tracker.fetchIssueStatesByIds).not.toHaveBeenCalled();
  });

  it("clears entry and does not launch when issue not found", async () => {
    const ctx = makeCtx({ latestIssue: null });
    await revalidateAndLaunchRetry(ctx, "issue-1", 1);
    expect(ctx.clearRetryEntry).toHaveBeenCalledWith("issue-1");
    expect(ctx.launchWorker).not.toHaveBeenCalled();
  });

  it("clears entry and removes workspace when issue is in terminal state", async () => {
    const ctx = makeCtx({ latestIssue: makeIssue({ state: "Done" }) });
    await revalidateAndLaunchRetry(ctx, "issue-1", 1);
    expect(ctx.clearRetryEntry).toHaveBeenCalledWith("issue-1");
    expect(ctx.deps.workspaceManager.removeWorkspace).toHaveBeenCalledWith(
      "MT-1",
      expect.objectContaining({ identifier: "MT-1", state: "Done" }),
    );
    expect(ctx.launchWorker).not.toHaveBeenCalled();
  });

  it("clears entry without removing workspace when issue is not active (non-terminal)", async () => {
    const ctx = makeCtx({ latestIssue: makeIssue({ state: "Backlog" }) });
    await revalidateAndLaunchRetry(ctx, "issue-1", 1);
    expect(ctx.clearRetryEntry).toHaveBeenCalledWith("issue-1");
    expect(ctx.deps.workspaceManager.removeWorkspace).not.toHaveBeenCalled();
    expect(ctx.launchWorker).not.toHaveBeenCalled();
  });

  it("re-queues at 1s when at max capacity", async () => {
    const ctx = makeCtx({ runningCount: 5, latestIssue: makeIssue() });
    // max is 5, running is 5 — at capacity
    await revalidateAndLaunchRetry(ctx, "issue-1", 1);
    const [, , delayMs] = ctx.queueRetry.mock.calls[0] as [unknown, unknown, number, unknown];
    expect(delayMs).toBe(1000);
    expect(ctx.launchWorker).not.toHaveBeenCalled();
  });

  it("re-queues at 1s when no available state slot", async () => {
    const ctx = makeCtx({ hasSlot: false });
    await revalidateAndLaunchRetry(ctx, "issue-1", 1);
    const [, , delayMs] = ctx.queueRetry.mock.calls[0] as [unknown, unknown, number, unknown];
    expect(delayMs).toBe(1000);
    expect(ctx.launchWorker).not.toHaveBeenCalled();
  });

  it("launches worker and deletes retry entry when ready", async () => {
    const ctx = makeCtx();
    await revalidateAndLaunchRetry(ctx, "issue-1", 1);
    expect(ctx.launchWorker).toHaveBeenCalledWith(expect.any(Object), 1, { claimHeld: true });
    expect(ctx.retryEntries.has("issue-1")).toBe(false);
    expect(ctx.clearRetryEntry).not.toHaveBeenCalled(); // manual delete, not via clearRetryEntry
  });

  it("passes issueId to fetchIssueStatesByIds", async () => {
    const ctx = makeCtx();
    await revalidateAndLaunchRetry(ctx, "issue-1", 1);
    expect(ctx.deps.tracker.fetchIssueStatesByIds).toHaveBeenCalledWith(["issue-1"]);
  });

  it("includes notification metadata with delayMs and error", () => {
    vi.useFakeTimers();
    const retryEntries = new Map<string, RetryRuntimeEntry>();
    const notify = vi.fn();
    const ctx = {
      isRunning: () => true,
      claimIssue: vi.fn(),
      retryEntries,
      detailViews: new Map(),
      notify,
      revalidateAndLaunchRetry: vi.fn().mockResolvedValue(undefined),
      handleRetryLaunchFailure: vi.fn().mockResolvedValue(undefined),
    };

    queueRetry(ctx, makeIssue(), 2, 5000, "turn_failed");

    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "retry queued in 5000ms",
        metadata: { delayMs: 5000, error: "turn_failed" },
      }),
    );
  });

  it("logs workspace cleanup failure during terminal retry launch", async () => {
    const ctx = makeCtx({ latestIssue: makeIssue({ state: "Done" }) });
    ctx.deps.workspaceManager.removeWorkspace.mockRejectedValue(new Error("cleanup fail"));
    await revalidateAndLaunchRetry(ctx, "issue-1", 1);

    expect(ctx.deps.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ error: "cleanup fail" }),
      "workspace cleanup failed during retry launch",
    );
  });

  it("passes threadId when re-queuing at capacity", async () => {
    const ctx = makeCtx({ runningCount: 5, latestIssue: makeIssue() });
    // Set threadId on the retry entry
    ctx.retryEntries.get("issue-1")!.threadId = "prev-thread";
    await revalidateAndLaunchRetry(ctx, "issue-1", 2);

    expect(ctx.queueRetry).toHaveBeenCalledWith(expect.any(Object), 2, 1000, null, { threadId: "prev-thread" });
  });

  it("passes previousThreadId to launchWorker", async () => {
    const ctx = makeCtx();
    ctx.retryEntries.get("issue-1")!.threadId = "thread-abc";
    await revalidateAndLaunchRetry(ctx, "issue-1", 3);

    expect(ctx.launchWorker).toHaveBeenCalledWith(expect.any(Object), 3, {
      claimHeld: true,
      previousThreadId: "thread-abc",
    });
  });

  it("picks up workspaceKey from detailViews when queuing retry", () => {
    vi.useFakeTimers();
    const retryEntries = new Map<string, RetryRuntimeEntry>();
    const detailViews = new Map([["MT-1", { workspaceKey: "ws-from-detail" }]]);
    const ctx = {
      isRunning: () => true,
      claimIssue: vi.fn(),
      retryEntries,
      detailViews,
      notify: vi.fn(),
      revalidateAndLaunchRetry: vi.fn().mockResolvedValue(undefined),
      handleRetryLaunchFailure: vi.fn().mockResolvedValue(undefined),
    };

    queueRetry(ctx, makeIssue(), 1, 1000, null);

    expect(retryEntries.get("issue-1")!.workspaceKey).toBe("ws-from-detail");
  });
});
