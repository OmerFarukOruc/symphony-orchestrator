import { describe, expect, it, vi } from "vitest";

import type { StopSignal } from "../../src/core/signal-detection.js";
import type { OutcomeContext } from "../../src/orchestrator/context.js";
import { handleStopSignal } from "../../src/orchestrator/worker-outcome/stop-signal.js";
import type { PreparedWorkerOutcome } from "../../src/orchestrator/worker-outcome/types.js";
import { createIssue, createModelSelection, createRunningEntry, createWorkspace } from "./issue-test-factories.js";

function makePrepared(): PreparedWorkerOutcome {
  const issue = createIssue();
  const workspace = createWorkspace();
  return {
    outcome: {
      kind: "normal",
      errorCode: null,
      errorMessage: null,
      threadId: null,
      turnId: "turn-1",
      turnCount: 3,
    },
    entry: createRunningEntry({ issue, workspace }),
    issue,
    latestIssue: issue,
    workspace,
    attempt: 1,
    modelSelection: createModelSelection(),
  };
}

function makeCtx(finalizeStopSignal?: OutcomeContext["finalizeStopSignal"]): OutcomeContext {
  return {
    runningEntries: new Map(),
    completedViews: new Map(),
    detailViews: new Map(),
    deps: {
      tracker: {
        fetchIssueStatesByIds: vi.fn(),
        resolveStateId: vi.fn(),
        updateIssueState: vi.fn(),
        createComment: vi.fn(),
      },
      attemptStore: {
        updateAttempt: vi.fn(),
      },
      workspaceManager: {
        removeWorkspace: vi.fn(),
      },
      logger: { info: vi.fn(), warn: vi.fn() },
    },
    isRunning: () => true,
    getConfig: vi.fn() as OutcomeContext["getConfig"],
    releaseIssueClaim: vi.fn(),
    markDirty: vi.fn(),
    resolveModelSelection: vi.fn(),
    buildOutcomeView: vi.fn(),
    setDetailView: vi.fn(),
    setCompletedView: vi.fn(),
    finalizeStopSignal,
    notify: vi.fn(),
    retryCoordinator: {
      dispatch: vi.fn(),
      cancel: vi.fn(),
    },
  } as unknown as OutcomeContext;
}

describe("worker-outcome stop-signal adapter", () => {
  it.each(["done", "blocked"] satisfies StopSignal[])(
    "delegates %s through OutcomeContext.finalizeStopSignal",
    async (stopSignal) => {
      const finalizeStopSignal = vi.fn().mockResolvedValue(undefined);
      const ctx = makeCtx(finalizeStopSignal);
      const prepared = makePrepared();

      await handleStopSignal(ctx, stopSignal, prepared, 7);

      expect(finalizeStopSignal).toHaveBeenCalledWith(stopSignal, prepared, 7);
    },
  );

  it("passes null turnCount through unchanged", async () => {
    const finalizeStopSignal = vi.fn().mockResolvedValue(undefined);
    const ctx = makeCtx(finalizeStopSignal);
    const prepared = makePrepared();

    await handleStopSignal(ctx, "done", prepared);

    expect(finalizeStopSignal).toHaveBeenCalledWith("done", prepared, null);
  });

  it("fails fast when stop-signal finalization is missing", async () => {
    await expect(handleStopSignal(makeCtx(), "done", makePrepared())).rejects.toThrow(
      "OutcomeContext.finalizeStopSignal is required",
    );
  });
});
