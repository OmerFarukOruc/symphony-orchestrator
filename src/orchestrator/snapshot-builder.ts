import { buildWorkflowColumns } from "../workflow/columns.js";
import { issueView, nowIso } from "./views.js";
import type {
  AttemptRecord,
  RecentEvent,
  RuntimeIssueView,
  RuntimeSnapshot,
  ServiceConfig,
  ModelSelection,
} from "../core/types.js";
import type { RunningEntry, RetryRuntimeEntry } from "./runtime-types.js";

export interface AttemptSummary {
  attemptId: string;
  attemptNumber: number | null;
  startedAt: string;
  endedAt: string | null;
  status: string;
  model: string;
  reasoningEffort: string | null;
  tokenUsage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  } | null;
  errorCode: string | null;
  errorMessage: string | null;
}

export interface SnapshotBuilderDeps {
  attemptStore: {
    getAllAttempts: () => AttemptRecord[];
    getEvents: (attemptId: string) => RecentEvent[];
    getAttemptsForIssue: (issueIdentifier: string) => AttemptRecord[];
  };
}

export interface SnapshotBuilderCallbacks {
  getConfig: () => ServiceConfig;
  resolveModelSelection: (identifier: string) => ModelSelection;
  getDetailViews: () => Map<string, RuntimeIssueView>;
  getCompletedViews: () => Map<string, RuntimeIssueView>;
  getRunningEntries: () => Map<string, RunningEntry>;
  getRetryEntries: () => Map<string, RetryRuntimeEntry>;
  getQueuedViews: () => RuntimeIssueView[];
  getRecentEvents: () => RecentEvent[];
  getRateLimits: () => unknown | null;
  getCodexTotals: () => {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    secondsRunning: number;
  };
}

// Builds a runtime snapshot from orchestrator state.
// Pure read-path logic extracted for testability and modularity.
export function buildSnapshot(deps: SnapshotBuilderDeps, callbacks: SnapshotBuilderCallbacks): RuntimeSnapshot {
  const running = [...callbacks.getRunningEntries().values()].map((entry) =>
    buildRunningIssueView(entry, callbacks.resolveModelSelection),
  );
  const retrying = [...callbacks.getRetryEntries().values()].map((entry) =>
    buildRetryIssueView(entry, callbacks.resolveModelSelection),
  );
  const queued = callbacks.getQueuedViews();
  const completed = [...callbacks.getCompletedViews().values()].slice(0, 25);
  const codexTotals = callbacks.getCodexTotals();

  return {
    generatedAt: nowIso(),
    counts: {
      running: callbacks.getRunningEntries().size,
      retrying: callbacks.getRetryEntries().size,
    },
    running,
    retrying,
    queued,
    completed,
    workflowColumns: buildWorkflowColumns(callbacks.getConfig(), {
      running,
      retrying,
      queued,
      completed,
    }),
    codexTotals: {
      ...codexTotals,
      secondsRunning: computeSecondsRunning(deps.attemptStore, () => callbacks.getRunningEntries()),
    },
    rateLimits: callbacks.getRateLimits(),
    recentEvents: [...callbacks.getRecentEvents()],
  };
}

// Builds issue detail view including archived attempts.
export function buildIssueDetail(
  identifier: string,
  deps: SnapshotBuilderDeps,
  callbacks: SnapshotBuilderCallbacks,
):
  | (RuntimeIssueView & { recentEvents: RecentEvent[]; attempts: AttemptSummary[]; currentAttemptId: string | null })
  | null {
  const runningEntry = [...callbacks.getRunningEntries().values()].find(
    (entry) => entry.issue.identifier === identifier,
  );
  const retryEntry = [...callbacks.getRetryEntries().values()].find((entry) => entry.identifier === identifier);
  const completedEntry = callbacks.getCompletedViews().get(identifier);
  const detail =
    (runningEntry ? buildRunningIssueView(runningEntry, callbacks.resolveModelSelection) : null) ??
    (retryEntry ? buildRetryIssueView(retryEntry, callbacks.resolveModelSelection) : null) ??
    completedEntry ??
    callbacks.getDetailViews().get(identifier);

  if (!detail) {
    return null;
  }

  const archivedAttempts = deps.attemptStore.getAttemptsForIssue(identifier);
  const relatedEvents = runningEntry
    ? deps.attemptStore.getEvents(runningEntry.runId)
    : retryEntry
      ? callbacks.getRecentEvents().filter((event) => event.issueIdentifier === identifier)
      : archivedAttempts.length > 0
        ? archivedAttempts.flatMap((attempt) => deps.attemptStore.getEvents(attempt.attemptId))
        : callbacks.getRecentEvents().filter((event) => event.issueIdentifier === identifier);

  return {
    ...detail,
    recentEvents: relatedEvents,
    attempts: archivedAttempts.map((attempt) => buildAttemptSummary(attempt)),
    currentAttemptId: runningEntry?.runId ?? null,
  };
}

