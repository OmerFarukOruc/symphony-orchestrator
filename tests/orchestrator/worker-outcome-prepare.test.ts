import { describe, expect, it, vi, beforeEach } from "vitest";

import { prepareWorkerOutcome } from "../../src/orchestrator/worker-outcome/prepare.js";
import { buildOutcomeView } from "../../src/orchestrator/outcome-view-builder.js";
import type { OutcomeContext } from "../../src/orchestrator/context.js";
import type { Issue, RunOutcome, RuntimeIssueView } from "../../src/core/types.js";
import type { RunningEntry } from "../../src/orchestrator/runtime-types.js";
import { createIssue, createWorkspace, createRunningEntry, createModelSelection } from "./issue-test-factories.js";

function makeOutcome(overrides: Partial<RunOutcome> = {}): RunOutcome {
  return {
    kind: "normal",
    errorCode: null,
    errorMessage: null,
    threadId: "thread-1",
    turnId: "turn-1",
    turnCount: 5,
    ...overrides,
  };
}

function makeCtx(overrides?: { latestIssue?: Issue }): OutcomeContext {
  const latestIssue = overrides?.latestIssue ?? createIssue();
  const runningEntries = new Map<string, RunningEntry>();
  const completedViews = new Map<string, RuntimeIssueView>();
  const detailViews = new Map<string, RuntimeIssueView>();
  const markDirty = vi.fn();

  return {
    runningEntries,
    completedViews,
    detailViews,
    deps: {
      tracker: {
        fetchIssueStatesByIds: vi.fn().mockResolvedValue([latestIssue]),
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
      logger: { info: vi.fn(), warn: vi.fn() },
    },
    isRunning: () => true,
    getConfig: () =>
      ({
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
          maxRetryBackoffMs: 300000,
          maxContinuationAttempts: 5,
          successState: null,
          stallTimeoutMs: 1200000,
        },
      }) as unknown as ReturnType<OutcomeContext["getConfig"]>,
    releaseIssueClaim: vi.fn(),
    markDirty,
    resolveModelSelection: vi.fn().mockReturnValue(createModelSelection()),
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
    notify: vi.fn(),
    retryCoordinator: {
      dispatch: vi.fn().mockResolvedValue(undefined),
      cancel: vi.fn(),
    },
  };
}

