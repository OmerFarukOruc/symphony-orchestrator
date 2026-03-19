import { describe, expect, it, vi } from "vitest";

import { handleWorkerOutcome, handleWorkerFailure } from "../../src/orchestrator/worker-outcome.js";
import type { Issue, ModelSelection, RunOutcome, ServiceConfig, Workspace } from "../../src/core/types.js";
import type { RunningEntry } from "../../src/orchestrator/runtime-types.js";

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
    agent: { maxConcurrentAgents: 5, maxConcurrentAgentsByState: {}, maxTurns: 10, maxRetryBackoffMs: 300000 },
  } as unknown as ServiceConfig;
}

function makeCtx(
  overrides: {
    isRunning?: boolean;
    latestIssue?: Issue | null;
    config?: ServiceConfig;
  } = {},
) {
  const { isRunning = true, latestIssue = makeIssue(), config = makeConfig() } = overrides;

  const runningEntries = new Map<string, RunningEntry>();
  const completedViews = new Map<string, unknown>();
  const detailViews = new Map<string, unknown>();

  return {
    runningEntries,
    completedViews,
    detailViews,
    deps: {
      linearClient: {
        fetchIssueStatesByIds: vi.fn().mockResolvedValue(latestIssue ? [latestIssue] : [makeIssue()]),
      },
      attemptStore: {
        updateAttempt: vi.fn().mockResolvedValue(undefined),
      },
      workspaceManager: {
        removeWorkspace: vi.fn().mockResolvedValue(undefined),
      },
      gitManager: {
        commitAndPush: vi.fn().mockResolvedValue({ pushed: false, branchName: "mt-1" }),
        createPullRequest: vi.fn().mockResolvedValue({ html_url: "https://github.com/org/repo/pull/1" }),
      },
      logger: { info: vi.fn() },
    },
    isRunning: () => isRunning,
    getConfig: () => config,
    releaseIssueClaim: vi.fn(),
    resolveModelSelection: vi.fn().mockReturnValue({
      model: "gpt-4o",
      reasoningEffort: "high",
      source: "default",
    } as ModelSelection),
    notify: vi.fn(),
    queueRetry: vi.fn(),
  };
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

    expect(ctx.deps.workspaceManager.removeWorkspace).toHaveBeenCalledWith("MT-1");
    expect(ctx.releaseIssueClaim).toHaveBeenCalledWith("issue-1");
    expect(ctx.queueRetry).not.toHaveBeenCalled();
  });

  it("removes workspace when cleanupOnExit is true regardless of issue state", async () => {
    const ctx = makeCtx();
    const entry = makeEntry({ cleanupOnExit: true });
    ctx.runningEntries.set("issue-1", entry);

    await handleWorkerOutcome(ctx, makeOutcome(), entry, makeIssue(), makeWorkspace(), 1);

    expect(ctx.deps.workspaceManager.removeWorkspace).toHaveBeenCalledWith("MT-1");
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
    expect(ctx.queueRetry).not.toHaveBeenCalled();
    const view = ctx.completedViews.get("MT-1") as Record<string, unknown>;
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

    expect(ctx.queueRetry).not.toHaveBeenCalled();
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

    expect(ctx.queueRetry).not.toHaveBeenCalled();
  });
});

describe("handleWorkerOutcome - model_override_updated path", () => {
  it("re-queues at 0ms delay when model override was the reason", async () => {
    const ctx = makeCtx();
    const entry = makeEntry();
    ctx.runningEntries.set("issue-1", entry);

    await handleWorkerOutcome(
      ctx,
      makeOutcome({ kind: "cancelled", errorCode: "model_override_updated" }),
      entry,
      makeIssue(),
      makeWorkspace(),
      1,
    );

    expect(ctx.queueRetry).toHaveBeenCalledWith(expect.any(Object), 1, 0, "model_override_updated");
  });
});

