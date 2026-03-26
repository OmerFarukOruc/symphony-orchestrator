import type { OutcomeContext } from "../context.js";
import type { RunOutcome, Issue, Workspace, ModelSelection } from "../../core/types.js";
import type { RunningEntry } from "../runtime-types.js";
import { buildOutcomeView } from "../outcome-view-builder.js";
import { nowIso } from "../views.js";
import { issueRef } from "./types.js";

function queueRetryWithLog(
  ctx: OutcomeContext,
  issue: Issue,
  attempt: number | null,
  delayMs: number,
  reason: string,
): void {
  const nextAttempt = (attempt ?? 0) + 1;
  ctx.queueRetry(issue, nextAttempt, delayMs, reason);
  ctx.deps.logger.info(
    { issue_id: issue.id, issue_identifier: issue.identifier, attempt: nextAttempt, delay_ms: delayMs, reason },
    "worker retry queued",
  );
}

export function handleContinuationRetry(
  ctx: OutcomeContext,
  _entry: RunningEntry,
  latestIssue: Issue,
  _workspace: Workspace,
  _modelSelection: ModelSelection,
  attempt: number | null,
): void {
  queueRetryWithLog(ctx, latestIssue, attempt, 1000, "continuation");
}

export async function handleContinuationExhausted(
  ctx: OutcomeContext,
  entry: RunningEntry,
  latestIssue: Issue,
  workspace: Workspace,
  modelSelection: ModelSelection,
  attempt: number | null,
): Promise<void> {
  const maxContinuations = ctx.getConfig().agent.maxContinuationAttempts;
  const message = `agent did not emit SYMPHONY_STATUS after ${maxContinuations} continuations`;
  ctx.notify({
    type: "worker_failed",
    severity: "critical",
    timestamp: nowIso(),
    message,
    issue: issueRef(latestIssue),
    attempt,
  });
  ctx.completedViews.set(
    latestIssue.identifier,
    buildOutcomeView(latestIssue, workspace, entry, modelSelection, {
      status: "failed",
      attempt,
      error: "max_continuations_exceeded",
      message,
    }),
  );
  ctx.releaseIssueClaim(latestIssue.id);
  await ctx.deps.attemptStore.updateAttempt(entry.runId, {
    status: "failed",
    errorCode: "max_continuations_exceeded",
    errorMessage: message,
  });
}

export function handleErrorRetry(
  ctx: OutcomeContext,
  outcome: RunOutcome,
  latestIssue: Issue,
  attempt: number | null,
): void {
  const nextAttempt = (attempt ?? 0) + 1;
  const delayMs = Math.min(10_000 * 2 ** Math.max(0, nextAttempt - 1), ctx.getConfig().agent.maxRetryBackoffMs);
  queueRetryWithLog(ctx, latestIssue, attempt, delayMs, outcome.errorCode ?? "turn_failed");
}

export function handleModelOverrideRetry(ctx: OutcomeContext, latestIssue: Issue, attempt: number | null): void {
  ctx.queueRetry(latestIssue, attempt ?? 1, 0, "model_override_updated");
}
