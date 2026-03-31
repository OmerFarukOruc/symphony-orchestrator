import type { OrchestratorContext } from "./context.js";
import type { RuntimeEventRecord } from "../core/lifecycle-events.js";
import type {
  Issue,
  ModelSelection,
  RecentEvent,
  RunOutcome,
  RuntimeIssueView,
  TokenUsageSnapshot,
  Workspace,
} from "../core/types.js";
import type { NotificationEvent } from "../notification/channel.js";
import type { OrchestratorDeps, RunningEntry, RetryRuntimeEntry } from "./runtime-types.js";

import { usageDelta } from "./views.js";

const MAX_RECENT_EVENTS = 250;
import { resolveModelSelection as resolveModelSelectionFromConfig } from "./model-selection.js";
import {
  clearRetryEntry as clearRetryEntryState,
  handleRetryLaunchFailure as handleRetryLaunchFailureState,
  queueRetry as queueRetryState,
  revalidateAndLaunchRetry as revalidateAndLaunchRetryState,
} from "./retry-manager.js";
import { cleanupTerminalIssueWorkspaces as cleanupTerminalIssueWorkspacesState } from "./lifecycle.js";
import {
  buildIssueDispatchFingerprint,
  canDispatchIssue as canDispatchIssueState,
  hasAvailableStateSlot as hasAvailableStateSlotState,
  launchWorker as launchWorkerState,
} from "./worker-launcher.js";
import { handleWorkerFailure } from "./worker-failure.js";
import { handleWorkerOutcome } from "./worker-outcome/index.js";
import { detectAndKillStalledWorkers, type StallEvent } from "./stall-detector.js";
import { globalMetrics } from "../observability/metrics.js";

/**
 * Pure delegation helpers that forward from Orchestrator methods to extracted state modules.
 * Keeps Orchestrator thin by housing all private method logic here.
 */

export function buildCtx(state: OrchestratorState, deps: OrchestratorDeps): OrchestratorContext {
  return {
    running: state.running,
    runningEntries: state.runningEntries,
    retryEntries: state.retryEntries,
    completedViews: state.completedViews,
    detailViews: state.detailViews,
    claimedIssueIds: state.claimedIssueIds,
    queuedViews: state.queuedViews,
    deps,
    getConfig: () => deps.configStore.getConfig(),
    isRunning: () => state.running,
    resolveModelSelection: (identifier) =>
      resolveModelSelectionFromConfig(state.issueModelOverrides, deps.configStore.getConfig(), identifier),
    releaseIssueClaim: (issueId) => state.claimedIssueIds.delete(issueId),
    suppressIssueDispatch: (issue) =>
      state.operatorAbortSuppressions?.set(issue.id, buildIssueDispatchFingerprint(issue)),
    claimIssue: (issueId) => state.claimedIssueIds.add(issueId),
    notify: (event) => notifyChannel(deps, event),
    pushEvent: (event) => {
      pushRecentEvent(state, event);
      state.markDirty();
      forwardToEventBus(deps, event);
    },
    queueRetry: (issue, attempt, delayMs, error, metadata) =>
      queueRetryState(buildCtx(state, deps), issue, attempt, delayMs, error, metadata),
    clearRetryEntry: (issueId) => clearRetryEntryState(buildCtx(state, deps), issueId),
    launchWorker: async (issue, attempt, options) => launchWorkerDelegate(state, deps, issue, attempt, options),
    canDispatchIssue: (issue) =>
      canDispatchIssueState(
        issue,
        deps.configStore.getConfig(),
        state.claimedIssueIds,
        state.operatorAbortSuppressions,
      ),
    hasAvailableStateSlot: (issue, pendingStateCounts, runningStateCounts) =>
      hasAvailableStateSlotState(
        issue,
        deps.configStore.getConfig(),
        state.runningEntries,
        pendingStateCounts,
        runningStateCounts,
      ),
    revalidateAndLaunchRetry: (issueId, attempt) =>
      revalidateAndLaunchRetryState(buildCtx(state, deps), issueId, attempt),
    handleRetryLaunchFailure: (issue, attempt, error) =>
      handleRetryLaunchFailureState(buildCtx(state, deps), issue, attempt, error),
    getQueuedViews: () => state.queuedViews,
    setQueuedViews: (views) => {
      state.queuedViews = views;
      state.markDirty();
    },
    applyUsageEvent: (entry, usage, usageMode) => applyUsageEvent(state, entry, usage, usageMode),
    setRateLimits: (rateLimits) => {
      state.rateLimits = rateLimits;
      state.markDirty();
    },
    getStallEvents: () => state.stallEvents,
    detectAndKillStalled: () => {
      const result = detectAndKillStalledWorkers({
        runningEntries: state.runningEntries,
        stallEvents: state.stallEvents,
        getConfig: () => deps.configStore.getConfig(),
        pushEvent: (event) => {
          pushRecentEvent(state, event);
          forwardToEventBus(deps, event);
        },
        logger: { warn: (...args) => deps.logger.warn(...args) },
      });
      if (result.updatedStallEvents) {
        state.stallEvents = result.updatedStallEvents;
      }
      return { killed: result.killed };
    },
    eventBus: deps.eventBus,
  };
}

export interface OrchestratorState {
  running: boolean;
  runningEntries: Map<string, RunningEntry>;
  retryEntries: Map<string, RetryRuntimeEntry>;
  completedViews: Map<string, RuntimeIssueView>;
  detailViews: Map<string, RuntimeIssueView>;
  claimedIssueIds: Set<string>;
  queuedViews: RuntimeIssueView[];
  recentEvents: RecentEvent[];
  rateLimits: unknown;
  issueModelOverrides: Map<string, Omit<ModelSelection, "source">>;
  issueTemplateOverrides: Map<string, string>;
  operatorAbortSuppressions?: Map<string, string>;
  sessionUsageTotals: Map<string, TokenUsageSnapshot>;
  codexTotals: { inputTokens: number; outputTokens: number; totalTokens: number; secondsRunning: number };
  stallEvents: StallEvent[];
  markDirty: () => void;
}

