import { describe, expect, it, vi } from "vitest";

import type { OutcomeContext } from "../../src/orchestrator/context.js";
import {
  handleCancelledOrHardFailure,
  handleInactiveIssue,
  handleOperatorAbort,
  handleServiceStopped,
  handleTerminalCleanup,
} from "../../src/orchestrator/worker-outcome/terminal-paths.js";
import type { PreparedWorkerOutcome, TerminalPathKind } from "../../src/orchestrator/worker-outcome/types.js";
import { createIssue, createModelSelection, createRunningEntry, createWorkspace } from "./issue-test-factories.js";

function makePrepared(): PreparedWorkerOutcome {
  const issue = createIssue();
  const workspace = createWorkspace();
  return {
    outcome: {
      kind: "failed",
      errorCode: "turn_failed",
      errorMessage: "boom",
      threadId: null,
      turnId: "turn-1",
      turnCount: 2,
    },
    entry: createRunningEntry({ issue, workspace }),
    issue,
    latestIssue: issue,
    workspace,
    attempt: 2,
    modelSelection: createModelSelection(),
  };
}

function makeCtx(finalizeTerminalPath?: OutcomeContext["finalizeTerminalPath"]): OutcomeContext {
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
    finalizeTerminalPath,
    notify: vi.fn(),
    retryCoordinator: {
      dispatch: vi.fn(),
      cancel: vi.fn(),
    },
  } as unknown as OutcomeContext;
}

describe("worker-outcome terminal-path adapters", () => {
  it.each([
    ["service_stopped", handleServiceStopped],
    ["inactive_issue", handleInactiveIssue],
    ["operator_abort", handleOperatorAbort],
  ] satisfies Array<[TerminalPathKind, (ctx: OutcomeContext, prepared: PreparedWorkerOutcome) => void]>)(
    "delegates %s through OutcomeContext.finalizeTerminalPath",
    (kind, handler) => {
      const finalizeTerminalPath = vi.fn();
      const ctx = makeCtx(finalizeTerminalPath);
      const prepared = makePrepared();

      handler(ctx, prepared);

      expect(finalizeTerminalPath).toHaveBeenCalledWith(kind, prepared);
    },
  );

  it.each([
    ["terminal_cleanup", handleTerminalCleanup],
    ["cancelled_or_hard_failure", handleCancelledOrHardFailure],
  ] satisfies Array<[TerminalPathKind, (ctx: OutcomeContext, prepared: PreparedWorkerOutcome) => Promise<void>]>)(
    "awaits %s through OutcomeContext.finalizeTerminalPath",
    async (kind, handler) => {
      const finalizeTerminalPath = vi.fn().mockResolvedValue(undefined);
      const ctx = makeCtx(finalizeTerminalPath);
      const prepared = makePrepared();

      await handler(ctx, prepared);

      expect(finalizeTerminalPath).toHaveBeenCalledWith(kind, prepared);
    },
  );

  it("fails fast when terminal finalization is missing", async () => {
    const prepared = makePrepared();

    expect(() => handleServiceStopped(makeCtx(), prepared)).toThrow("OutcomeContext.finalizeTerminalPath is required");
    await expect(handleTerminalCleanup(makeCtx(), prepared)).rejects.toThrow(
      "OutcomeContext.finalizeTerminalPath is required",
    );
  });
});
