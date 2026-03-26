import type { NotificationEvent } from "../notification/channel.js";
import { nowIso } from "./views.js";
import { isActiveState, isTerminalState } from "../state/policy.js";
import type { Issue, ServiceConfig } from "../core/types.js";
import type { RetryRuntimeEntry, RunningEntry } from "./runtime-types.js";

export { handleRetryLaunchFailure } from "./retry-failure.js";

export function clearRetryEntry(
  ctx: {
    retryEntries: Map<string, RetryRuntimeEntry>;
    runningEntries: Map<string, RunningEntry>;
    releaseIssueClaim: (issueId: string) => void;
  },
  issueId: string,
): void {
  const retryEntry = ctx.retryEntries.get(issueId);
  if (retryEntry?.timer) {
    clearTimeout(retryEntry.timer);
  }
  ctx.retryEntries.delete(issueId);
  if (!ctx.runningEntries.has(issueId)) {
    ctx.releaseIssueClaim(issueId);
  }
}

export function queueRetry(
  ctx: {
    isRunning: () => boolean;
    claimIssue: (issueId: string) => void;
    retryEntries: Map<string, RetryRuntimeEntry>;
    detailViews: Map<string, { workspaceKey: string | null }>;
    notify: (event: NotificationEvent) => void;
    revalidateAndLaunchRetry: (issueId: string, attempt: number) => Promise<void>;
    handleRetryLaunchFailure: (issue: Issue, attempt: number, error: unknown) => Promise<void>;
  },
  issue: Issue,
  attempt: number,
  delayMs: number,
  error: string | null,
): void {
  if (!ctx.isRunning()) {
    return;
  }
  ctx.claimIssue(issue.id);
  const existing = ctx.retryEntries.get(issue.id);
  if (existing?.timer) {
    clearTimeout(existing.timer);
  }
  const dueAtMs = Date.now() + delayMs;
  const timer = setTimeout(() => {
    void ctx.revalidateAndLaunchRetry(issue.id, attempt).catch((retryError) => {
      void ctx.handleRetryLaunchFailure(issue, attempt, retryError);
    });
  }, delayMs);
  ctx.retryEntries.set(issue.id, {
    issueId: issue.id,
    identifier: issue.identifier,
    attempt,
    dueAtMs,
    error,
    timer,
    issue,
    workspaceKey: ctx.detailViews.get(issue.identifier)?.workspaceKey ?? null,
  });
  ctx.notify({
    type: "worker_retry",
    severity: "critical",
    timestamp: nowIso(),
    message: `retry queued in ${delayMs}ms`,
    issue: {
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      state: issue.state,
      url: issue.url,
    },
    attempt,
    metadata: {
      delayMs,
      error,
    },
  });
}

export async function revalidateAndLaunchRetry(
  ctx: {
    retryEntries: Map<string, RetryRuntimeEntry>;
    runningEntries: Map<string, RunningEntry>;
    deps: {
      tracker: { fetchIssueStatesByIds: (ids: string[]) => Promise<Issue[]> };
      workspaceManager: { removeWorkspace: (identifier: string, issue?: Issue) => Promise<void> };
      logger: { warn: (meta: Record<string, unknown>, message: string) => void };
    };
    getConfig: () => ServiceConfig;
    isRunning: () => boolean;
    clearRetryEntry: (issueId: string) => void;
    hasAvailableStateSlot: (issue: Issue) => boolean;
    queueRetry: (issue: Issue, attempt: number, delayMs: number, error: string | null) => void;
    launchWorker: (issue: Issue, attempt: number, options?: { claimHeld?: boolean }) => Promise<void>;
  },
  issueId: string,
  attempt: number,
): Promise<void> {
  const retryEntry = ctx.retryEntries.get(issueId);
  if (!retryEntry || !ctx.isRunning()) {
    return;
  }

  const [latestIssue] = await ctx.deps.tracker.fetchIssueStatesByIds([issueId]);
  const config = ctx.getConfig();
  if (!latestIssue) {
    ctx.clearRetryEntry(issueId);
    return;
  }
  retryEntry.issue = latestIssue;

  if (isTerminalState(latestIssue.state, config)) {
    ctx.clearRetryEntry(issueId);
    await ctx.deps.workspaceManager.removeWorkspace(latestIssue.identifier, latestIssue).catch((error: unknown) => {
      ctx.deps.logger.warn(
        { issueId, identifier: latestIssue.identifier, error: String(error) },
        "workspace cleanup failed during retry launch",
      );
    });
    return;
  }
  if (!isActiveState(latestIssue.state, config)) {
    ctx.clearRetryEntry(issueId);
    return;
  }
  if (ctx.runningEntries.size >= config.agent.maxConcurrentAgents || !ctx.hasAvailableStateSlot(latestIssue)) {
    ctx.queueRetry(latestIssue, attempt, 1_000, retryEntry.error);
    return;
  }

  ctx.retryEntries.delete(issueId);
  await ctx.launchWorker(latestIssue, attempt, { claimHeld: true });
}
