import type { Issue, ModelSelection, RunOutcome, Workspace } from "../../core/types.js";
import type { RunningEntry } from "../runtime-types.js";
import type { OutcomeContext } from "../context.js";
import { isActiveState, isTerminalState } from "../../state/policy.js";
import { isHardFailure } from "../views.js";
import { detectStopSignal } from "../../core/signal-detection.js";
import { prepareWorkerOutcome } from "./prepare.js";
import {
  handleServiceStopped,
  handleTerminalCleanup,
  handleInactiveIssue,
  handleOperatorAbort,
  handleCancelledOrHardFailure,
} from "./terminal-paths.js";
import {
  handleContinuationRetry,
  handleContinuationExhausted,
  handleErrorRetry,
  handleModelOverrideRetry,
  queueRetryWithDelay,
} from "./retry-paths.js";
import { classifyRetryStrategy } from "../../agent-runner/error-classifier.js";
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
    handleServiceStopped(ctx, outcome, entry, prepared.latestIssue, workspace, prepared.modelSelection, attempt);
    return;
  }

  const { latestIssue, modelSelection } = prepared;

  if (entry.cleanupOnExit || isTerminalState(latestIssue.state, ctx.getConfig())) {
    await handleTerminalCleanup(ctx, outcome, entry, latestIssue, workspace, modelSelection, attempt);
    return;
  }
  if (!isActiveState(latestIssue.state, ctx.getConfig())) {
    handleInactiveIssue(ctx, outcome, entry, latestIssue, workspace, modelSelection, attempt);
    return;
  }
  if (outcome.errorCode === "model_override_updated") {
    handleModelOverrideRetry(ctx, latestIssue, attempt);
    return;
  }
  if (outcome.errorCode === "operator_abort") {
    handleOperatorAbort(ctx, outcome, entry, latestIssue, workspace, modelSelection, attempt);
    return;
  }
  if (outcome.kind === "cancelled" || isHardFailure(outcome.errorCode)) {
    handleCancelledOrHardFailure(ctx, outcome, entry, latestIssue, workspace, modelSelection, attempt);
    return;
  }

  await dispatchPostReconciliation(ctx, outcome, entry, latestIssue, workspace, modelSelection, attempt);
}

async function dispatchPostReconciliation(
  ctx: OutcomeContext,
  outcome: RunOutcome,
  entry: RunningEntry,
  latestIssue: Issue,
  workspace: Workspace,
  modelSelection: ModelSelection,
  attempt: number | null,
): Promise<void> {
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
    await handleStopSignal(ctx, stopSignal, entry, latestIssue, workspace, modelSelection, attempt);
    return;
  }

  if (outcome.kind === "normal") {
    const maxContinuations = ctx.getConfig().agent.maxContinuationAttempts;
    const nextAttempt = (attempt ?? 0) + 1;
    if (nextAttempt > maxContinuations) {
      await handleContinuationExhausted(ctx, entry, latestIssue, workspace, modelSelection, attempt);
      return;
    }
    handleContinuationRetry(ctx, entry, latestIssue, workspace, modelSelection, attempt);
    return;
  }

  const strategy = classifyRetryStrategy(outcome.codexErrorInfo ?? null, outcome.errorCode);
  switch (strategy.action) {
    case "hard_fail":
      handleCancelledOrHardFailure(ctx, outcome, entry, latestIssue, workspace, modelSelection, attempt);
      return;
    case "retry":
      queueRetryWithDelay(ctx, latestIssue, attempt, strategy.delayMs, strategy.reason);
      return;
    case "compact_and_retry":
    case "default":
      handleErrorRetry(ctx, outcome, latestIssue, attempt, entry);
      return;
  }
}
