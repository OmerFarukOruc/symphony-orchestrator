import type { GitManager } from "../git/manager.js";
import type { NotificationEvent } from "../notification/channel.js";
import type { RunOutcome, ServiceConfig, Workspace, Issue, ModelSelection } from "../core/types.js";
import { isActiveState, isTerminalState } from "../state/policy.js";
import { isHardFailure, issueView, nowIso } from "./views.js";
import type { RunningEntry } from "./runtime-types.js";
import { buildOutcomeView } from "./outcome-view-builder.js";
import { executeGitPostRun } from "./git-post-run.js";
import { detectStopSignal, type StopSignal } from "../core/signal-detection.js";

/** Shared context type for all outcome handlers. */
interface OutcomeContext {
  runningEntries: Map<string, RunningEntry>;
  completedViews: Map<string, ReturnType<typeof issueView>>;
  detailViews: Map<string, ReturnType<typeof issueView>>;
  deps: {
    linearClient: {
      fetchIssueStatesByIds: (ids: string[]) => Promise<Issue[]>;
      resolveStateId: (stateName: string) => Promise<string | null>;
      updateIssueState: (issueId: string, stateId: string) => Promise<void>;
      createComment: (issueId: string, body: string) => Promise<void>;
    };
    attemptStore: { updateAttempt: (attemptId: string, patch: Record<string, unknown>) => Promise<void> };
    workspaceManager: { removeWorkspace: (identifier: string) => Promise<void> };
    gitManager?: Pick<GitManager, "commitAndPush" | "createPullRequest">;
    logger: {
      info: (meta: Record<string, unknown>, message: string) => void;
      warn: (meta: Record<string, unknown>, message: string) => void;
    };
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
}

async function finalizeTerminalOrCleanupOutcome(
  ctx: OutcomeContext,
  outcome: RunOutcome,
  entry: RunningEntry,
  issue: Issue,
  workspace: Workspace,
  modelSelection: ModelSelection,
  attempt: number | null,
): Promise<void> {
  await ctx.deps.workspaceManager.removeWorkspace(issue.identifier).catch((error) => {
    ctx.deps.logger.info(
      { issue_identifier: issue.identifier, error: String(error) },
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
  ctx.releaseIssueClaim(issue.id);
}

function handleCancelledOrHardFailure(
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
  ctx.releaseIssueClaim(issue.id);
}

/**
 * Write completion status back to Linear.
 * Transitions the issue to successState (if configured) and posts a rich comment.
 * All errors are non-blocking — logged as warnings.
 */
async function writeLinearCompletion(
  ctx: OutcomeContext,
  issue: Issue,
  entry: RunningEntry,
  outcome: { pullRequestUrl: string | null; stopSignal: "done" | "blocked" },
  attempt: number | null,
): Promise<void> {
  try {
  const config = ctx.getConfig();
  const successState = config.agent.successState;

  const lines: string[] = ["**Symphony agent completed** ✓"];
  if (entry.tokenUsage) {
    lines.push(`- **Tokens:** ${entry.tokenUsage.totalTokens.toLocaleString()} (in: ${entry.tokenUsage.inputTokens.toLocaleString()}, out: ${entry.tokenUsage.outputTokens.toLocaleString()})`);
  }
  const durationSecs = Math.round((Date.now() - entry.startedAtMs) / 1000);
  lines.push(`- **Duration:** ${durationSecs}s`);
  if (attempt !== null) {
    lines.push(`- **Attempt:** ${attempt}`);
  }
  if (outcome.pullRequestUrl) {
    lines.push(`- **PR:** ${outcome.pullRequestUrl}`);
  }
  const commentBody = lines.join("\n");

  if (outcome.stopSignal === "done" && successState) {
    try {
      const stateId = await ctx.deps.linearClient.resolveStateId(successState);
      if (stateId) {
        await ctx.deps.linearClient.updateIssueState(issue.id, stateId);
        ctx.deps.logger.info(
          { issue_identifier: issue.identifier, successState },
          "linear issue transitioned to success state",
        );
      } else {
        ctx.deps.logger.warn(
          { issue_identifier: issue.identifier, successState },
          "success state not found in linear — skipping transition",
        );
      }
    } catch (error) {
      ctx.deps.logger.warn(
        { issue_identifier: issue.identifier, error: String(error) },
        "linear state transition failed (non-fatal)",
      );
    }
  }

  try {
    await ctx.deps.linearClient.createComment(issue.id, commentBody);
  } catch (error) {
    ctx.deps.logger.warn(
      { issue_identifier: issue.identifier, error: String(error) },
      "linear completion comment failed (non-fatal)",
    );
  }
  } catch (error) {
    ctx.deps.logger.warn(
      { issue_identifier: issue.identifier, error: String(error) },
      "writeLinearCompletion: unexpected error (non-fatal)",
    );
  }
}

async function handleStopSignal(
  ctx: OutcomeContext,
  stopSignal: StopSignal,
  entry: RunningEntry,
  issue: Issue,
  workspace: Workspace,
  modelSelection: ModelSelection,
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

  await ctx.deps.attemptStore.updateAttempt(entry.runId, { stopSignal, pullRequestUrl, status }).catch((error) => {
    ctx.deps.logger.info(
      { attempt_id: entry.runId, error: String(error) },
      "attempt update failed after stop signal (non-fatal)",
    );
  });

  if (pullRequestUrl) {
    ctx.deps.logger.info({ issue_identifier: issue.identifier, url: pullRequestUrl }, "pull request created");
  }

  const isBlocked = stopSignal === "blocked";
  ctx.completedViews.set(
    issue.identifier,
    buildOutcomeView(issue, workspace, entry, modelSelection, {
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

  // Write completion back to Linear (non-blocking).
  void writeLinearCompletion(ctx, issue, entry, { pullRequestUrl, stopSignal }, attempt);
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

async function handleNormalContinuation(
  ctx: OutcomeContext,
  entry: RunningEntry,
  latestIssue: Issue,
  workspace: Workspace,
  modelSelection: ModelSelection,
  attempt: number | null,
): Promise<void> {
  const maxContinuations = ctx.getConfig().agent.maxContinuationAttempts;
  const nextAttempt = (attempt ?? 0) + 1;
  if (nextAttempt > maxContinuations) {
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
    return;
  }
  queueRetryWithLog(ctx, latestIssue, attempt, 1000, "continuation");
}

function handleErrorRetry(ctx: OutcomeContext, outcome: RunOutcome, latestIssue: Issue, attempt: number | null): void {
  const nextAttempt = (attempt ?? 0) + 1;
  const delayMs = Math.min(10_000 * 2 ** Math.max(0, nextAttempt - 1), ctx.getConfig().agent.maxRetryBackoffMs);
  queueRetryWithLog(ctx, latestIssue, attempt, delayMs, outcome.errorCode ?? "turn_failed");
}

async function reconcileOutcomeAgainstLatestIssueState(
  ctx: OutcomeContext,
  outcome: RunOutcome,
  entry: RunningEntry,
  latestIssue: Issue,
  workspace: Workspace,
  modelSelection: ReturnType<typeof ctx.resolveModelSelection>,
  attempt: number | null,
): Promise<void> {
  if (entry.cleanupOnExit || isTerminalState(latestIssue.state, ctx.getConfig())) {
    await finalizeTerminalOrCleanupOutcome(ctx, outcome, entry, latestIssue, workspace, modelSelection, attempt);
    return;
  }
  if (!isActiveState(latestIssue.state, ctx.getConfig())) {
    ctx.completedViews.set(
      latestIssue.identifier,
      buildOutcomeView(latestIssue, workspace, entry, modelSelection, {
        status: "paused",
        message: "issue is no longer active",
      }),
    );
    ctx.releaseIssueClaim(latestIssue.id);
    return;
  }
  if (outcome.errorCode === "model_override_updated") {
    ctx.queueRetry(latestIssue, attempt ?? 1, 0, "model_override_updated");
    return;
  }
  if (outcome.kind === "cancelled" || isHardFailure(outcome.errorCode)) {
    handleCancelledOrHardFailure(ctx, outcome, entry, latestIssue, workspace, modelSelection, attempt);
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
    await handleStopSignal(ctx, stopSignal, entry, latestIssue, workspace, modelSelection, attempt);
    return;
  }

  if (outcome.kind === "normal") {
    await handleNormalContinuation(ctx, entry, latestIssue, workspace, modelSelection, attempt);
    return;
  }

  handleErrorRetry(ctx, outcome, latestIssue, attempt);
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

  const modelSelection = ctx.resolveModelSelection(latestIssue.identifier);
  ctx.detailViews.set(
    latestIssue.identifier,
    buildOutcomeView(latestIssue, workspace, entry, modelSelection, {
      status: outcome.kind,
      attempt,
      error: outcome.errorMessage,
      message: outcome.errorMessage,
    }),
  );

  if (!ctx.isRunning()) {
    handleServiceStopped(ctx, outcome, entry, latestIssue, workspace, modelSelection, attempt);
    return;
  }

  await reconcileOutcomeAgainstLatestIssueState(ctx, outcome, entry, latestIssue, workspace, modelSelection, attempt);
}
