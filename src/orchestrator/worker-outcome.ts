import type { GitManager } from "../git/manager.js";
import type { NotificationEvent } from "../notification/channel.js";
import type { RunOutcome, ServiceConfig, Workspace } from "../core/types.js";
import { isActiveState, isTerminalState } from "../state/policy.js";
import { isHardFailure, issueView, nowIso } from "./views.js";
import type { RunningEntry } from "./runtime-types.js";
import type { Issue, ModelSelection } from "../core/types.js";
import { buildOutcomeView } from "./outcome-view-builder.js";
import { executeGitPostRun } from "./git-post-run.js";

type StopSignal = "done" | "blocked";

function normalizeMessageForSignalDetection(content: string): string {
  return content.trim().toLowerCase().replace(/\s+/g, " ");
}

function detectStopSignal(content: string | null): StopSignal | null {
  if (!content) {
    return null;
  }

  const normalized = normalizeMessageForSignalDetection(content);
  if (normalized.includes("symphony_status: done") || normalized.includes("symphony status: done")) {
    return "done";
  }
  if (normalized.includes("symphony_status: blocked") || normalized.includes("symphony status: blocked")) {
    return "blocked";
  }
  return null;
}

function configuredSelection(
  ctx: { resolveModelSelection: (identifier: string) => ModelSelection },
  identifier: string,
) {
  return ctx.resolveModelSelection(identifier);
}