function notifyChannel(deps: OrchestratorDeps, event: NotificationEvent): void {
  if (!deps.notificationManager) return;
  void deps.notificationManager.notify(event);
}

function pushRecentEvent(state: OrchestratorState, event: RuntimeEventRecord): void {
  const newEvent: RecentEvent = {
    at: event.at,
    issueId: event.issueId,
    issueIdentifier: event.issueIdentifier,
    sessionId: event.sessionId,
    event: event.event,
    message: event.message,
    content: event.content ?? null,
    metadata: event.metadata ?? null,
  };
  const events = [...state.recentEvents, newEvent];
  state.recentEvents = events.length > MAX_RECENT_EVENTS ? events.slice(events.length - MAX_RECENT_EVENTS) : events;
}

function emitLifecycleEvent(deps: OrchestratorDeps, event: RuntimeEventRecord): void {
  const issueId = event.issueId ?? "";
  const identifier = event.issueIdentifier ?? "";
  if (event.event === "agent_stalled" || event.event === "worker_stalled") {
    deps.eventBus?.emit("issue.stalled", { issueId, identifier, reason: event.message });
  } else if (event.event === "worker_failed") {
    deps.eventBus?.emit("worker.failed", { issueId, identifier, error: event.message });
  } else if (event.event === "issue_queued") {
    deps.eventBus?.emit("issue.queued", { issueId, identifier });
  } else if (
    event.event === "workspace_preparing" ||
    event.event === "workspace_ready" ||
    event.event === "workspace_failed"
  ) {
    deps.eventBus?.emit("workspace.event", {
      issueId,
      identifier,
      status: event.event.replaceAll("workspace_", ""),
    });
  }
}

function forwardToEventBus(deps: OrchestratorDeps, event: RuntimeEventRecord): void {
  emitLifecycleEvent(deps, event);
  deps.eventBus?.emit("agent.event", {
    issueId: event.issueId ?? "",
    identifier: event.issueIdentifier ?? "",
    type: event.event,
    message: event.message,
    sessionId: event.sessionId ?? null,
    timestamp: event.at,
    content: event.content ?? null,
  });
}

function applyUsageEvent(
  state: OrchestratorState,
  entry: RunningEntry,
  usage: TokenUsageSnapshot,
  usageMode: "absolute_total" | "delta",
): void {
  if (usageMode === "absolute_total") {
    const previous = entry.sessionId ? (state.sessionUsageTotals.get(entry.sessionId) ?? null) : null;
    const delta = usageDelta(previous, usage);
    state.codexTotals = {
      ...state.codexTotals,
      inputTokens: state.codexTotals.inputTokens + delta.inputTokens,
      outputTokens: state.codexTotals.outputTokens + delta.outputTokens,
      totalTokens: state.codexTotals.totalTokens + delta.totalTokens,
    };
    entry.tokenUsage = usage;
    if (entry.sessionId) {
      state.sessionUsageTotals.set(entry.sessionId, usage);
    }
    state.markDirty();
    return;
  }

  state.codexTotals = {
    ...state.codexTotals,
    inputTokens: state.codexTotals.inputTokens + usage.inputTokens,
    outputTokens: state.codexTotals.outputTokens + usage.outputTokens,
    totalTokens: state.codexTotals.totalTokens + usage.totalTokens,
  };
  entry.tokenUsage = {
    inputTokens: (entry.tokenUsage?.inputTokens ?? 0) + usage.inputTokens,
    outputTokens: (entry.tokenUsage?.outputTokens ?? 0) + usage.outputTokens,
    totalTokens: (entry.tokenUsage?.totalTokens ?? 0) + usage.totalTokens,
  };
  state.markDirty();
}

async function launchWorkerDelegate(
  state: OrchestratorState,
  deps: OrchestratorDeps,
  issue: Issue,
  attempt: number | null,
  options?: { claimHeld?: boolean; previousThreadId?: string | null },
): Promise<void> {
  const ctx = buildCtx(state, deps);
  await launchWorkerState(
    {
      ...ctx,
      handleWorkerPromise: (promise, workerIssue, workspace, entry, workerAttempt) =>
        handleWorkerPromise(state, deps, promise, workerIssue, workspace, entry, workerAttempt),
    },
    issue,
    attempt,
    options,
  );
  deps.eventBus?.emit("issue.started", {
    issueId: issue.id,
    identifier: issue.identifier,
    attempt,
  });
}

async function handleWorkerPromise(
  state: OrchestratorState,
  deps: OrchestratorDeps,
  promise: Promise<RunOutcome>,
  workerIssue: Issue,
  workspace: Workspace,
  entry: RunningEntry,
  workerAttempt: number | null,
): Promise<void> {
  await promise
    .then(async (outcome) => {
      await handleWorkerOutcome(buildCtx(state, deps), outcome, entry, workerIssue, workspace, workerAttempt);
      globalMetrics.agentRunsTotal.increment({ outcome: outcome.kind });
    })
    .catch(async (error) => {
      await handleWorkerFailure(buildCtx(state, deps), workerIssue, entry, error);
      globalMetrics.agentRunsTotal.increment({ outcome: "failed" });
    });
}

export async function cleanupTerminalWorkspaces(state: OrchestratorState, deps: OrchestratorDeps): Promise<void> {
  await cleanupTerminalIssueWorkspacesState(buildCtx(state, deps));
}