describe("handleWorkerOutcome - stop signal detection", () => {
  it("marks done and triggers git post-run when SYMPHONY_STATUS: DONE detected", async () => {
    const ctx = makeCtx();
    const entry = makeEntry({
      lastAgentMessageContent: "I have completed the work.\n\nSYMPHONY_STATUS: DONE",
      repoMatch: {
        repoUrl: "https://github.com/org/repo",
        defaultBranch: "main",
        identifierPrefix: "MT",
        label: null,
        githubOwner: "org",
        githubRepo: "repo",
        githubTokenEnv: null,
      },
    });
    ctx.runningEntries.set("issue-1", entry);

    await handleWorkerOutcome(ctx, makeOutcome({ kind: "normal" }), entry, makeIssue(), makeWorkspace(), 1);

    expect(ctx.notify).toHaveBeenCalledWith(expect.objectContaining({ type: "worker_completed" }));
    expect(ctx.queueRetry).not.toHaveBeenCalled();
    const view = ctx.completedViews.get("MT-1") as Record<string, unknown>;
    expect(view.status).toBe("completed");
  });

  it("marks paused when SYMPHONY_STATUS: BLOCKED detected", async () => {
    const ctx = makeCtx();
    const entry = makeEntry({
      lastAgentMessageContent: "I cannot proceed.\n\nSYMPHONY_STATUS: BLOCKED",
    });
    ctx.runningEntries.set("issue-1", entry);

    await handleWorkerOutcome(ctx, makeOutcome({ kind: "normal" }), entry, makeIssue(), makeWorkspace(), 1);

    expect(ctx.notify).toHaveBeenCalledWith(expect.objectContaining({ type: "worker_failed" }));
    const view = ctx.completedViews.get("MT-1") as Record<string, unknown>;
    expect(view.status).toBe("paused");
  });

  it("handles case-insensitive SYMPHONY_STATUS variations", async () => {
    const ctx = makeCtx();
    const entry = makeEntry({
      lastAgentMessageContent: "SYMPHONY STATUS: done",
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

    await handleWorkerOutcome(ctx, makeOutcome({ kind: "normal" }), entry, makeIssue(), makeWorkspace(), 1);

    // Should queue continuation retry, not mark as done
    expect(ctx.queueRetry).toHaveBeenCalledWith(expect.any(Object), 2, 1000, "continuation");
  });
});

describe("handleWorkerOutcome - continuation retry", () => {
  it("queues continuation retry for normal outcome with no stop signal", async () => {
    const ctx = makeCtx();
    const entry = makeEntry({ lastAgentMessageContent: null });
    ctx.runningEntries.set("issue-1", entry);

    await handleWorkerOutcome(ctx, makeOutcome({ kind: "normal" }), entry, makeIssue(), makeWorkspace(), 1);

    expect(ctx.queueRetry).toHaveBeenCalledWith(expect.any(Object), 2, 1000, "continuation");
  });

  it("queues retry with exponential backoff for failure outcomes", async () => {
    const ctx = makeCtx();
    const entry = makeEntry();
    ctx.runningEntries.set("issue-1", entry);

    await handleWorkerOutcome(
      ctx,
      makeOutcome({ kind: "failed", errorCode: "turn_failed" }),
      entry,
      makeIssue(),
      makeWorkspace(),
      1, // attempt 1 → next attempt is 2, delay = 10000 * 2^(2-1) = 20000
    );

    const [, nextAttempt, delayMs] = ctx.queueRetry.mock.calls[0] as [unknown, number, number, unknown];
    expect(nextAttempt).toBe(2);
    expect(delayMs).toBe(20000);
  });

  it("caps retry delay at maxRetryBackoffMs", async () => {
    const config = makeConfig();
    config.agent.maxRetryBackoffMs = 5000;
    const ctx = makeCtx({ config });
    const entry = makeEntry();
    ctx.runningEntries.set("issue-1", entry);

    await handleWorkerOutcome(
      ctx,
      makeOutcome({ kind: "failed", errorCode: "turn_failed" }),
      entry,
      makeIssue(),
      makeWorkspace(),
      10, // very high attempt → would be huge delay, but capped
    );

    const [, , delayMs] = ctx.queueRetry.mock.calls[0] as [unknown, number, number, unknown];
    expect(delayMs).toBe(5000);
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

    await handleWorkerFailure(
      { runningEntries, releaseIssueClaim, pushEvent, deps: { attemptStore: { updateAttempt } } },
      makeIssue(),
      entry,
      new Error("unexpected crash"),
    );

    expect(runningEntries.has("issue-1")).toBe(false);
    expect(releaseIssueClaim).toHaveBeenCalledWith("issue-1");
    expect(pushEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: "worker_failed", message: "Error: unexpected crash" }),
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

    await handleWorkerFailure(
      { runningEntries, releaseIssueClaim: vi.fn(), pushEvent, deps: { attemptStore: { updateAttempt } } },
      makeIssue(),
      entry,
      "string error",
    );

    expect(pushEvent).toHaveBeenCalledWith(expect.objectContaining({ message: "string error" }));
  });
});