describe("prepareWorkerOutcome", () => {
  let ctx: OutcomeContext;
  let entry: RunningEntry;
  const issue = createIssue();
  const workspace = createWorkspace();
  const outcome = makeOutcome();

  beforeEach(() => {
    ctx = makeCtx();
    entry = createRunningEntry({ flushPersistence: vi.fn().mockResolvedValue(undefined) });
    ctx.runningEntries.set(issue.id, entry);
  });

  it("flushes entry persistence before doing anything else", async () => {
    await prepareWorkerOutcome(ctx, { outcome, entry, issue, workspace, attempt: 1 });

    expect(entry.flushPersistence).toHaveBeenCalledOnce();
  });

  it("deletes the running entry from runtime state", async () => {
    expect(ctx.runningEntries.has(issue.id)).toBe(true);

    await prepareWorkerOutcome(ctx, { outcome, entry, issue, workspace, attempt: 1 });

    expect(ctx.runningEntries.has(issue.id)).toBe(false);
  });

  it("fetches latest issue state from tracker", async () => {
    await prepareWorkerOutcome(ctx, { outcome, entry, issue, workspace, attempt: 1 });

    expect(ctx.deps.tracker.fetchIssueStatesByIds).toHaveBeenCalledWith([issue.id]);
  });

  it("returns the latest issue fetched from tracker", async () => {
    const updatedIssue = createIssue({ state: "Done", title: "Updated Title" });
    const ctxWithUpdated = makeCtx({ latestIssue: updatedIssue });
    ctxWithUpdated.runningEntries.set(issue.id, entry);

    const result = await prepareWorkerOutcome(ctxWithUpdated, { outcome, entry, issue, workspace, attempt: 1 });

    expect(result.latestIssue.state).toBe("Done");
    expect(result.latestIssue.title).toBe("Updated Title");
  });

  it("falls back to original issue when tracker fetch fails", async () => {
    vi.mocked(ctx.deps.tracker.fetchIssueStatesByIds).mockRejectedValueOnce(new Error("network error"));

    const result = await prepareWorkerOutcome(ctx, { outcome, entry, issue, workspace, attempt: 1 });

    expect(result.latestIssue.id).toBe(issue.id);
    expect(result.latestIssue.identifier).toBe(issue.identifier);
  });

  it("persists the attempt with correct fields", async () => {
    const failedOutcome = makeOutcome({
      kind: "failed",
      errorCode: "turn_failed",
      errorMessage: "agent crashed",
      threadId: "thread-99",
      turnId: "turn-42",
      turnCount: 7,
    });

    await prepareWorkerOutcome(ctx, { outcome: failedOutcome, entry, issue, workspace, attempt: 2 });

    expect(ctx.deps.attemptStore.updateAttempt).toHaveBeenCalledWith(
      entry.runId,
      expect.objectContaining({
        issueId: issue.id,
        issueIdentifier: issue.identifier,
        title: issue.title,
        status: "failed",
        threadId: "thread-99",
        turnId: "turn-42",
        turnCount: 7,
        errorCode: "turn_failed",
        errorMessage: "agent crashed",
        tokenUsage: entry.tokenUsage,
      }),
    );
  });

  it("persists endedAt as an ISO timestamp", async () => {
    await prepareWorkerOutcome(ctx, { outcome, entry, issue, workspace, attempt: 1 });

    const updateCall = vi.mocked(ctx.deps.attemptStore.updateAttempt).mock.calls[0];
    const patch = updateCall[1] as Record<string, unknown>;
    expect(typeof patch.endedAt).toBe("string");
    expect(() => new Date(patch.endedAt as string)).not.toThrow();
    expect(new Date(patch.endedAt as string).toISOString()).toBe(patch.endedAt);
  });

  it("maps outcome status via outcomeToStatus for each outcome kind", async () => {
    const kinds: RunOutcome["kind"][] = ["normal", "timed_out", "stalled", "cancelled", "failed"];
    const expectedStatuses = ["completed", "timed_out", "stalled", "cancelled", "failed"];

    for (let index = 0; index < kinds.length; index++) {
      const kindCtx = makeCtx();
      const kindEntry = createRunningEntry({ flushPersistence: vi.fn().mockResolvedValue(undefined) });
      kindCtx.runningEntries.set(issue.id, kindEntry);

      await prepareWorkerOutcome(kindCtx, {
        outcome: makeOutcome({ kind: kinds[index] }),
        entry: kindEntry,
        issue,
        workspace,
        attempt: 1,
      });

      const patch = vi.mocked(kindCtx.deps.attemptStore.updateAttempt).mock.calls[0][1] as Record<string, unknown>;
      expect(patch.status).toBe(expectedStatuses[index]);
    }
  });

  it("uses sessionId as threadId fallback when outcome.threadId is null", async () => {
    const noThreadOutcome = makeOutcome({ threadId: null });

    await prepareWorkerOutcome(ctx, { outcome: noThreadOutcome, entry, issue, workspace, attempt: 1 });

    const patch = vi.mocked(ctx.deps.attemptStore.updateAttempt).mock.calls[0][1] as Record<string, unknown>;
    expect(patch.threadId).toBe(entry.sessionId);
  });

  it("resolves model selection using latest issue identifier", async () => {
    const updatedIssue = createIssue({ identifier: "MT-99" });
    const ctxWithUpdated = makeCtx({ latestIssue: updatedIssue });
    ctxWithUpdated.runningEntries.set(issue.id, entry);

    await prepareWorkerOutcome(ctxWithUpdated, { outcome, entry, issue, workspace, attempt: 1 });

    expect(ctxWithUpdated.resolveModelSelection).toHaveBeenCalledWith("MT-99");
  });

  it("returns the resolved model selection in the result", async () => {
    const customSelection = createModelSelection({ model: "o3-pro", source: "override" });
    vi.mocked(ctx.resolveModelSelection).mockReturnValue(customSelection);

    const result = await prepareWorkerOutcome(ctx, { outcome, entry, issue, workspace, attempt: 1 });

    expect(result.modelSelection).toBe(customSelection);
  });

  it("populates detail view via buildOutcomeView", async () => {
    expect(ctx.detailViews.has(issue.identifier)).toBe(false);

    await prepareWorkerOutcome(ctx, { outcome, entry, issue, workspace, attempt: 1 });

    expect(ctx.detailViews.has(issue.identifier)).toBe(true);
    const view = ctx.detailViews.get(issue.identifier)!;
    expect(view.identifier).toBe(issue.identifier);
    expect(view.status).toBe("normal");
  });

  it("spreads original input fields into the returned object", async () => {
    const result = await prepareWorkerOutcome(ctx, { outcome, entry, issue, workspace, attempt: 3 });

    expect(result.outcome).toBe(outcome);
    expect(result.entry).toBe(entry);
    expect(result.issue).toBe(issue);
    expect(result.workspace).toBe(workspace);
    expect(result.attempt).toBe(3);
  });

  it("handles null attempt", async () => {
    const result = await prepareWorkerOutcome(ctx, { outcome, entry, issue, workspace, attempt: null });

    expect(result.attempt).toBeNull();
    const view = ctx.detailViews.get(issue.identifier)!;
    expect(view.attempt).toBeNull();
  });

  it("passes token usage through to attempt store", async () => {
    const entryWithTokens = createRunningEntry({
      flushPersistence: vi.fn().mockResolvedValue(undefined),
      tokenUsage: { inputTokens: 1000, outputTokens: 500, cacheReadTokens: 200, cacheWriteTokens: 50 },
    });
    ctx.runningEntries.set(issue.id, entryWithTokens);

    await prepareWorkerOutcome(ctx, { outcome, entry: entryWithTokens, issue, workspace, attempt: 1 });

    const patch = vi.mocked(ctx.deps.attemptStore.updateAttempt).mock.calls[0][1] as Record<string, unknown>;
    expect(patch.tokenUsage).toEqual({
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadTokens: 200,
      cacheWriteTokens: 50,
    });
  });
});
