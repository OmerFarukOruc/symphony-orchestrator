/**
 * Integration tests for writeLinearCompletion() wiring in handleStopSignal.
 *
 * writeLinearCompletion is void-dispatched from handleStopSignal, so tests
 * flush the microtask queue with setTimeout(0) after the outer await.
 */

import { describe, expect, it, vi } from "vitest";
import { handleWorkerOutcome } from "../../src/orchestrator/worker-outcome.js";
import type { Issue, ModelSelection, RunOutcome, ServiceConfig, Workspace } from "../../src/core/types.js";
import type { RunningEntry } from "../../src/orchestrator/runtime-types.js";

/** Flush all pending microtasks — needed because writeLinearCompletion is void-dispatched. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

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
    threadId: null,
    turnId: null,
    turnCount: 1,
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
    sessionId: "sess-1",
    tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    modelSelection: { model: "gpt-4o", reasoningEffort: "high", source: "default" },
    lastAgentMessageContent: "SYMPHONY_STATUS: DONE",
    repoMatch: null,
    queuePersistence: () => undefined,
    flushPersistence: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as RunningEntry;
}

function makeCtx(
  overrides: {
    successState?: string | null;
    resolveStateIdResult?: string | null;
    resolveStateIdError?: Error;
  } = {},
) {
  const resolveStateId = overrides.resolveStateIdError
    ? vi.fn().mockRejectedValue(overrides.resolveStateIdError)
    : vi.fn().mockResolvedValue(overrides.resolveStateIdResult ?? null);

  const updateIssueState = vi.fn().mockResolvedValue(undefined);
  const createComment = vi.fn().mockResolvedValue(undefined);

  const config = {
    tracker: {
      kind: "linear",
      apiKey: "k",
      endpoint: "e",
      projectSlug: null,
      activeStates: ["In Progress"],
      terminalStates: ["Done"],
    },
    polling: { intervalMs: 30000 },
    workspace: {
      root: "/tmp",
      hooks: { afterCreate: null, beforeRun: null, afterRun: null, beforeRemove: null, timeoutMs: 1000 },
    },
    agent: {
      maxConcurrentAgents: 5,
      maxConcurrentAgentsByState: {},
      maxTurns: 10,
      maxRetryBackoffMs: 300000,
      maxContinuationAttempts: 5,
      successState: overrides.successState ?? null,
      stallTimeoutMs: 1200000,
    },
    codex: {} as ServiceConfig["codex"],
    server: { port: 4000 },
  } as ServiceConfig;

  const runningEntries = new Map<string, RunningEntry>();
  return {
    runningEntries,
    completedViews: new Map<string, unknown>(),
    detailViews: new Map<string, unknown>(),
    deps: {
      linearClient: {
        fetchIssueStatesByIds: vi.fn().mockResolvedValue([makeIssue()]),
        resolveStateId,
        updateIssueState,
        createComment,
      },
      attemptStore: { updateAttempt: vi.fn().mockResolvedValue(undefined) },
      workspaceManager: { removeWorkspace: vi.fn().mockResolvedValue(undefined) },
      logger: { info: vi.fn(), warn: vi.fn() },
    },
    isRunning: () => true,
    getConfig: () => config,
    releaseIssueClaim: vi.fn(),
    resolveModelSelection: vi
      .fn()
      .mockReturnValue({ model: "gpt-4o", reasoningEffort: "high", source: "default" } as ModelSelection),
    notify: vi.fn(),
    queueRetry: vi.fn(),
  };
}

describe("writeLinearCompletion — via handleWorkerOutcome + SYMPHONY_STATUS: DONE", () => {
  it("transitions issue state when successState is configured and stateId is found", async () => {
    const ctx = makeCtx({ successState: "Done", resolveStateIdResult: "state-done-id" });
    const entry = makeEntry({ lastAgentMessageContent: "SYMPHONY_STATUS: DONE" });
    ctx.runningEntries.set("issue-1", entry);

    await handleWorkerOutcome(ctx, makeOutcome({ kind: "normal" }), entry, makeIssue(), makeWorkspace(), 1);
    await flush();

    expect(ctx.deps.linearClient.resolveStateId).toHaveBeenCalledWith("Done");
    expect(ctx.deps.linearClient.updateIssueState).toHaveBeenCalledWith("issue-1", "state-done-id");
    expect(ctx.deps.linearClient.createComment).toHaveBeenCalledWith(
      "issue-1",
      expect.stringContaining("Symphony agent completed"),
    );
  });

  it("skips state transition but still posts comment when successState resolves to null", async () => {
    const ctx = makeCtx({ successState: "Done", resolveStateIdResult: null });
    const entry = makeEntry({ lastAgentMessageContent: "SYMPHONY_STATUS: DONE" });
    ctx.runningEntries.set("issue-1", entry);

    await handleWorkerOutcome(ctx, makeOutcome({ kind: "normal" }), entry, makeIssue(), makeWorkspace(), 1);
    await flush();

    expect(ctx.deps.linearClient.updateIssueState).not.toHaveBeenCalled();
    expect(ctx.deps.linearClient.createComment).toHaveBeenCalledOnce();
    expect(ctx.deps.linearClient.logger?.warn ?? ctx.deps.logger.warn).toBeDefined();
  });

  it("skips state transition when successState is null", async () => {
    const ctx = makeCtx({ successState: null });
    const entry = makeEntry({ lastAgentMessageContent: "SYMPHONY_STATUS: DONE" });
    ctx.runningEntries.set("issue-1", entry);

    await handleWorkerOutcome(ctx, makeOutcome({ kind: "normal" }), entry, makeIssue(), makeWorkspace(), 1);
    await flush();

    expect(ctx.deps.linearClient.resolveStateId).not.toHaveBeenCalled();
    expect(ctx.deps.linearClient.updateIssueState).not.toHaveBeenCalled();
    expect(ctx.deps.linearClient.createComment).toHaveBeenCalledOnce();
  });

  it("swallows resolveStateId error and still posts comment", async () => {
    const ctx = makeCtx({ successState: "Done", resolveStateIdError: new Error("Linear API down") });
    const entry = makeEntry({ lastAgentMessageContent: "SYMPHONY_STATUS: DONE" });
    ctx.runningEntries.set("issue-1", entry);

    await handleWorkerOutcome(ctx, makeOutcome({ kind: "normal" }), entry, makeIssue(), makeWorkspace(), 1);
    await flush();

    expect(ctx.deps.linearClient.updateIssueState).not.toHaveBeenCalled();
    expect(ctx.deps.linearClient.createComment).toHaveBeenCalledOnce();
    expect(ctx.deps.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ issue_identifier: "MT-1" }),
      expect.stringContaining("linear state transition failed"),
    );
  });

  it("includes token usage in the comment body", async () => {
    const ctx = makeCtx({ successState: null });
    const entry = makeEntry({
      lastAgentMessageContent: "SYMPHONY_STATUS: DONE",
      tokenUsage: { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 },
    });
    ctx.runningEntries.set("issue-1", entry);

    await handleWorkerOutcome(ctx, makeOutcome({ kind: "normal" }), entry, makeIssue(), makeWorkspace(), 1);
    await flush();

    const commentBody = (ctx.deps.linearClient.createComment as ReturnType<typeof vi.fn>).mock.calls[0][1] as string;
    expect(commentBody).toContain("1,500");
    expect(commentBody).toContain("1,000");
    expect(commentBody).toContain("500");
  });
});

describe("writeLinearCompletion — via handleWorkerOutcome + SYMPHONY_STATUS: BLOCKED", () => {
  it("posts comment for BLOCKED but does NOT transition state even with successState configured", async () => {
    const ctx = makeCtx({ successState: "Done", resolveStateIdResult: "state-done-id" });
    const entry = makeEntry({ lastAgentMessageContent: "SYMPHONY_STATUS: BLOCKED" });
    ctx.runningEntries.set("issue-1", entry);

    await handleWorkerOutcome(ctx, makeOutcome({ kind: "normal" }), entry, makeIssue(), makeWorkspace(), 1);
    await flush();

    expect(ctx.deps.linearClient.resolveStateId).not.toHaveBeenCalled();
    expect(ctx.deps.linearClient.updateIssueState).not.toHaveBeenCalled();
    expect(ctx.deps.linearClient.createComment).toHaveBeenCalledOnce();
  });
});
