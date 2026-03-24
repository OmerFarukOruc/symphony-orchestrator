import { buildWorkflowColumns } from "../workflow/columns.js";
import { nowIso } from "./views.js";
import { buildRunningIssueView, buildRetryIssueView } from "./issue-view-builders.js";
export { buildRunningIssueView, buildRetryIssueView } from "./issue-view-builders.js";
import { type IssueLocatorCallbacks, resolveIssue, toIssueView } from "./issue-locator.js";
import type {
  AttemptRecord,
  RecentEvent,
  RuntimeIssueView,
  RuntimeSnapshot,
  ServiceConfig,
  ModelSelection,
  StallEventView,
  SystemHealth,
} from "../core/types.js";
import type { RunningEntry, RetryRuntimeEntry } from "./runtime-types.js";

interface AttemptSummary {
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
  issueIdentifier?: string;
  title?: string;
  workspacePath?: string | null;
  workspaceKey?: string | null;
  modelSource?: string;
  turnCount?: number;
  threadId?: string | null;
  turnId?: string | null;
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
  getRateLimits: () => unknown;
  getCodexTotals: () => {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    secondsRunning: number;
  };
  getStallEvents?: () => StallEventView[];
  getSystemHealth?: () => SystemHealth | null;
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
      completed: [...completed, ...callbacks.getDetailViews().values()],
    }),
    codexTotals: {
      ...codexTotals,
      secondsRunning: computeSecondsRunning(deps.attemptStore, () => callbacks.getRunningEntries()),
    },
    rateLimits: callbacks.getRateLimits(),
    recentEvents: [...callbacks.getRecentEvents()],
    stallEvents: callbacks.getStallEvents ? [...callbacks.getStallEvents()] : undefined,
    systemHealth: callbacks.getSystemHealth ? (callbacks.getSystemHealth() ?? undefined) : undefined,
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
  const locatorCallbacks: IssueLocatorCallbacks = {
    getRunningEntries: callbacks.getRunningEntries,
    getRetryEntries: callbacks.getRetryEntries,
    getCompletedViews: callbacks.getCompletedViews,
    getDetailViews: callbacks.getDetailViews,
    resolveModelSelection: callbacks.resolveModelSelection,
  };
  const location = resolveIssue(identifier, locatorCallbacks);
  if (!location) {
    return null;
  }

  const detail = toIssueView(location, locatorCallbacks);
  const runningEntry = location.kind === "running" ? location.entry : null;
  const retryEntry = location.kind === "retry" ? location.entry : null;

  const archivedAttempts = deps.attemptStore.getAttemptsForIssue(identifier);
  let relatedEvents: RecentEvent[];
  if (runningEntry) {
    relatedEvents = deps.attemptStore.getEvents(runningEntry.runId);
  } else if (retryEntry) {
    relatedEvents = callbacks.getRecentEvents().filter((event) => event.issueIdentifier === identifier);
  } else if (archivedAttempts.length > 0) {
    relatedEvents = archivedAttempts.flatMap((attempt) => deps.attemptStore.getEvents(attempt.attemptId));
  } else {
    relatedEvents = callbacks.getRecentEvents().filter((event) => event.issueIdentifier === identifier);
  }

  const enriched: typeof detail = { ...detail };
  if (!enriched.tokenUsage && archivedAttempts.length > 0) {
    enriched.tokenUsage = archivedAttempts.reduce(
      (acc, attempt) => {
        if (!attempt.tokenUsage) return acc;
        return {
          inputTokens: acc.inputTokens + attempt.tokenUsage.inputTokens,
          outputTokens: acc.outputTokens + attempt.tokenUsage.outputTokens,
          totalTokens: acc.totalTokens + attempt.tokenUsage.totalTokens,
        };
      },
      { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    );
  }
  if (!enriched.startedAt && archivedAttempts.length > 0) {
    enriched.startedAt = archivedAttempts.at(0)?.startedAt ?? null;
  }

  return {
    ...enriched,
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
    issueIdentifier: attempt.issueIdentifier,
    title: attempt.title,
    workspacePath: attempt.workspacePath,
    workspaceKey: attempt.workspaceKey,
    modelSource: attempt.modelSource,
    turnCount: attempt.turnCount,
    threadId: attempt.threadId,
    turnId: attempt.turnId,
  };
}