// Builds attempt detail view with events.
export function buildAttemptDetail(
  attemptId: string,
  deps: SnapshotBuilderDeps,
): (AttemptSummary & { events: RecentEvent[] }) | null {
  const attempt = deps.attemptStore.getAllAttempts().find((a) => a.attemptId === attemptId) ?? null;
  if (!attempt) {
    return null;
  }
  return {
    ...buildAttemptSummary(attempt),
    events: deps.attemptStore.getEvents(attemptId),
  };
}

// Converts a RunningEntry to a RuntimeIssueView.
export function buildRunningIssueView(
  entry: RunningEntry,
  resolveModelSelection: (identifier: string) => ModelSelection,
): RuntimeIssueView {
  const configuredSelection = resolveModelSelection(entry.issue.identifier);
  return issueView(entry.issue, {
    workspaceKey: entry.workspace.workspaceKey,
    workspacePath: entry.workspace.path,
    status: entry.status,
    attempt: entry.attempt,
    message: `running in ${entry.workspace.path}`,
    startedAt: new Date(entry.startedAtMs).toISOString(),
    lastEventAt: new Date(entry.lastEventAtMs).toISOString(),
    tokenUsage: entry.tokenUsage,
    priority: entry.issue.priority,
    labels: entry.issue.labels,
    configuredModel: configuredSelection.model,
    configuredReasoningEffort: configuredSelection.reasoningEffort,
    configuredModelSource: configuredSelection.source,
    modelChangePending:
      configuredSelection.model !== entry.modelSelection.model ||
      configuredSelection.reasoningEffort !== entry.modelSelection.reasoningEffort,
    model: entry.modelSelection.model,
    reasoningEffort: entry.modelSelection.reasoningEffort,
    modelSource: entry.modelSelection.source,
  });
}

// Converts a RetryRuntimeEntry to a RuntimeIssueView.
export function buildRetryIssueView(
  entry: RetryRuntimeEntry,
  resolveModelSelection: (identifier: string) => ModelSelection,
): RuntimeIssueView {
  const configuredSelection = resolveModelSelection(entry.identifier);
  return issueView(entry.issue, {
    configuredModel: configuredSelection.model,
    configuredReasoningEffort: configuredSelection.reasoningEffort,
    configuredModelSource: configuredSelection.source,
    modelChangePending: false,
    workspaceKey: entry.workspaceKey,
    status: "retrying",
    attempt: entry.attempt,
    error: entry.error,
    message: `retry due at ${new Date(entry.dueAtMs).toISOString()}`,
    model: configuredSelection.model,
    reasoningEffort: configuredSelection.reasoningEffort,
    modelSource: configuredSelection.source,
  });
}

// Computes total seconds running from archived attempts and live entries.
export function computeSecondsRunning(
  attemptStore: SnapshotBuilderDeps["attemptStore"],
  getRunningEntries: () => Map<string, RunningEntry>,
): number {
  const archivedSeconds = attemptStore.getAllAttempts().reduce((total, attempt) => {
    if (!attempt.endedAt) {
      return total;
    }
    const startedAt = Date.parse(attempt.startedAt);
    const endedAt = Date.parse(attempt.endedAt);
    if (Number.isNaN(startedAt) || Number.isNaN(endedAt) || endedAt < startedAt) {
      return total;
    }
    return total + (endedAt - startedAt) / 1000;
  }, 0);

  const liveSeconds = [...getRunningEntries().values()].reduce(
    (total, entry) => total + Math.max(0, (Date.now() - entry.startedAtMs) / 1000),
    0,
  );

  return archivedSeconds + liveSeconds;
}

// Builds a minimal attempt summary from an AttemptRecord.
function buildAttemptSummary(attempt: AttemptRecord): AttemptSummary {
  return {
    attemptId: attempt.attemptId,
    attemptNumber: attempt.attemptNumber,
    startedAt: attempt.startedAt,
    endedAt: attempt.endedAt,
    status: attempt.status,
    model: attempt.model,
    reasoningEffort: attempt.reasoningEffort,
    tokenUsage: attempt.tokenUsage,
    errorCode: attempt.errorCode,
    errorMessage: attempt.errorMessage,
  };
}
