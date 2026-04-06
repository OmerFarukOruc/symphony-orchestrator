import type { OutcomeContext } from "../context.js";
import type { RunOutcome, Issue } from "../../core/types.js";
import type { RunningEntry } from "../runtime-types.js";
import type { PreparedWorkerOutcome } from "./types.js";
import { buildOutcomeView } from "../outcome-view-builder.js";
import { nowIso } from "../views.js";
import { issueRef } from "./types.js";
import { writeFailureWriteback } from "./completion-writeback.js";

function queueRetryWithLog(
  ctx: OutcomeContext,
  issue: Issue,
  attempt: number | null,
  delayMs: number,
  reason: string,
  metadata?: { threadId?: string | null },
): void {
  const nextAttempt = (attempt ?? 0) + 1;
  ctx.queueRetry(issue, nextAttempt, delayMs, reason, metadata);
  ctx.deps.logger.info(
    { issue_id: issue.id, issue_identifier: issue.identifier, attempt: nextAttempt, delay_ms: delayMs, reason },
    "worker retry queued",
  );
}

export function handleContinuationRetry(ctx: OutcomeContext, prepared: PreparedWorkerOutcome): void {
  const { entry, attempt } = prepared;
  const issue = prepared.latestIssue;
  queueRetryWithLog(ctx, issue, attempt, 1000, "continuation", { threadId: entry.sessionId });
}

export async function handleContinuationExhausted(ctx: OutcomeContext, prepared: PreparedWorkerOutcome): Promise<void> {
  const { entry, workspace, attempt } = prepared;
  const issue = prepared.latestIssue;
  const { modelSelection } = prepared;
  const maxContinuations = ctx.getConfig().agent.maxContinuationAttempts;
  const message = `agent did not emit RISOLUTO_STATUS after ${maxContinuations} continuations`;
  ctx.notify({
    type: "worker_failed",
    severity: "critical",
    timestamp: nowIso(),
    message,
    issue: issueRef(issue),
    attempt,
  });
  ctx.completedViews.set(
    issue.identifier,
    buildOutcomeView(issue, workspace, entry, modelSelection, {
      status: "failed",
      attempt,
      error: "max_continuations_exceeded",
      message,
    }),
  );
  ctx.deps.eventBus?.emit("issue.completed", {
    issueId: issue.id,
    identifier: issue.identifier,
    outcome: "failed",
  });
  ctx.releaseIssueClaim(issue.id);
  await ctx.deps.attemptStore.updateAttempt(entry.runId, {
    status: "failed",
    errorCode: "max_continuations_exceeded",
    errorMessage: message,
  });

  await writeFailureWriteback(ctx, {
    issue,
    entry,
    attemptCount: attempt,
    errorReason: message,
  });
}

export function handleErrorRetry(
  ctx: OutcomeContext,
  outcome: RunOutcome,
  prepared: PreparedWorkerOutcome,
  entry?: RunningEntry,
): void {
  const { attempt } = prepared;
  const issue = prepared.latestIssue;
  const nextAttempt = (attempt ?? 0) + 1;
  const delayMs = Math.min(10_000 * 2 ** Math.max(0, nextAttempt - 1), ctx.getConfig().agent.maxRetryBackoffMs);
  queueRetryWithLog(ctx, issue, attempt, delayMs, outcome.errorCode ?? "turn_failed", {
    threadId: entry?.sessionId ?? outcome.threadId,
  });
}

export function handleModelOverrideRetry(ctx: OutcomeContext, prepared: PreparedWorkerOutcome): void {
  const issue = prepared.latestIssue;
  const { attempt } = prepared;
  ctx.queueRetry(issue, attempt ?? 1, 0, "model_override_updated");
}

export function queueRetryWithDelay(
  ctx: OutcomeContext,
  prepared: PreparedWorkerOutcome,
  delayMs: number,
  reason: string,
): void {
  queueRetryWithLog(ctx, prepared.latestIssue, prepared.attempt, delayMs, reason);
}
