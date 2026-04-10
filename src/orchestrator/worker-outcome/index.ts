import type { Issue, RunOutcome, Workspace } from "../../core/types.js";
import type { RunningEntry } from "../runtime-types.js";
import type { OutcomeContext } from "../context.js";
import { isActiveState, isTerminalState } from "../../state/policy.js";
import { isHardFailure } from "../views.js";
import { detectStopSignal } from "../../core/signal-detection.js";
import { prepareWorkerOutcome } from "./prepare.js";
import type { PreparedWorkerOutcome } from "./types.js";
import {
  handleServiceStopped,
  handleTerminalCleanup,
  handleInactiveIssue,
  handleOperatorAbort,
  handleCancelledOrHardFailure,
} from "./terminal-paths.js";
import { handleStopSignal } from "./stop-signal.js";

export async function handleWorkerOutcome(
  ctx: OutcomeContext,
  outcome: RunOutcome,
  entry: RunningEntry,
  issue: Issue,
  workspace: Workspace,
  attempt: number | null,
): Promise<void> {
  const prepared = await prepareWorkerOutcome(ctx, { outcome, entry, issue, workspace, attempt });

  if (!ctx.isRunning()) {
    handleServiceStopped(ctx, prepared);
    return;
  }

  const { latestIssue } = prepared;

  if (entry.cleanupOnExit || isTerminalState(latestIssue.state, ctx.getConfig())) {
    await handleTerminalCleanup(ctx, prepared);
    return;
  }
  if (!isActiveState(latestIssue.state, ctx.getConfig())) {
    handleInactiveIssue(ctx, prepared);
    return;
  }
  if (outcome.errorCode === "model_override_updated") {
    await ctx.retryCoordinator.dispatch(ctx, prepared);
    return;
  }
  if (outcome.errorCode === "operator_abort") {
    handleOperatorAbort(ctx, prepared);
    return;
  }
  if (outcome.kind === "cancelled" || isHardFailure(outcome.errorCode)) {
    await handleCancelledOrHardFailure(ctx, prepared);
    return;
  }

  await dispatchPostReconciliation(ctx, prepared);
}

async function dispatchPostReconciliation(ctx: OutcomeContext, prepared: PreparedWorkerOutcome): Promise<void> {
  const { outcome, entry, latestIssue } = prepared;
  // Always check for stop signal, even on timeout/error — the agent may have
  // written RISOLUTO_STATUS: DONE before the turn timer expired.
  // Prefer the pre-truncation signal extracted from raw content by the
  // notification handler; fall back to content-based detection for safety.
  const stopSignal = entry.lastStopSignal ?? detectStopSignal(entry.lastAgentMessageContent);
  ctx.deps.logger.info(
    {
      issue_identifier: latestIssue.identifier,
      outcome_kind: outcome.kind,
      has_lastAgentMsg: entry.lastAgentMessageContent !== null,
      lastAgentMsgTail: entry.lastAgentMessageContent?.slice(-80) ?? null,
      stopSignal,
      stopSignalSource: entry.lastStopSignal ? "raw" : "content",
    },
    "post-reconciliation stop-signal check",
  );
  if (stopSignal) {
    await handleStopSignal(ctx, stopSignal, prepared, outcome.turnCount ?? null);
    return;
  }
  await ctx.retryCoordinator.dispatch(ctx, prepared);
}
