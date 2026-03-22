import type { OrchestratorContext } from "./context.js";
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
import { resolveModelSelection as resolveModelSelectionFromConfig } from "./model-selection.js";
import {
  clearRetryEntry as clearRetryEntryState,
  handleRetryLaunchFailure as handleRetryLaunchFailureState,
  queueRetry as queueRetryState,
  revalidateAndLaunchRetry as revalidateAndLaunchRetryState,
} from "./retry-manager.js";
import { cleanupTerminalIssueWorkspaces as cleanupTerminalIssueWorkspacesState } from "./lifecycle.js";
import {
  canDispatchIssue as canDispatchIssueState,
  hasAvailableStateSlot as hasAvailableStateSlotState,
  launchWorker as launchWorkerState,
} from "./worker-launcher.js";
import { handleWorkerFailure } from "./worker-failure.js";
import { handleWorkerOutcome } from "./worker-outcome.js";
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
    claimIssue: (issueId) => state.claimedIssueIds.add(issueId),
    notify: (event) => notifyChannel(deps, event),
    pushEvent: (event) => pushRecentEvent(state.recentEvents, event),
    queueRetry: (issue, attempt, delayMs, error) =>
      queueRetryState(buildCtx(state, deps), issue, attempt, delayMs, error),
    clearRetryEntry: (issueId) => clearRetryEntryState(buildCtx(state, deps), issueId),
    launchWorker: async (issue, attempt, options) => launchWorkerDelegate(state, deps, issue, attempt, options),
    canDispatchIssue: (issue) => canDispatchIssueState(issue, deps.configStore.getConfig(), state.claimedIssueIds),
    hasAvailableStateSlot: (issue, pendingStateCounts) =>
      hasAvailableStateSlotState(issue, deps.configStore.getConfig(), state.runningEntries, pendingStateCounts),
    revalidateAndLaunchRetry: (issueId, attempt) =>
      revalidateAndLaunchRetryState(buildCtx(state, deps), issueId, attempt),
    handleRetryLaunchFailure: (issue, attempt, error) =>
      handleRetryLaunchFailureState(buildCtx(state, deps), issue, attempt, error),
    getQueuedViews: () => state.queuedViews,
    setQueuedViews: (views) => {
      state.queuedViews = views;
    },
    applyUsageEvent: (entry, usage, usageMode) => applyUsageEvent(state, entry, usage, usageMode),
    setRateLimits: (rateLimits) => {
      state.rateLimits = rateLimits;
    },
    getStallEvents: () => state.stallEvents,
    detectAndKillStalled: () =>
      detectAndKillStalledWorkers({
        runningEntries: state.runningEntries,
        stallEvents: state.stallEvents,
        getConfig: () => deps.configStore.getConfig(),
        pushEvent: (event) => pushRecentEvent(state.recentEvents, event),
        logger: { warn: (...args) => deps.logger.warn(...args) },
      }),
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
  sessionUsageTotals: Map<string, TokenUsageSnapshot>;
  codexTotals: { inputTokens: number; outputTokens: number; totalTokens: number; secondsRunning: number };
  stallEvents: StallEvent[];
}

function notifyChannel(deps: OrchestratorDeps, event: NotificationEvent): void {
  if (!deps.notificationManager) return;
  void deps.notificationManager.notify(event);
}

function pushRecentEvent(
  recentEvents: RecentEvent[],
  event: RecentEvent & { usage?: unknown; rateLimits?: unknown },
): void {
  recentEvents.push({
    at: event.at,
    issueId: event.issueId,
    issueIdentifier: event.issueIdentifier,
    sessionId: event.sessionId,
    event: event.event,
    message: event.message,
    content: event.content ?? null,
  });
  if (recentEvents.length > 250) {
    recentEvents.shift();
  }
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
    state.codexTotals.inputTokens += delta.inputTokens;
    state.codexTotals.outputTokens += delta.outputTokens;
    state.codexTotals.totalTokens += delta.totalTokens;
    entry.tokenUsage = usage;
    if (entry.sessionId) {
      state.sessionUsageTotals.set(entry.sessionId, usage);
    }
    return;
  }

  state.codexTotals.inputTokens += usage.inputTokens;
  state.codexTotals.outputTokens += usage.outputTokens;
  state.codexTotals.totalTokens += usage.totalTokens;
  entry.tokenUsage = {
    inputTokens: (entry.tokenUsage?.inputTokens ?? 0) + usage.inputTokens,
    outputTokens: (entry.tokenUsage?.outputTokens ?? 0) + usage.outputTokens,
    totalTokens: (entry.tokenUsage?.totalTokens ?? 0) + usage.totalTokens,
  };
}

async function launchWorkerDelegate(
  state: OrchestratorState,
  deps: OrchestratorDeps,
  issue: Issue,
  attempt: number | null,
  options?: { claimHeld?: boolean },
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
