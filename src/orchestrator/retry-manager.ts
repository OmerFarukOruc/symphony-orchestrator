import { randomUUID } from "node:crypto";

import { AttemptStore } from "../core/attempt-store.js";
import type { NotificationEvent } from "../notification/channel.js";
import { issueView, nowIso } from "./views.js";
import { isActiveState, isTerminalState } from "../state/policy.js";
import type { Issue, ModelSelection, RecentEvent, ServiceConfig } from "../core/types.js";
import type { RetryRuntimeEntry, RunningEntry } from "./runtime-types.js";

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
    void ctx.revalidateAndLaunchRetry(issue.id, attempt).catch((failure) => {
      void ctx.handleRetryLaunchFailure(issue, attempt, failure);
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
      linearClient: { fetchIssueStatesByIds: (ids: string[]) => Promise<Issue[]> };
      workspaceManager: { removeWorkspace: (identifier: string) => Promise<void> };
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

  const [latestIssue] = await ctx.deps.linearClient.fetchIssueStatesByIds([issueId]);
  const config = ctx.getConfig();
  if (!latestIssue) {
    ctx.clearRetryEntry(issueId);
    return;
  }
  retryEntry.issue = latestIssue;

  if (isTerminalState(latestIssue.state, config)) {
    ctx.clearRetryEntry(issueId);
    await ctx.deps.workspaceManager.removeWorkspace(latestIssue.identifier).catch(() => undefined);
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

export async function handleRetryLaunchFailure(
  ctx: {
    runningEntries: Map<string, RunningEntry>;
    clearRetryEntry: (issueId: string) => void;
    deps: {
      attemptStore: Pick<AttemptStore, "updateAttempt" | "createAttempt">;
      logger: { error: (meta: Record<string, unknown>, message: string) => void };
    };
    detailViews: Map<string, ReturnType<typeof issueView>>;
    completedViews: Map<string, ReturnType<typeof issueView>>;
    pushEvent: (event: RecentEvent) => void;
    resolveModelSelection: (identifier: string) => ModelSelection;
  },
  issue: Issue,
  attempt: number,
  error: unknown,
): Promise<void> {
  const runningEntry = ctx.runningEntries.get(issue.id) ?? null;
  ctx.runningEntries.delete(issue.id);
  ctx.clearRetryEntry(issue.id);

  const errorText = String(error);
  const message = `retry startup failed: ${errorText}`;
  const selection = runningEntry?.modelSelection ?? ctx.resolveModelSelection(issue.identifier);
  const workspaceKey =
    runningEntry?.workspace.workspaceKey ?? ctx.detailViews.get(issue.identifier)?.workspaceKey ?? null;
  const workspacePath = runningEntry?.workspace.path ?? null;

  ctx.deps.logger.error(
    { issue_id: issue.id, issue_identifier: issue.identifier, error: errorText },
    "retry-launched worker startup failed",
  );
  ctx.pushEvent({
    at: nowIso(),
    issueId: issue.id,
    issueIdentifier: issue.identifier,
    sessionId: runningEntry?.sessionId ?? null,
    event: "worker_failed",
    message,
  });

  const configuredSelection = ctx.resolveModelSelection(issue.identifier);
  const failureView = issueView(issue, {
    workspaceKey,
    status: "failed",
    attempt,
    error: errorText,
    message,
    configuredModel: configuredSelection.model,
    configuredReasoningEffort: configuredSelection.reasoningEffort,
    configuredModelSource: configuredSelection.source,
    modelChangePending: false,
    model: selection.model,
    reasoningEffort: selection.reasoningEffort,
    modelSource: selection.source,
  });

  ctx.detailViews.set(issue.identifier, failureView);
  ctx.completedViews.set(issue.identifier, failureView);

  const endedAt = nowIso();
  const attemptId = runningEntry?.runId ?? randomUUID();
  const attemptPatch = {
    status: "failed" as const,
    endedAt,
    errorCode: "worker_failed",
    errorMessage: errorText,
    tokenUsage: runningEntry?.tokenUsage ?? null,
    threadId: runningEntry?.sessionId ?? null,
  };

  let persisted = false;
  if (runningEntry) {
    persisted = await ctx.deps.attemptStore
      .updateAttempt(attemptId, attemptPatch)
      .then(() => true)
      .catch(() => false);
  }

  if (!persisted) {
    await ctx.deps.attemptStore
      .createAttempt({
        attemptId,
        issueId: issue.id,
        issueIdentifier: issue.identifier,
        title: issue.title,
        workspaceKey,
        workspacePath,
        status: "failed",
        attemptNumber: attempt,
        startedAt: runningEntry ? new Date(runningEntry.startedAtMs).toISOString() : endedAt,
        endedAt,
        model: selection.model,
        reasoningEffort: selection.reasoningEffort,
        modelSource: selection.source,
        threadId: runningEntry?.sessionId ?? null,
        turnId: null,
        turnCount: 0,
        errorCode: "worker_failed",
        errorMessage: errorText,
        tokenUsage: runningEntry?.tokenUsage ?? null,
      })
      .catch(() => undefined);
  }
}
