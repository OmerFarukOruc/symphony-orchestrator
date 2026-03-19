import type { GitManager } from "../git/manager.js";
import type { NotificationEvent } from "../notification/channel.js";
import type { RunOutcome, ServiceConfig, Workspace, Issue, ModelSelection } from "../core/types.js";
import { isActiveState, isTerminalState } from "../state/policy.js";
import { isHardFailure, issueView, nowIso } from "./views.js";
import type { RunningEntry } from "./runtime-types.js";
import { buildOutcomeView } from "./outcome-view-builder.js";
import { executeGitPostRun } from "./git-post-run.js";
import { detectStopSignal, type StopSignal } from "../agent-runner/signal-detection.js";

/** Shared context type for all outcome handlers. */
interface OutcomeContext {
  runningEntries: Map<string, RunningEntry>;
  completedViews: Map<string, ReturnType<typeof issueView>>;
  detailViews: Map<string, ReturnType<typeof issueView>>;
  deps: {
    linearClient: { fetchIssueStatesByIds: (ids: string[]) => Promise<Issue[]> };
    attemptStore: { updateAttempt: (attemptId: string, patch: Record<string, unknown>) => Promise<void> };
    workspaceManager: { removeWorkspace: (identifier: string) => Promise<void> };
    gitManager?: Pick<GitManager, "commitAndPush" | "createPullRequest">;
    logger: { info: (meta: Record<string, unknown>, message: string) => void };
  };
  isRunning: () => boolean;
  getConfig: () => ServiceConfig;
  releaseIssueClaim: (issueId: string) => void;
  resolveModelSelection: (identifier: string) => ModelSelection;
  notify: (event: NotificationEvent) => void;
  queueRetry: (issue: Issue, attempt: number, delayMs: number, error: string | null) => void;
}

function outcomeToStatus(kind: RunOutcome["kind"]): string {
  const statusMap: Record<RunOutcome["kind"], string> = {
    normal: "completed",
    timed_out: "timed_out",
    stalled: "stalled",
    cancelled: "cancelled",
    failed: "failed",
  };
  return statusMap[kind];
}

function issueRef(issue: Issue) {
  return { id: issue.id, identifier: issue.identifier, title: issue.title, state: issue.state, url: issue.url };
}

function handleServiceStopped(
  ctx: OutcomeContext,
  outcome: RunOutcome,
  entry: RunningEntry,
  issue: Issue,
  workspace: Workspace,
  sel: ModelSelection,
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
    buildOutcomeView(issue, workspace, entry, sel, {
      status: "cancelled",
      attempt,
      error: outcome.errorMessage,
      message: outcome.errorMessage ?? "service stopped before the worker completed",
    }),
  );
}

async function handleTerminalOrCleanup(
  ctx: OutcomeContext,
  outcome: RunOutcome,
  entry: RunningEntry,
  issue: Issue,
  workspace: Workspace,
  sel: ModelSelection,
  attempt: number | null,
): Promise<void> {
  await ctx.deps.workspaceManager.removeWorkspace(issue.identifier).catch(() => undefined);
  ctx.completedViews.set(
    issue.identifier,
    buildOutcomeView(issue, workspace, entry, sel, {
      status: outcomeToStatus(outcome.kind),
      attempt,
      error: outcome.errorMessage ?? outcome.errorCode,
      message: "workspace cleaned after terminal state",
    }),
  );
  ctx.releaseIssueClaim(issue.id);
}

function handleCancelledOrHardFailure(
  ctx: OutcomeContext,
  outcome: RunOutcome,
  entry: RunningEntry,
  issue: Issue,
  workspace: Workspace,
  sel: ModelSelection,
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
    buildOutcomeView(issue, workspace, entry, sel, {
      status: outcome.kind === "cancelled" ? "cancelled" : "failed",
      attempt,
      error: outcome.errorCode,
      message: outcome.errorMessage ?? "worker stopped without a retry",
    }),
  );
  ctx.releaseIssueClaim(issue.id);
}

async function handleStopSignal(
  ctx: OutcomeContext,
  stopSignal: StopSignal,
  entry: RunningEntry,
  issue: Issue,
  workspace: Workspace,
  sel: ModelSelection,
  attempt: number | null,
): Promise<void> {
  let pullRequestUrl: string | null = null;
  const status = stopSignal === "blocked" ? "paused" : "completed";
  if (stopSignal === "done" && entry.repoMatch && ctx.deps.gitManager) {
    try {
      const result = await executeGitPostRun(ctx.deps.gitManager, workspace, issue, entry.repoMatch);
      pullRequestUrl = result.pullRequestUrl;
    } catch (error) {
      const errorText = error instanceof Error ? error.message : String(error);
      ctx.deps.logger.info(
        { issue_identifier: issue.identifier, error: errorText },
        "git post-run failed after DONE — completing issue anyway",
      );
    }
  }

  await ctx.deps.attemptStore.updateAttempt(entry.runId, { stopSignal, pullRequestUrl, status }).catch(() => undefined);

  if (pullRequestUrl) {
    ctx.deps.logger.info({ issue_identifier: issue.identifier, url: pullRequestUrl }, "pull request created");
  }

  const isBlocked = stopSignal === "blocked";
  ctx.completedViews.set(
    issue.identifier,
    buildOutcomeView(issue, workspace, entry, sel, {
      status,
      attempt,
      message: isBlocked ? "worker reported issue blocked" : "worker reported issue complete",
    }),
  );
  ctx.notify({
    type: isBlocked ? "worker_failed" : "worker_completed",
    severity: isBlocked ? "critical" : "info",
    timestamp: nowIso(),
    message: isBlocked ? "worker reported issue blocked" : "worker reported issue complete",
    issue: issueRef(issue),
    attempt,
    metadata: { workspace: workspace.path, pullRequestUrl },
  });
  // DONE keeps the claim sticky until terminal; BLOCKED releases it for a later retry.
  if (isBlocked) {
    ctx.releaseIssueClaim(issue.id);
  }
}

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
    {
      issue_id: issue.id,
      issue_identifier: issue.identifier,
      attempt: nextAttempt,
      delay_ms: delayMs,
      reason,
    },
    "worker retry queued",
  );
}

