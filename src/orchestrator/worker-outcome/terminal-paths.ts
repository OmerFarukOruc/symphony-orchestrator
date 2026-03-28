import type { OutcomeContext } from "../context.js";
import type { RunOutcome, Workspace, Issue, ModelSelection } from "../../core/types.js";
import type { RunningEntry } from "../runtime-types.js";
import { buildOutcomeView } from "../outcome-view-builder.js";
import { nowIso } from "../views.js";
import { issueRef, outcomeToStatus } from "./types.js";
import { toErrorString } from "../../utils/type-guards.js";

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
  await ctx.deps.workspaceManager.removeWorkspace(issue.identifier, issue).catch((error) => {
    ctx.deps.logger.info(
      { issue_identifier: issue.identifier, error: toErrorString(error) },
      "workspace cleanup failed (non-fatal)",
    );
  });
  ctx.completedViews.set(
    issue.identifier,
    buildOutcomeView(issue, workspace, entry, modelSelection, {
      status: outcomeToStatus(outcome.kind),
      attempt,
      error: outcome.errorMessage ?? outcome.errorCode,
      message: "workspace cleaned after terminal state",
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

export function handleCancelledOrHardFailure(
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
    message: outcome.errorMessage ?? "worker stopped without a retry",
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
      message: outcome.errorMessage ?? "worker stopped without a retry",
    }),
  );
  ctx.deps.eventBus?.emit("issue.completed", {
    issueId: issue.id,
    identifier: issue.identifier,
    outcome: outcome.kind === "cancelled" ? "cancelled" : "failed",
  });
  ctx.releaseIssueClaim(issue.id);
}
