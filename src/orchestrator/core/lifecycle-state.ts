import { createLifecycleEvent } from "../../core/lifecycle-events.js";
import type {
  AttemptRecord,
  Issue,
  ModelSelection,
  RuntimeIssueView,
  RecentEvent,
  ServiceConfig,
  TokenUsageSnapshot,
} from "../../core/types.js";
import { sortIssuesForDispatch } from "./dispatch.js";
import { isActiveState, isTerminalState } from "../../state/policy.js";
import { issueView } from "../views.js";
import type { RetryRuntimeEntry, RunningEntry } from "../runtime-types.js";
import type { StallEvent } from "../stall-detector.js";
import type { RuntimeEventRecord } from "../../core/lifecycle-events.js";

const TERMINAL_ATTEMPT_STATUSES = new Set(["completed", "failed", "timed_out", "stalled", "cancelled", "paused"]);
export const MAX_RECENT_EVENTS = 250;

export interface LifecycleState {
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
  operatorAbortSuppressions: Map<string, string>;
  sessionUsageTotals: Map<string, TokenUsageSnapshot>;
  codexTotals: { inputTokens: number; outputTokens: number; totalTokens: number; secondsRunning: number };
  stallEvents: StallEvent[];
  markDirty: () => void;
}

export type LifecycleCommand =
  | { type: "reconcile_running_entries"; issuesById: ReadonlyMap<string, Issue> }
  | { type: "project_queue_views"; candidateIssues: readonly Issue[] }
  | { type: "seed_completed_claims"; attempts: readonly AttemptRecord[] };

export interface RunningEntryReconciliationPlan {
  issueId: string;
  latestIssue: Issue | null;
  issueChanged: boolean;
  nextStatus: RunningEntry["status"];
  abortReason: "terminal" | "inactive" | null;
  cleanupOnExit: boolean;
}

export function planRunningEntryReconciliation(
  entries: ReadonlyMap<string, RunningEntry>,
  byId: ReadonlyMap<string, Issue>,
  config: ServiceConfig,
): RunningEntryReconciliationPlan[] {
  return [...entries.values()].map((entry) => {
    const latestIssue = byId.get(entry.issue.id) ?? null;
    if (!latestIssue) {
      return {
        issueId: entry.issue.id,
        latestIssue: null,
        issueChanged: false,
        nextStatus: entry.status,
        abortReason: null,
        cleanupOnExit: entry.cleanupOnExit,
      };
    }

    if (isTerminalState(latestIssue.state, config)) {
      return {
        issueId: entry.issue.id,
        latestIssue,
        issueChanged: entry.issue !== latestIssue,
        nextStatus: "stopping",
        abortReason: entry.abortController.signal.aborted ? null : "terminal",
        cleanupOnExit: true,
      };
    }

    if (!isActiveState(latestIssue.state, config)) {
      return {
        issueId: entry.issue.id,
        latestIssue,
        issueChanged: entry.issue !== latestIssue,
        nextStatus: "stopping",
        abortReason: entry.abortController.signal.aborted ? null : "inactive",
        cleanupOnExit: entry.cleanupOnExit,
      };
    }

    return {
      issueId: entry.issue.id,
      latestIssue,
      issueChanged: entry.issue !== latestIssue,
      nextStatus: entry.status,
      abortReason: null,
      cleanupOnExit: entry.cleanupOnExit,
    };
  });
}

export interface QueueProjectionInput {
  issues: readonly Issue[];
  canDispatchIssue: (issue: Issue) => boolean;
  resolveModelSelection: (identifier: string) => ModelSelection;
  previousQueuedIssueIds?: ReadonlySet<string>;
  visibleQueueLimit?: number;
}

export interface QueueProjectionResult {
  queuedViews: RuntimeIssueView[];
  detailViews: Map<string, RuntimeIssueView>;
  queuedEvents: RecentEvent[];
}

export function projectQueueAndDetailViews(input: QueueProjectionInput): QueueProjectionResult {
  const sortedIssues = sortIssuesForDispatch(input.issues);
  const dispatchableIssues = sortedIssues.filter((issue) => input.canDispatchIssue(issue));
  const previousQueuedIssueIds = input.previousQueuedIssueIds ?? new Set<string>();
  const visibleQueuedIssues = dispatchableIssues.slice(0, input.visibleQueueLimit ?? 50);
  const queuedViews = visibleQueuedIssues.map((issue) => {
    const selection = input.resolveModelSelection(issue.identifier);
    return issueView(issue, {
      status: "queued",
      configuredModel: selection.model,
      configuredReasoningEffort: selection.reasoningEffort,
      configuredModelSource: selection.source,
      modelChangePending: false,
      model: selection.model,
      reasoningEffort: selection.reasoningEffort,
      modelSource: selection.source,
    });
  });

  const detailViews = new Map<string, RuntimeIssueView>();
  for (const issue of sortedIssues) {
    const selection = input.resolveModelSelection(issue.identifier);
    detailViews.set(
      issue.identifier,
      issueView(issue, {
        configuredModel: selection.model,
        configuredReasoningEffort: selection.reasoningEffort,
        configuredModelSource: selection.source,
        modelChangePending: false,
        model: selection.model,
        reasoningEffort: selection.reasoningEffort,
        modelSource: selection.source,
      }),
    );
  }

  const queuedEvents = visibleQueuedIssues
    .filter((issue) => !previousQueuedIssueIds.has(issue.id))
    .map((issue) =>
      createLifecycleEvent({
        issue,
        event: "issue_queued",
        message: "Issue queued for dispatch",
        metadata: {
          state: issue.state,
          priority: issue.priority,
        },
      }),
    );

  return { queuedViews, detailViews, queuedEvents };
}

