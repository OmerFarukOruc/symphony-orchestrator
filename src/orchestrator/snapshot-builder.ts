import { buildWorkflowColumns } from "../workflow/columns.js";
import { lookupModelPrice } from "../core/model-pricing.js";
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
  costUsd: number | null;
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
    getAttempt: (attemptId: string) => AttemptRecord | null;
    getEvents: (attemptId: string) => RecentEvent[];
    getAttemptsForIssue: (issueIdentifier: string) => AttemptRecord[];
    sumArchivedSeconds: () => number;
    sumCostUsd: () => number;
    sumArchivedTokens: () => { inputTokens: number; outputTokens: number; totalTokens: number };
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
    costUsd?: number;
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
      inputTokens: computeArchivedTokenField(deps.attemptStore, codexTotals, "inputTokens"),
      outputTokens: computeArchivedTokenField(deps.attemptStore, codexTotals, "outputTokens"),
      totalTokens: computeArchivedTokenField(deps.attemptStore, codexTotals, "totalTokens"),
      secondsRunning: computeSecondsRunning(deps.attemptStore, () => callbacks.getRunningEntries()),
      costUsd: computeCostUsd(deps.attemptStore),
    },
    rateLimits: callbacks.getRateLimits(),
    recentEvents: [...callbacks.getRecentEvents()],
    stallEvents: callbacks.getStallEvents ? [...callbacks.getStallEvents()] : undefined,
    systemHealth: callbacks.getSystemHealth ? (callbacks.getSystemHealth() ?? undefined) : undefined,
  };
}

/** Typed detail view for a single issue, including its attempt history and live events. */
export interface IssueDetailView extends RuntimeIssueView {
  recentEvents: RecentEvent[];
  attempts: AttemptSummary[];
  currentAttemptId: string | null;
}

// Builds issue detail view including archived attempts.
export function buildIssueDetail(
  identifier: string,
  deps: SnapshotBuilderDeps,
  callbacks: SnapshotBuilderCallbacks,
): IssueDetailView | null {
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

/** Typed detail view for a single attempt, including its event stream. */
export interface AttemptDetailView extends AttemptSummary {
  events: RecentEvent[];
}

// Builds attempt detail view with events.
export function buildAttemptDetail(attemptId: string, deps: SnapshotBuilderDeps): AttemptDetailView | null {
  const attempt = deps.attemptStore.getAttempt(attemptId);
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
  const archivedSeconds = attemptStore.sumArchivedSeconds();
  const liveSeconds = [...getRunningEntries().values()].reduce(
    (total, entry) => total + Math.max(0, (Date.now() - entry.startedAtMs) / 1000),
    0,
  );
  return archivedSeconds + liveSeconds;
}

// Computes total cost in USD from archived attempts.
export function computeCostUsd(attemptStore: SnapshotBuilderDeps["attemptStore"]): number {
  return attemptStore.sumCostUsd();
}

// Returns the greater of the archived token count and the live in-memory counter.
// Live counters can race ahead of archived data when workers are still running,
// but after a restart the in-memory counters reset to 0 while archives persist.
function computeArchivedTokenField(
  attemptStore: SnapshotBuilderDeps["attemptStore"],
  liveCodexTotals: { inputTokens: number; outputTokens: number; totalTokens: number },
  field: "inputTokens" | "outputTokens" | "totalTokens",
): number {
  const archived = attemptStore.sumArchivedTokens();
  return Math.max(archived[field], liveCodexTotals[field]);
}

// Builds a minimal attempt summary from an AttemptRecord.
function buildAttemptSummary(attempt: AttemptRecord): AttemptSummary {
  const costUsd = computeAttemptCostUsd(attempt);
  return {
    attemptId: attempt.attemptId,
    attemptNumber: attempt.attemptNumber,
    startedAt: attempt.startedAt,
    endedAt: attempt.endedAt,
    status: attempt.status,
    model: attempt.model,
    reasoningEffort: attempt.reasoningEffort,
    tokenUsage: attempt.tokenUsage,
    costUsd,
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

// Computes cost in USD for a single attempt. Returns null when token usage or pricing is unavailable.
function computeAttemptCostUsd(attempt: AttemptRecord): number | null {
  if (!attempt.tokenUsage) return null;
  const price = lookupModelPrice(attempt.model);
  if (!price) return null;
  return (
    (attempt.tokenUsage.inputTokens * price.inputUsd + attempt.tokenUsage.outputTokens * price.outputUsd) / 1_000_000
  );
}
