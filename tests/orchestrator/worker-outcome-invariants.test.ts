import { describe, expect, it, vi } from "vitest";

import { handleWorkerOutcome } from "../../src/orchestrator/worker-outcome/index.js";
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
): OutcomeContext {
  const { isRunning = true, latestIssue = makeIssue(), config = makeConfig() } = overrides;

  const runningEntries = new Map<string, RunningEntry>();
  const completedViews = new Map<string, RuntimeIssueView>();
  const detailViews = new Map<string, RuntimeIssueView>();

  return {
    runningEntries,
    completedViews,
    detailViews,
    deps: {
      tracker: {
        fetchIssueStatesByIds: vi.fn().mockResolvedValue(latestIssue ? [latestIssue] : [makeIssue()]),
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
      gitManager: {
        commitAndPush: vi.fn().mockResolvedValue({ pushed: false, branchName: "mt-1" }),
        createPullRequest: vi.fn().mockResolvedValue({ html_url: "https://github.com/org/repo/pull/1" }),
      },
      logger: { info: vi.fn(), warn: vi.fn() },
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

describe("worker-outcome branch invariants", () => {
  it("operator_abort releases the claim", async () => {
    const ctx = makeCtx();
    const entry = makeEntry();
    ctx.runningEntries.set("issue-1", entry);

    await handleWorkerOutcome(
      ctx,
      makeOutcome({ kind: "cancelled", errorCode: "operator_abort" }),
      entry,
      makeIssue(),
      makeWorkspace(),
      1,
    );

    expect(ctx.releaseIssueClaim).toHaveBeenCalledWith("issue-1");
  });

  it("tracker fetch fallback uses original issue", async () => {
    const issue = makeIssue();
    const ctx = makeCtx();
    // Force fetchIssueStatesByIds to reject so the .catch(() => [issue]) fallback fires
    (ctx.deps.tracker.fetchIssueStatesByIds as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("tracker down"));
    const entry = makeEntry({ lastAgentMessageContent: null });
    ctx.runningEntries.set("issue-1", entry);

    await handleWorkerOutcome(ctx, makeOutcome({ kind: "normal" }), entry, issue, makeWorkspace(), 1);

    // The fallback should use the original issue, which is still "In Progress" (active).
    // With a normal outcome and no stop signal, it queues a continuation retry using that issue.
    expect(ctx.queueRetry).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: "MT-1" }),
      2,
      1000,
      "continuation",
      { threadId: "sess-xyz" },
    );
  });

  it("flushPersistence failure propagates (fatal)", async () => {
    const ctx = makeCtx();
    const entry = makeEntry({
      flushPersistence: vi.fn().mockRejectedValue(new Error("flush failed")),
    });
    ctx.runningEntries.set("issue-1", entry);

    await expect(handleWorkerOutcome(ctx, makeOutcome(), entry, makeIssue(), makeWorkspace(), 1)).rejects.toThrow(
      "flush failed",
    );
  });

  it("DONE claim is sticky, BLOCKED releases", async () => {
    // Test A: DONE keeps the claim
    const ctxDone = makeCtx();
    const entryDone = makeEntry({
      lastAgentMessageContent: "SYMPHONY_STATUS: DONE",
    });
    ctxDone.runningEntries.set("issue-1", entryDone);

    await handleWorkerOutcome(ctxDone, makeOutcome({ kind: "normal" }), entryDone, makeIssue(), makeWorkspace(), 1);

    expect(ctxDone.releaseIssueClaim).not.toHaveBeenCalled();

    // Test B: BLOCKED releases the claim
    const ctxBlocked = makeCtx();
    const entryBlocked = makeEntry({
      lastAgentMessageContent: "SYMPHONY_STATUS: BLOCKED",
    });
    ctxBlocked.runningEntries.set("issue-1", entryBlocked);

    await handleWorkerOutcome(
      ctxBlocked,
      makeOutcome({ kind: "normal" }),
      entryBlocked,
      makeIssue(),
      makeWorkspace(),
      1,
    );

    expect(ctxBlocked.releaseIssueClaim).toHaveBeenCalledWith("issue-1");
  });

  it("model_override_updated preserves attempt number", async () => {
    const ctx = makeCtx();
    const entry = makeEntry();
    ctx.runningEntries.set("issue-1", entry);

    await handleWorkerOutcome(
      ctx,
      makeOutcome({ kind: "cancelled", errorCode: "model_override_updated" }),
      entry,
      makeIssue(),
      makeWorkspace(),
      3,
    );

    // The code uses `attempt ?? 1` (not `(attempt ?? 0) + 1`), so attempt=3 passes 3 directly.
    expect(ctx.queueRetry).toHaveBeenCalledWith(expect.any(Object), 3, 0, "model_override_updated");
  });

  it("fire-and-forget writeback ordering: completedView set synchronously before writeLinearCompletion", async () => {
    const ctx = makeCtx();
    const entry = makeEntry({
      lastAgentMessageContent: "SYMPHONY_STATUS: DONE",
    });
    ctx.runningEntries.set("issue-1", entry);

    await handleWorkerOutcome(ctx, makeOutcome({ kind: "normal" }), entry, makeIssue(), makeWorkspace(), 1);

    // completedViews must be populated immediately after handleWorkerOutcome resolves,
    // before the fire-and-forget writeLinearCompletion microtask runs.
    expect(ctx.completedViews.has("MT-1")).toBe(true);
    const view = ctx.completedViews.get("MT-1")!;
    expect(view.status).toBe("completed");
  });
});