export interface CompletedClaimsSeedResult {
  claimedIssueIds: Set<string>;
  completedViews: Map<string, RuntimeIssueView>;
  seededCount: number;
}

export function createLifecycleState(markDirty: () => void): LifecycleState {
  return {
    running: false,
    runningEntries: new Map(),
    retryEntries: new Map(),
    completedViews: new Map(),
    detailViews: new Map(),
    claimedIssueIds: new Set(),
    queuedViews: [],
    recentEvents: [],
    rateLimits: null,
    issueModelOverrides: new Map(),
    issueTemplateOverrides: new Map(),
    operatorAbortSuppressions: new Map(),
    sessionUsageTotals: new Map(),
    codexTotals: { inputTokens: 0, outputTokens: 0, totalTokens: 0, secondsRunning: 0 },
    stallEvents: [],
    markDirty,
  };
}

export function releaseIssueClaimInState(state: LifecycleState, issueId: string): boolean {
  const deleted = state.claimedIssueIds.delete(issueId);
  if (deleted) {
    state.markDirty();
  }
  return deleted;
}

export function claimIssueInState(state: LifecycleState, issueId: string): void {
  state.claimedIssueIds.add(issueId);
  state.markDirty();
}

export function setQueuedViewsInState(state: LifecycleState, views: RuntimeIssueView[]): void {
  state.queuedViews = views;
  state.markDirty();
}

export function setRateLimitsInState(state: LifecycleState, rateLimits: unknown): void {
  state.rateLimits = rateLimits;
  state.markDirty();
}

export function setDetailViewInState(
  state: LifecycleState,
  identifier: string,
  view: RuntimeIssueView,
): RuntimeIssueView {
  state.detailViews.set(identifier, view);
  state.markDirty();
  return view;
}

export function setCompletedViewInState(
  state: LifecycleState,
  identifier: string,
  view: RuntimeIssueView,
): RuntimeIssueView {
  state.completedViews.set(identifier, view);
  state.markDirty();
  return view;
}

export function pushRecentEventInState(
  state: LifecycleState,
  event: RuntimeEventRecord,
  maxRecentEvents = MAX_RECENT_EVENTS,
): void {
  state.recentEvents.push({
    at: event.at,
    issueId: event.issueId,
    issueIdentifier: event.issueIdentifier,
    sessionId: event.sessionId,
    event: event.event,
    message: event.message,
    content: event.content ?? null,
    metadata: event.metadata ?? null,
  });
  if (state.recentEvents.length > maxRecentEvents) {
    state.recentEvents.splice(0, state.recentEvents.length - maxRecentEvents);
  }
}

function applyAbsoluteUsageEventInState(state: LifecycleState, entry: RunningEntry, usage: TokenUsageSnapshot): void {
  const previous = entry.sessionId ? (state.sessionUsageTotals.get(entry.sessionId) ?? null) : null;
  const delta = {
    inputTokens: Math.max(0, usage.inputTokens - (previous?.inputTokens ?? 0)),
    outputTokens: Math.max(0, usage.outputTokens - (previous?.outputTokens ?? 0)),
    totalTokens: Math.max(0, usage.totalTokens - (previous?.totalTokens ?? 0)),
  };
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
}

function applyDeltaUsageEventInState(state: LifecycleState, entry: RunningEntry, usage: TokenUsageSnapshot): void {
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

export function applyUsageEventInState(
  state: LifecycleState,
  entry: RunningEntry,
  usage: TokenUsageSnapshot,
  usageMode: "absolute_total" | "delta",
): void {
  if (usageMode === "absolute_total") {
    applyAbsoluteUsageEventInState(state, entry, usage);
    return;
  }

  applyDeltaUsageEventInState(state, entry, usage);
}

function attemptStatusToLinearState(status: string): string {
  switch (status) {
    case "completed":
      return "Done";
    case "failed":
    case "timed_out":
    case "stalled":
    case "cancelled":
      return "Canceled";
    default:
      return status;
  }
}

export function attemptToCompletedView(attempt: AttemptRecord): RuntimeIssueView {
  return {
    issueId: attempt.issueId,
    identifier: attempt.issueIdentifier,
    title: attempt.title,
    state: attemptStatusToLinearState(attempt.status),
    workspaceKey: attempt.workspaceKey,
    workspacePath: attempt.workspacePath,
    message: attempt.errorMessage,
    status: attempt.status,
    updatedAt: attempt.endedAt ?? attempt.startedAt,
    attempt: attempt.attemptNumber,
    error: attempt.errorCode,
    model: attempt.model,
    reasoningEffort: attempt.reasoningEffort,
    modelSource: attempt.modelSource,
    tokenUsage: attempt.tokenUsage,
    startedAt: attempt.startedAt,
    pullRequestUrl: attempt.pullRequestUrl,
  };
}

export function seedCompletedClaimsFromAttempts(attempts: readonly AttemptRecord[]): CompletedClaimsSeedResult {
  const latestByIssue = new Map<string, AttemptRecord>();
  for (const attempt of attempts) {
    const existing = latestByIssue.get(attempt.issueIdentifier);
    if (!existing || attempt.startedAt > existing.startedAt) {
      latestByIssue.set(attempt.issueIdentifier, attempt);
    }
  }

  const claimedIssueIds = new Set<string>();
  const completedViews = new Map<string, RuntimeIssueView>();

  for (const attempt of latestByIssue.values()) {
    if (attempt.status === "completed") {
      claimedIssueIds.add(attempt.issueId);
    }
    if (TERMINAL_ATTEMPT_STATUSES.has(attempt.status)) {
      completedViews.set(attempt.issueIdentifier, attemptToCompletedView(attempt));
    }
  }

  return {
    claimedIssueIds,
    completedViews,
    seededCount: completedViews.size,
  };
}
