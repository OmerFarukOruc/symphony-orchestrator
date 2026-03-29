import { describe, expect, it, vi } from "vitest";

import { handleRetryLaunchFailure } from "../../src/orchestrator/retry-failure.js";
import type { Issue, ModelSelection } from "../../src/core/types.js";
import type { RunningEntry } from "../../src/orchestrator/runtime-types.js";

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: "issue-1",
    identifier: "MT-1",
    title: "Test",
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

function makeEntry(overrides: Partial<RunningEntry> = {}): RunningEntry {
  return {
    runId: "run-abc",
    issue: makeIssue(),
    workspace: { path: "/tmp/ws", workspaceKey: "ws-key", createdNow: false },
    startedAtMs: Date.now() - 1000,
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

function makeCtx(runningEntry: RunningEntry | null = null) {
  const runningEntries = new Map<string, RunningEntry>();
  if (runningEntry) {
    runningEntries.set("issue-1", runningEntry);
  }

  const detailViews = new Map<string, unknown>();
  const completedViews = new Map<string, unknown>();
  const pushEvent = vi.fn();
  const clearRetryEntry = vi.fn();
  const createAttempt = vi.fn().mockResolvedValue(undefined);
  const updateAttempt = vi.fn().mockResolvedValue(undefined);
  const logError = vi.fn();

  const resolveModelSelection = vi.fn().mockReturnValue({
    model: "gpt-4o",
    reasoningEffort: "high",
    source: "default",
  } as ModelSelection);

  return {
    runningEntries,
    clearRetryEntry,
    deps: {
      attemptStore: { updateAttempt, createAttempt },
      logger: { error: logError },
    },
    detailViews,
    completedViews,
    pushEvent,
    resolveModelSelection,
  };
}

describe("handleRetryLaunchFailure", () => {
  it("logs the error", async () => {
    const ctx = makeCtx();
    await handleRetryLaunchFailure(ctx, makeIssue(), 1, new Error("spawn failed"));
    expect(ctx.deps.logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ issue_id: "issue-1" }),
      "retry-launched worker startup failed",
    );
  });

  it("pushes a worker_failed event", async () => {
    const ctx = makeCtx();
    await handleRetryLaunchFailure(ctx, makeIssue(), 1, new Error("spawn failed"));
    expect(ctx.pushEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: "worker_failed", message: expect.stringContaining("spawn failed") }),
    );
  });

  it("sets detailViews and completedViews to failure view", async () => {
    const ctx = makeCtx();
    await handleRetryLaunchFailure(ctx, makeIssue(), 2, new Error("bad failure"));
    const detail = ctx.detailViews.get("MT-1") as Record<string, unknown>;
    const completed = ctx.completedViews.get("MT-1") as Record<string, unknown>;
    expect(detail).toBeDefined();
    expect(detail.status).toBe("failed");
    expect(detail.attempt).toBe(2);
    expect(completed).toBeDefined();
    expect(completed).toEqual(detail);
  });

  it("clears the retry entry", async () => {
    const ctx = makeCtx();
    await handleRetryLaunchFailure(ctx, makeIssue(), 1, new Error("error"));
    expect(ctx.clearRetryEntry).toHaveBeenCalledWith("issue-1");
  });

  it("removes the running entry when it exists", async () => {
    const entry = makeEntry();
    const ctx = makeCtx(entry);
    await handleRetryLaunchFailure(ctx, makeIssue(), 1, new Error("error"));
    expect(ctx.runningEntries.has("issue-1")).toBe(false);
  });

  it("updates attempt record when running entry exists", async () => {
    const entry = makeEntry();
    const ctx = makeCtx(entry);
    await handleRetryLaunchFailure(ctx, makeIssue(), 1, new Error("startup error"));
    expect(ctx.deps.attemptStore.updateAttempt).toHaveBeenCalledWith(
      "run-abc",
      expect.objectContaining({ status: "failed", errorCode: "worker_failed" }),
    );
  });

  it("creates a new attempt record when no running entry exists", async () => {
    const ctx = makeCtx(null); // no running entry
    await handleRetryLaunchFailure(ctx, makeIssue(), 1, new Error("startup error"));
    expect(ctx.deps.attemptStore.createAttempt).toHaveBeenCalled();
    expect(ctx.deps.attemptStore.updateAttempt).not.toHaveBeenCalled();
  });

  it("handles non-Error thrown values", async () => {
    const ctx = makeCtx();
    await handleRetryLaunchFailure(ctx, makeIssue(), 1, "string error");
    expect(ctx.pushEvent).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("string error") }),
    );
  });

  it("includes workspaceKey from running entry in the failure view", async () => {
    const entry = makeEntry({ workspace: { path: "/tmp/ws", workspaceKey: "my-ws-key", createdNow: false } });
    const ctx = makeCtx(entry);
    await handleRetryLaunchFailure(ctx, makeIssue(), 1, new Error("error"));
    const detail = ctx.detailViews.get("MT-1") as Record<string, unknown>;
    expect(detail.workspaceKey).toBe("my-ws-key");
  });

  it("sets modelChangePending to false in failure view", async () => {
    const ctx = makeCtx();
    await handleRetryLaunchFailure(ctx, makeIssue(), 1, new Error("error"));
    const detail = ctx.detailViews.get("MT-1") as Record<string, unknown>;
    expect(detail.modelChangePending).toBe(false);
  });

  it("includes workspacePath from running entry", async () => {
    const entry = makeEntry({ workspace: { path: "/tmp/specific-path", workspaceKey: "ws", createdNow: false } });
    const ctx = makeCtx(entry);
    await handleRetryLaunchFailure(ctx, makeIssue(), 1, new Error("error"));
    const detail = ctx.detailViews.get("MT-1") as Record<string, unknown>;
    expect(detail.workspacePath).toBe("/tmp/specific-path");
  });

  it("sets workspacePath to null when no running entry", async () => {
    const ctx = makeCtx(null);
    await handleRetryLaunchFailure(ctx, makeIssue(), 1, new Error("error"));
    const detail = ctx.detailViews.get("MT-1") as Record<string, unknown>;
    expect(detail.workspacePath).toBeNull();
  });

  it("includes tokenUsage from running entry", async () => {
    const usage = { inputTokens: 100, outputTokens: 50, totalTokens: 150 };
    const entry = makeEntry({ tokenUsage: usage });
    const ctx = makeCtx(entry);
    await handleRetryLaunchFailure(ctx, makeIssue(), 1, new Error("error"));
    const detail = ctx.detailViews.get("MT-1") as Record<string, unknown>;
    expect(detail.tokenUsage).toEqual(usage);
  });

  it("sets tokenUsage to null when no running entry", async () => {
    const ctx = makeCtx(null);
    await handleRetryLaunchFailure(ctx, makeIssue(), 1, new Error("error"));
    const detail = ctx.detailViews.get("MT-1") as Record<string, unknown>;
    expect(detail.tokenUsage).toBeNull();
  });

  it("falls back to createAttempt when updateAttempt fails", async () => {
    const entry = makeEntry();
    const ctx = makeCtx(entry);
    ctx.deps.attemptStore.updateAttempt.mockRejectedValue(new Error("DB err"));
    (ctx.deps.logger as Record<string, ReturnType<typeof vi.fn>>).warn = vi.fn();
    await handleRetryLaunchFailure(ctx, makeIssue(), 1, new Error("startup error"));

    expect(ctx.deps.attemptStore.updateAttempt).toHaveBeenCalled();
    expect(ctx.deps.attemptStore.createAttempt).toHaveBeenCalled();
    expect((ctx.deps.logger as Record<string, ReturnType<typeof vi.fn>>).warn).toHaveBeenCalledWith(
      expect.objectContaining({ error: "DB err" }),
      "retry failure: failed to update attempt record, falling back to create",
    );
  });

  it("logs warning when createAttempt fails too", async () => {
    const ctx = makeCtx(null);
    ctx.deps.attemptStore.createAttempt.mockRejectedValue(new Error("create err"));
    (ctx.deps.logger as Record<string, ReturnType<typeof vi.fn>>).warn = vi.fn();
    await handleRetryLaunchFailure(ctx, makeIssue(), 1, new Error("startup error"));

    expect((ctx.deps.logger as Record<string, ReturnType<typeof vi.fn>>).warn).toHaveBeenCalledWith(
      expect.objectContaining({ error: "create err" }),
      "retry failure: failed to create fallback attempt record",
    );
  });

  it("passes sessionId as threadId in updateAttempt", async () => {
    const entry = makeEntry({ sessionId: "session-abc" });
    const ctx = makeCtx(entry);
    await handleRetryLaunchFailure(ctx, makeIssue(), 1, new Error("error"));

    expect(ctx.deps.attemptStore.updateAttempt).toHaveBeenCalledWith(
      "run-abc",
      expect.objectContaining({ threadId: "session-abc" }),
    );
  });

  it("passes tokenUsage in updateAttempt when running entry has it", async () => {
    const usage = { inputTokens: 10, outputTokens: 5, totalTokens: 15 };
    const entry = makeEntry({ tokenUsage: usage });
    const ctx = makeCtx(entry);
    await handleRetryLaunchFailure(ctx, makeIssue(), 1, new Error("error"));

    expect(ctx.deps.attemptStore.updateAttempt).toHaveBeenCalledWith(
      "run-abc",
      expect.objectContaining({ tokenUsage: usage }),
    );
  });

  it("passes workspaceKey from failureView to persistRetryFailure", async () => {
    const entry = makeEntry({ workspace: { path: "/tmp/ws", workspaceKey: "ws-k", createdNow: false } });
    const ctx = makeCtx(entry);
    ctx.deps.attemptStore.updateAttempt.mockRejectedValue(new Error("err"));
    (ctx.deps.logger as Record<string, ReturnType<typeof vi.fn>>).warn = vi.fn();
    await handleRetryLaunchFailure(ctx, makeIssue(), 1, new Error("error"));

    // The createAttempt fallback should include workspaceKey
    expect(ctx.deps.attemptStore.createAttempt).toHaveBeenCalledWith(expect.objectContaining({ workspaceKey: "ws-k" }));
  });

  it("includes sessionId in pushed event", async () => {
    const entry = makeEntry({ sessionId: "sess-xyz" });
    const ctx = makeCtx(entry);
    await handleRetryLaunchFailure(ctx, makeIssue(), 1, new Error("error"));

    expect(ctx.pushEvent).toHaveBeenCalledWith(expect.objectContaining({ sessionId: "sess-xyz" }));
  });

  it("uses null sessionId in pushed event when no running entry", async () => {
    const ctx = makeCtx(null);
    await handleRetryLaunchFailure(ctx, makeIssue(), 1, new Error("error"));

    expect(ctx.pushEvent).toHaveBeenCalledWith(expect.objectContaining({ sessionId: null }));
  });
});