export async function handleWorkerOutcome(
  ctx: {
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
  },
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
    status:
      outcome.kind === "normal"
        ? "completed"
        : outcome.kind === "timed_out"
          ? "timed_out"
          : outcome.kind === "stalled"
            ? "stalled"
            : outcome.kind === "cancelled"
              ? "cancelled"
              : "failed",
    endedAt: nowIso(),
    threadId: outcome.threadId ?? entry.sessionId,
    turnId: outcome.turnId,
    turnCount: outcome.turnCount,
    errorCode: outcome.errorCode,
    errorMessage: outcome.errorMessage,
    tokenUsage: entry.tokenUsage,
  });
  const sel = configuredSelection(ctx, latestIssue.identifier);
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
    ctx.notify({
      type: "worker_failed",
      severity: "critical",
      timestamp: nowIso(),
      message: outcome.errorMessage ?? "service stopped before the worker completed",
      issue: {
        id: latestIssue.id,
        identifier: latestIssue.identifier,
        title: latestIssue.title,
        state: latestIssue.state,
        url: latestIssue.url,
      },
      attempt,
    });
    ctx.releaseIssueClaim(latestIssue.id);
    ctx.completedViews.set(
      latestIssue.identifier,
      buildOutcomeView(latestIssue, workspace, entry, sel, {
        status: "cancelled",
        attempt,
        error: outcome.errorMessage,
        message: outcome.errorMessage ?? "service stopped before the worker completed",
      }),
    );
    return;
  }

  if (entry.cleanupOnExit || isTerminalState(latestIssue.state, ctx.getConfig())) {
    const terminalStatus =
      outcome.kind === "normal"
        ? "completed"
        : outcome.kind === "timed_out"
          ? "timed_out"
          : outcome.kind === "stalled"
            ? "stalled"
            : outcome.kind === "cancelled"
              ? "cancelled"
              : "failed";
    await ctx.deps.workspaceManager.removeWorkspace(latestIssue.identifier).catch(() => undefined);
    ctx.completedViews.set(
      latestIssue.identifier,
      buildOutcomeView(latestIssue, workspace, entry, sel, {
        status: terminalStatus,
        attempt,
        error: outcome.errorMessage ?? outcome.errorCode,
        message: "workspace cleaned after terminal state",
      }),
    );
    ctx.releaseIssueClaim(latestIssue.id);
    return;
  }

  if (!isActiveState(latestIssue.state, ctx.getConfig())) {
    ctx.completedViews.set(
      latestIssue.identifier,
      buildOutcomeView(latestIssue, workspace, entry, sel, {
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
    ctx.notify({
      type: "worker_failed",
      severity: "critical",
      timestamp: nowIso(),
      message: outcome.errorMessage ?? "worker stopped without a retry",
      issue: {
        id: latestIssue.id,
        identifier: latestIssue.identifier,
        title: latestIssue.title,
        state: latestIssue.state,
        url: latestIssue.url,
      },
      attempt,
      metadata: {
        errorCode: outcome.errorCode,
      },
    });
    ctx.completedViews.set(
      latestIssue.identifier,
      buildOutcomeView(latestIssue, workspace, entry, sel, {
        status: outcome.kind === "cancelled" ? "cancelled" : "failed",
        attempt,
        error: outcome.errorCode,
        message: outcome.errorMessage ?? "worker stopped without a retry",
      }),
    );
    ctx.releaseIssueClaim(latestIssue.id);
    return;
  }

  const stopSignal = outcome.kind === "normal" ? detectStopSignal(entry.lastAgentMessageContent) : null;
  if (stopSignal) {
    let pullRequestUrl: string | null = null;
    if (stopSignal === "done" && entry.repoMatch && ctx.deps.gitManager) {
      try {
        const result = await executeGitPostRun(ctx.deps.gitManager, workspace, latestIssue, entry.repoMatch);
        pullRequestUrl = result.pullRequestUrl;
      } catch (error) {
        const errorText = error instanceof Error ? error.message : String(error);
        ctx.notify({
          type: "worker_failed",
          severity: "critical",
          timestamp: nowIso(),
          message: `git post-run failed: ${errorText}`,
          issue: {
            id: latestIssue.id,
            identifier: latestIssue.identifier,
            title: latestIssue.title,
            state: latestIssue.state,
            url: latestIssue.url,
          },
          attempt,
          metadata: {
            workspace: workspace.path,
          },
        });
        ctx.completedViews.set(
          latestIssue.identifier,
          buildOutcomeView(latestIssue, workspace, entry, sel, {
            status: "failed",
            attempt,
            error: errorText,
            message: `git post-run failed: ${errorText}`,
          }),
        );
        ctx.releaseIssueClaim(latestIssue.id);
        return;
      }
    }
    ctx.completedViews.set(
      latestIssue.identifier,
      buildOutcomeView(latestIssue, workspace, entry, sel, {
        status: stopSignal === "blocked" ? "paused" : "completed",
        attempt,
        message: stopSignal === "blocked" ? "worker reported issue blocked" : "worker reported issue complete",
      }),
    );
    ctx.notify({
      type: stopSignal === "blocked" ? "worker_failed" : "worker_completed",
      severity: stopSignal === "blocked" ? "critical" : "info",
      timestamp: nowIso(),
      message: stopSignal === "blocked" ? "worker reported issue blocked" : "worker reported issue complete",
      issue: {
        id: latestIssue.id,
        identifier: latestIssue.identifier,
        title: latestIssue.title,
        state: latestIssue.state,
        url: latestIssue.url,
      },
      attempt,
      metadata: {
        workspace: workspace.path,
        pullRequestUrl,
      },
    });
    ctx.releaseIssueClaim(latestIssue.id);
    return;
  }

  if (outcome.kind === "normal") {
    const nextAttempt = (attempt ?? 0) + 1;
    ctx.queueRetry(latestIssue, nextAttempt, 1000, "continuation");
    ctx.deps.logger.info(
      {
        issue_id: latestIssue.id,
        issue_identifier: latestIssue.identifier,
        attempt: nextAttempt,
        delay_ms: 1000,
        reason: "turn_complete",
      },
      "worker retry queued",
    );
    return;
  }

  const nextAttempt = (attempt ?? 0) + 1;
  const delayMs = Math.min(10_000 * 2 ** Math.max(0, nextAttempt - 1), ctx.getConfig().agent.maxRetryBackoffMs);
  ctx.queueRetry(latestIssue, nextAttempt, delayMs, outcome.errorCode ?? "turn_failed");
  ctx.deps.logger.info(
    {
      issue_id: latestIssue.id,
      issue_identifier: latestIssue.identifier,
      attempt: nextAttempt,
      delay_ms: delayMs,
      reason: outcome.errorCode ?? "turn_failed",
    },
    "worker retry queued",
  );
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
