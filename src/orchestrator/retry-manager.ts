import { randomUUID } from "node:crypto";

import { AttemptStore } from "../core/attempt-store.js";
import type { NotificationEvent } from "../notification/channel.js";
import { issueView, nowIso } from "./views.js";
import { isActiveState, isTerminalState } from "../state/policy.js";
import type { Issue, ModelSelection, RecentEvent, ServiceConfig, AttemptRecord } from "../core/types.js";
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

function buildRetryFailureView(
  ctx: {
    detailViews: Map<string, ReturnType<typeof issueView>>;
    resolveModelSelection: (identifier: string) => ModelSelection;
  },
  issue: Issue,
  runningEntry: RunningEntry | null,
  errorText: string,
  attempt: number,
): ReturnType<typeof issueView> {
  const selection = runningEntry?.modelSelection ?? ctx.resolveModelSelection(issue.identifier);
  const configuredSelection = ctx.resolveModelSelection(issue.identifier);
  const workspaceKey =
    runningEntry?.workspace.workspaceKey ?? ctx.detailViews.get(issue.identifier)?.workspaceKey ?? null;

  return issueView(issue, {
    workspaceKey,
    status: "failed",
    attempt,
    error: errorText,
    message: `retry startup failed: ${errorText}`,
    configuredModel: configuredSelection.model,
    configuredReasoningEffort: configuredSelection.reasoningEffort,
    configuredModelSource: configuredSelection.source,
    modelChangePending: false,
    model: selection.model,
    reasoningEffort: selection.reasoningEffort,
    modelSource: selection.source,
  });
}

function buildFailureAttemptData(
  runningEntry: RunningEntry | null,
  issue: Issue,
  selection: ModelSelection,
  errorText: string,
  attempt: number,
  workspaceKey: string | null,
  endedAt: string,
): AttemptRecord {
  return {
    attemptId: runningEntry?.runId ?? randomUUID(),
    issueId: issue.id,
    issueIdentifier: issue.identifier,
    title: issue.title,
    workspaceKey,
    workspacePath: runningEntry?.workspace.path ?? null,
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
  };
}

async function persistRetryFailure(
  attemptStore: Pick<AttemptStore, "updateAttempt" | "createAttempt">,
  runningEntry: RunningEntry | null,
  issue: Issue,
  selection: ModelSelection,
  errorText: string,
  attempt: number,
  workspaceKey: string | null,
): Promise<void> {
  const endedAt = nowIso();
  const attemptId = runningEntry?.runId ?? randomUUID();

  let persisted = false;
  if (runningEntry) {
    persisted = await attemptStore
      .updateAttempt(attemptId, {
        status: "failed" as const,
        endedAt,
        errorCode: "worker_failed",
        errorMessage: errorText,
        tokenUsage: runningEntry.tokenUsage ?? null,
        threadId: runningEntry.sessionId ?? null,
      })
      .then(() => true)
      .catch(() => false);
  }

  if (!persisted) {
    const data = buildFailureAttemptData(runningEntry, issue, selection, errorText, attempt, workspaceKey, endedAt);
    await attemptStore.createAttempt(data).catch(() => undefined);
  }
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

  const failureView = buildRetryFailureView(ctx, issue, runningEntry, errorText, attempt);
  ctx.detailViews.set(issue.identifier, failureView);
  ctx.completedViews.set(issue.identifier, failureView);

  const selection = runningEntry?.modelSelection ?? ctx.resolveModelSelection(issue.identifier);
  await persistRetryFailure(
    ctx.deps.attemptStore,
    runningEntry,
    issue,
    selection,
    errorText,
    attempt,
    failureView.workspaceKey ?? null,
  );
}
