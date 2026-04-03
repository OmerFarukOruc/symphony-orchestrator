import type { OutcomeContext } from "../context.js";
import type { RunOutcome, Workspace, Issue, ModelSelection } from "../../core/types.js";
import type { RunningEntry } from "../runtime-types.js";
import { buildOutcomeView } from "../outcome-view-builder.js";
import { nowIso } from "../views.js";
import { issueRef, outcomeToStatus } from "./types.js";
import { toErrorString } from "../../utils/type-guards.js";
import { writeFailureWriteback } from "./completion-writeback.js";

export function handleServiceStopped(
  ctx: OutcomeContext,
  outcome: RunOutcome,
  entry: RunningEntry,
  issue: Issue,
  workspace: Workspace,
  modelSelection: ModelSelection,
  attempt: number | null,
): void {
  ctx.notify({
    type: "worker_failed",
    severity: "critical",
    timestamp: nowIso(),
    message: outcome.errorMessage ?? "service stopped before the worker completed",
    issue: issueRef(issue),
    attempt,
  });
  ctx.releaseIssueClaim(issue.id);
  ctx.completedViews.set(
    issue.identifier,
    buildOutcomeView(issue, workspace, entry, modelSelection, {
      status: "cancelled",
      attempt,
      error: outcome.errorMessage,
      message: outcome.errorMessage ?? "service stopped before the worker completed",
    }),
  );
  ctx.deps.eventBus?.emit("issue.completed", {
    issueId: issue.id,
    identifier: issue.identifier,
    outcome: "cancelled",
  });
}

export async function handleTerminalCleanup(
  ctx: OutcomeContext,
  outcome: RunOutcome,
  entry: RunningEntry,
  issue: Issue,
  workspace: Workspace,
  modelSelection: ModelSelection,
  attempt: number | null,
): Promise<void> {
  const removalResult = ctx.deps.workspaceManager.removeWorkspaceWithResult
    ? await ctx.deps.workspaceManager.removeWorkspaceWithResult(issue.identifier, issue).catch((error) => {
        ctx.deps.logger.info(
          { issue_identifier: issue.identifier, error: toErrorString(error) },
          "workspace cleanup failed (non-fatal)",
        );
        return null;
      })
    : (await ctx.deps.workspaceManager.removeWorkspace(issue.identifier, issue).catch((error) => {
        ctx.deps.logger.info(
          { issue_identifier: issue.identifier, error: toErrorString(error) },
          "workspace cleanup failed (non-fatal)",
        );
      }),
      null);

  if (removalResult?.autoCommitSha && ctx.deps.attemptStore.appendEvent && ctx.deps.attemptStore.appendCheckpoint) {
    const createdAt = nowIso();
    await ctx.deps.attemptStore.appendEvent({
      attemptId: entry.runId,
      at: createdAt,
      issueId: issue.id,
      issueIdentifier: issue.identifier,
      sessionId: entry.sessionId,
      event: "workspace_auto_committed",
      message: "Uncommitted workspace changes were auto-committed before cleanup",
      metadata: {
        commitSha: removalResult.autoCommitSha,
      },
    });
    await ctx.deps.attemptStore.appendCheckpoint({
      attemptId: entry.runId,
      trigger: "status_transition",
      eventCursor: null,
      status: outcomeToStatus(outcome.kind) as import("../../core/types.js").AttemptRecord["status"],
      threadId: entry.sessionId,
      turnId: outcome.turnId,
      turnCount: outcome.turnCount,
      tokenUsage: entry.tokenUsage,
      metadata: {
        autoCommitSha: removalResult.autoCommitSha,
      },
      createdAt,
    });
  }
  ctx.completedViews.set(
    issue.identifier,
    buildOutcomeView(issue, workspace, entry, modelSelection, {
      status: outcomeToStatus(outcome.kind),
      attempt,
      error: outcome.errorMessage ?? outcome.errorCode,
      message: removalResult?.preserved
        ? "workspace preserved after cleanup protection triggered"
        : "workspace cleaned after terminal state",
    }),
  );
  ctx.deps.eventBus?.emit("issue.completed", {
    issueId: issue.id,
    identifier: issue.identifier,
    outcome: outcomeToStatus(outcome.kind),
  });
  ctx.releaseIssueClaim(issue.id);
}

export function handleInactiveIssue(
  ctx: OutcomeContext,
  _outcome: RunOutcome,
  entry: RunningEntry,
  issue: Issue,
  workspace: Workspace,
  modelSelection: ModelSelection,
  _attempt: number | null,
): void {
  ctx.completedViews.set(
    issue.identifier,
    buildOutcomeView(issue, workspace, entry, modelSelection, {
      status: "paused",
      message: "issue is no longer active",
    }),
  );
  ctx.deps.eventBus?.emit("issue.completed", {
    issueId: issue.id,
    identifier: issue.identifier,
    outcome: "paused",
  });
  ctx.releaseIssueClaim(issue.id);
}

export function handleOperatorAbort(
  ctx: OutcomeContext,
  outcome: RunOutcome,
  entry: RunningEntry,
  issue: Issue,
  workspace: Workspace,
  modelSelection: ModelSelection,
  attempt: number | null,
): void {
  ctx.notify({
    type: "worker_failed",
    severity: "info",
    timestamp: nowIso(),
    message: outcome.errorMessage ?? "worker cancelled by operator request",
    issue: issueRef(issue),
    attempt,
    metadata: { errorCode: outcome.errorCode },
  });
  ctx.completedViews.set(
    issue.identifier,
    buildOutcomeView(issue, workspace, entry, modelSelection, {
      status: "cancelled",
      attempt,
      error: outcome.errorCode,
      message: outcome.errorMessage ?? "worker cancelled by operator request",
    }),
  );
  ctx.deps.eventBus?.emit("issue.completed", {
    issueId: issue.id,
    identifier: issue.identifier,
    outcome: "cancelled",
  });
  ctx.suppressIssueDispatch?.(issue);
  ctx.releaseIssueClaim(issue.id);
}

export async function handleCancelledOrHardFailure(
  ctx: OutcomeContext,
  outcome: RunOutcome,
  entry: RunningEntry,
  issue: Issue,
  workspace: Workspace,
  modelSelection: ModelSelection,
  attempt: number | null,
): Promise<void> {
  const errorReason = outcome.errorMessage ?? outcome.errorCode ?? "worker stopped without a retry";
  ctx.notify({
    type: "worker_failed",
    severity: "critical",
    timestamp: nowIso(),
    message: errorReason,
    issue: issueRef(issue),
    attempt,
    metadata: { errorCode: outcome.errorCode },
  });
  ctx.completedViews.set(
    issue.identifier,
    buildOutcomeView(issue, workspace, entry, modelSelection, {
      status: outcome.kind === "cancelled" ? "cancelled" : "failed",
      attempt,
      error: outcome.errorCode,
      message: errorReason,
    }),
  );
  ctx.deps.eventBus?.emit("issue.completed", {
    issueId: issue.id,
    identifier: issue.identifier,
    outcome: outcome.kind === "cancelled" ? "cancelled" : "failed",
  });
  ctx.releaseIssueClaim(issue.id);

  await writeFailureWriteback(ctx, {
    issue,
    entry,
    attemptCount: attempt,
    errorReason,
  });
}