async function handlePostReconciliation(
  ctx: OutcomeContext,
  outcome: RunOutcome,
  entry: RunningEntry,
  latestIssue: Issue,
  workspace: Workspace,
  sel: ReturnType<typeof ctx.resolveModelSelection>,
  attempt: number | null,
): Promise<void> {
  if (entry.cleanupOnExit || isTerminalState(latestIssue.state, ctx.getConfig())) {
    await handleTerminalOrCleanup(ctx, outcome, entry, latestIssue, workspace, sel, attempt);
    return;
  }
  if (!isActiveState(latestIssue.state, ctx.getConfig())) {
    ctx.completedViews.set(
      latestIssue.identifier,
      buildOutcomeView(latestIssue, workspace, entry, sel, { status: "paused", message: "issue is no longer active" }),
    );
    ctx.releaseIssueClaim(latestIssue.id);
    return;
  }
  if (outcome.errorCode === "model_override_updated") {
    ctx.queueRetry(latestIssue, attempt ?? 1, 0, "model_override_updated");
    return;
  }
  if (outcome.kind === "cancelled" || isHardFailure(outcome.errorCode)) {
    handleCancelledOrHardFailure(ctx, outcome, entry, latestIssue, workspace, sel, attempt);
    return;
  }

  const stopSignal = outcome.kind === "normal" ? detectStopSignal(entry.lastAgentMessageContent) : null;
  ctx.deps.logger.info(
    {
      issue_identifier: latestIssue.identifier,
      outcome_kind: outcome.kind,
      has_lastAgentMsg: entry.lastAgentMessageContent !== null,
      lastAgentMsgTail: entry.lastAgentMessageContent?.slice(-80) ?? null,
      stopSignal,
    },
    "post-reconciliation stop-signal check",
  );
  if (stopSignal) {
    await handleStopSignal(ctx, stopSignal, entry, latestIssue, workspace, sel, attempt);
    return;
  }

  if (outcome.kind === "normal") {
    queueRetryWithLog(ctx, latestIssue, attempt, 1000, "continuation");
    return;
  }

  const nextAttempt = (attempt ?? 0) + 1;
  const delayMs = Math.min(10_000 * 2 ** Math.max(0, nextAttempt - 1), ctx.getConfig().agent.maxRetryBackoffMs);
  queueRetryWithLog(ctx, latestIssue, attempt, delayMs, outcome.errorCode ?? "turn_failed");
}

export async function handleWorkerOutcome(
  ctx: OutcomeContext,
  outcome: RunOutcome,
  entry: RunningEntry,
  issue: Issue,
  workspace: Workspace,
  attempt: number | null,
): Promise<void> {
  await entry.flushPersistence();
  ctx.runningEntries.delete(issue.id);
  const latestIssue = (await ctx.deps.linearClient.fetchIssueStatesByIds([issue.id]).catch(() => [issue]))[0] ?? issue;

  await ctx.deps.attemptStore.updateAttempt(entry.runId, {
    issueId: latestIssue.id,
    issueIdentifier: latestIssue.identifier,
    title: latestIssue.title,
    status: outcomeToStatus(outcome.kind),
    endedAt: nowIso(),
    threadId: outcome.threadId ?? entry.sessionId,
    turnId: outcome.turnId,
    turnCount: outcome.turnCount,
    errorCode: outcome.errorCode,
    errorMessage: outcome.errorMessage,
    tokenUsage: entry.tokenUsage,
  });

  const sel = ctx.resolveModelSelection(latestIssue.identifier);
  ctx.detailViews.set(
    latestIssue.identifier,
    buildOutcomeView(latestIssue, workspace, entry, sel, {
      status: outcome.kind,
      attempt,
      error: outcome.errorMessage,
      message: outcome.errorMessage,
    }),
  );

  if (!ctx.isRunning()) {
    handleServiceStopped(ctx, outcome, entry, latestIssue, workspace, sel, attempt);
    return;
  }

  await handlePostReconciliation(ctx, outcome, entry, latestIssue, workspace, sel, attempt);
}

export function handleWorkerFailure(
  ctx: {
    runningEntries: Map<string, RunningEntry>;
    releaseIssueClaim: (issueId: string) => void;
    pushEvent: (event: {
      at: string;
      issueId: string;
      issueIdentifier: string;
      sessionId: string | null;
      event: string;
      message: string;
    }) => void;
    deps: {
      attemptStore: { updateAttempt: (attemptId: string, patch: Record<string, unknown>) => Promise<void> };
    };
  },
  issue: Issue,
  entry: RunningEntry,
  error: unknown,
): Promise<void> {
  return entry
    .flushPersistence()
    .catch(() => undefined)
    .then(async () => {
      ctx.runningEntries.delete(issue.id);
      ctx.releaseIssueClaim(issue.id);
      ctx.pushEvent({
        at: nowIso(),
        issueId: issue.id,
        issueIdentifier: issue.identifier,
        sessionId: entry.sessionId,
        event: "worker_failed",
        message: String(error),
      });
      await ctx.deps.attemptStore
        .updateAttempt(entry.runId, {
          status: "failed",
          endedAt: nowIso(),
          errorCode: "worker_failed",
          errorMessage: String(error),
          tokenUsage: entry.tokenUsage,
          threadId: null,
        })
        .catch(() => undefined);
    });
}
