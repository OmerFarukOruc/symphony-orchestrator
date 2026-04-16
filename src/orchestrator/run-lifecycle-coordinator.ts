import type {
  Issue,
  RuntimeSnapshot,
  ModelSelection,
  RecentEvent,
  RunOutcome,
  RuntimeIssueView,
  SystemHealth,
  TokenUsageSnapshot,
  Workspace,
} from "../core/types.js";
import type { RuntimeEventRecord } from "../core/lifecycle-events.js";
import type { NotificationEvent } from "../notification/channel.js";
import type { OrchestratorDeps, RetryRuntimeEntry, RunningEntry } from "./runtime-types.js";
import type { OrchestratorContext } from "./context.js";
import type { OutcomeViewInput } from "./outcome-view-builder.js";
import { createRuntimeReadModel } from "./snapshot-builder.js";
import type {
  AttemptDetailView,
  IssueDetailView,
  RuntimeReadModel,
  SnapshotBuilderCallbacks,
} from "./snapshot-builder.js";

import { nowIso, usageDelta } from "./views.js";
import { resolveModelSelection as resolveModelSelectionFromConfig } from "./model-selection.js";
import { buildOutcomeView as buildProjectedOutcomeView } from "./outcome-view-builder.js";
import { createRetryCoordinator } from "./retry-coordinator.js";
import {
  reconcileRunningAndRetrying as reconcileRunningAndRetryingState,
  refreshQueueViews as refreshQueueViewsState,
  cleanupTerminalIssueWorkspaces as cleanupTerminalIssueWorkspacesState,
} from "./lifecycle.js";
import {
  canDispatchIssue as canDispatchIssueState,
  hasAvailableStateSlot as hasAvailableStateSlotState,
  launchAvailableWorkers as launchAvailableWorkersState,
  launchWorker as launchWorkerState,
  buildIssueDispatchFingerprint,
} from "./worker-launcher.js";
import { handleWorkerFailure } from "./worker-failure.js";
import { handleWorkerOutcome } from "./worker-outcome/index.js";
import { executeGitPostRun } from "./git-post-run.js";
import { writeCompletionWriteback, writeFailureWriteback } from "./worker-outcome/completion-writeback.js";
import { detectAndKillStalledWorkers, type StallEvent } from "./stall-detector.js";
import { createMetricsCollector } from "../observability/metrics.js";
import { toErrorString } from "../utils/type-guards.js";
import type { StopSignal } from "../core/signal-detection.js";
import type { PreparedWorkerOutcome, TerminalPathKind } from "./worker-outcome/types.js";
import { issueRef, outcomeToStatus } from "./worker-outcome/types.js";
import type { UpsertPrInput } from "../core/attempt-store-port.js";

const MAX_RECENT_EVENTS = 250;

export interface RunLifecycleCoordinator {
  getContext(): OrchestratorContext;
  cleanupTerminalWorkspaces(): Promise<void>;
  reconcileRunningAndRetrying(): Promise<boolean>;
  refreshQueueViews(candidateIssues?: Issue[]): Promise<void>;
  launchAvailableWorkers(candidateIssues?: Issue[]): Promise<void>;
  buildSnapshot(): RuntimeSnapshot;
  buildIssueDetail(identifier: string): IssueDetailView | null;
  buildAttemptDetail(attemptId: string): AttemptDetailView | null;
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

export interface RunLifecycleReadModelDeps {
  getSystemHealth?: () => SystemHealth | null;
}

export function createRunLifecycleCoordinator(
  state: OrchestratorState,
  deps: OrchestratorDeps,
  readModelDeps: RunLifecycleReadModelDeps = {},
): RunLifecycleCoordinator {
  return new RunLifecycleCoordinatorImpl(state, deps, readModelDeps);
}

class RunLifecycleCoordinatorImpl implements RunLifecycleCoordinator {
  private readonly ctx: OrchestratorContext;
  private readonly readModel: RuntimeReadModel;

  constructor(
    private readonly state: OrchestratorState,
    private readonly deps: OrchestratorDeps,
    private readonly readModelDeps: RunLifecycleReadModelDeps,
  ) {
    this.ctx = this.buildContext();
    this.readModel = createRuntimeReadModel({ attemptStore: deps.attemptStore }, this.snapshotCallbacks());
    this.ctx.retryCoordinator = createRetryCoordinator(
      {
        tracker: deps.tracker,
        attemptStore: deps.attemptStore,
        workspaceManager: deps.workspaceManager,
        logger: deps.logger,
      },
      this.ctx,
    );
  }

  getContext(): OrchestratorContext {
    return this.ctx;
  }

  async cleanupTerminalWorkspaces(): Promise<void> {
    await cleanupTerminalIssueWorkspacesState(this.ctx);
  }

  async reconcileRunningAndRetrying(): Promise<boolean> {
    return reconcileRunningAndRetryingState(this.ctx);
  }

  async refreshQueueViews(candidateIssues?: Issue[]): Promise<void> {
    await refreshQueueViewsState(this.ctx, candidateIssues);
  }

  async launchAvailableWorkers(candidateIssues?: Issue[]): Promise<void> {
    await launchAvailableWorkersState(this.ctx, candidateIssues);
  }

  buildSnapshot(): RuntimeSnapshot {
    return this.readModel.buildSnapshot();
  }

  buildIssueDetail(identifier: string): IssueDetailView | null {
    return this.readModel.buildIssueDetail(identifier);
  }

  buildAttemptDetail(attemptId: string): AttemptDetailView | null {
    return this.readModel.buildAttemptDetail(attemptId);
  }

  private buildContext(): OrchestratorContext {
    const ctx = {
      deps: this.deps,
      getConfig: () => this.deps.configStore.getConfig(),
      isRunning: () => this.state.running,
      resolveModelSelection: (identifier) =>
        resolveModelSelectionFromConfig(this.state.issueModelOverrides, this.deps.configStore.getConfig(), identifier),
      releaseIssueClaim: (issueId) => {
        const deleted = this.state.claimedIssueIds.delete(issueId);
        if (deleted) {
          this.state.markDirty();
        }
      },
      suppressIssueDispatch: (issue) =>
        this.state.operatorAbortSuppressions?.set(issue.id, buildIssueDispatchFingerprint(issue)),
      claimIssue: (issueId) => {
        this.state.claimedIssueIds.add(issueId);
        this.state.markDirty();
      },
      markDirty: () => this.state.markDirty(),
      notify: (event) => this.notifyChannel(event),
      pushEvent: (event) => this.pushEvent(event),
      retryCoordinator: undefined as unknown as OrchestratorContext["retryCoordinator"],
      buildOutcomeView: (input) => this.buildOutcomeView(input),
      setDetailView: (identifier, view) => this.setDetailView(identifier, view),
      setCompletedView: (identifier, view) => this.setCompletedView(identifier, view),
      finalizeTerminalPath: async (kind, prepared) => this.finalizeTerminalPath(kind, prepared),
      finalizeStopSignal: async (stopSignal, prepared, turnCount) =>
        this.finalizeStopSignal(stopSignal, prepared, turnCount),
      launchWorker: async (issue, attempt, options) => {
        await launchWorkerState(
          {
            ...ctx,
            handleWorkerPromise: (promise, workerIssue, workspace, entry, workerAttempt) =>
              this.handleWorkerPromise(promise, workerIssue, workspace, entry, workerAttempt),
          },
          issue,
          attempt,
          options,
        );
        this.deps.eventBus?.emit("issue.started", {
          issueId: issue.id,
          identifier: issue.identifier,
          attempt,
        });
      },
      canDispatchIssue: (issue) =>
        canDispatchIssueState(
          issue,
          this.deps.configStore.getConfig(),
          this.state.claimedIssueIds,
          this.state.operatorAbortSuppressions,
        ),
      hasAvailableStateSlot: (issue, pendingStateCounts, runningStateCounts) =>
        hasAvailableStateSlotState(
          issue,
          this.deps.configStore.getConfig(),
          this.state.runningEntries,
          pendingStateCounts,
          runningStateCounts,
        ),
      getQueuedViews: () => this.state.queuedViews,
      setQueuedViews: (views) => {
        this.state.queuedViews = views;
        this.state.markDirty();
      },
      applyUsageEvent: (entry, usage, usageMode) => this.applyUsageEvent(entry, usage, usageMode),
      setRateLimits: (rateLimits) => {
        this.state.rateLimits = rateLimits;
        this.state.markDirty();
      },
      getStallEvents: () => this.state.stallEvents,
      detectAndKillStalled: () => this.detectAndKillStalled(),
      eventBus: this.deps.eventBus,
    } as OrchestratorContext;

    Object.defineProperties(ctx, {
      running: {
        enumerable: true,
        get: () => this.state.running,
      },
      runningEntries: {
        enumerable: true,
        get: () => this.state.runningEntries,
      },
      retryEntries: {
        enumerable: true,
        get: () => this.state.retryEntries,
      },
      completedViews: {
        enumerable: true,
        get: () => this.state.completedViews,
      },
      detailViews: {
        enumerable: true,
        get: () => this.state.detailViews,
      },
      claimedIssueIds: {
        enumerable: true,
        get: () => this.state.claimedIssueIds,
      },
      queuedViews: {
        enumerable: true,
        get: () => this.state.queuedViews,
      },
    });

    return ctx;
  }

  private notifyChannel(event: NotificationEvent): void {
    if (!this.deps.notificationManager) {
      return;
    }
    void this.deps.notificationManager.notify(event);
  }

  private buildOutcomeView(input: OutcomeViewInput): RuntimeIssueView {
    return buildProjectedOutcomeView(
      input.issue,
      input.workspace,
      input.entry,
      input.configuredSelection,
      input.overrides,
    );
  }

  private setDetailView(identifier: string, view: RuntimeIssueView): RuntimeIssueView {
    this.state.detailViews.set(identifier, view);
    this.state.markDirty();
    return view;
  }

  private setCompletedView(identifier: string, view: RuntimeIssueView): RuntimeIssueView {
    this.state.completedViews.set(identifier, view);
    this.state.markDirty();
    return view;
  }

  private async finalizeTerminalPath(kind: TerminalPathKind, prepared: PreparedWorkerOutcome): Promise<void> {
    if (kind === "service_stopped") {
      this.finalizeServiceStopped(prepared);
      return;
    }

    if (kind === "terminal_cleanup") {
      await this.finalizeTerminalCleanupOutcome(prepared);
      return;
    }

    if (kind === "inactive_issue") {
      this.finalizeInactiveIssue(prepared);
      return;
    }

    if (kind === "operator_abort") {
      this.finalizeOperatorAbort(prepared);
      return;
    }

    await this.finalizeCancelledOrHardFailure(prepared);
  }

  private finalizeServiceStopped(prepared: PreparedWorkerOutcome): void {
    const { outcome, entry, latestIssue: issue, workspace, modelSelection, attempt } = prepared;
    const message = outcome.errorMessage ?? "service stopped before the worker completed";
    this.notifyChannel({
      type: "worker_failed",
      severity: "critical",
      timestamp: nowIso(),
      message,
      issue: issueRef(issue),
      attempt,
    });
    this.ctx.releaseIssueClaim(issue.id);
    this.setCompletedView(
      issue.identifier,
      this.buildOutcomeView({
        issue,
        workspace,
        entry,
        configuredSelection: modelSelection,
        overrides: {
          status: "cancelled",
          attempt,
          error: outcome.errorMessage,
          message,
        },
      }),
    );
    this.deps.eventBus?.emit("issue.completed", {
      issueId: issue.id,
      identifier: issue.identifier,
      outcome: "cancelled",
    });
  }

  private async finalizeTerminalCleanupOutcome(prepared: PreparedWorkerOutcome): Promise<void> {
    const { outcome, entry, latestIssue: issue, workspace, modelSelection, attempt } = prepared;
    const removalResult = await this.removeWorkspaceWithLogging(issue.identifier, issue);
    await this.recordAutoCommitCleanup(entry, issue, outcome, removalResult?.autoCommitSha ?? null);
    this.setCompletedView(
      issue.identifier,
      this.buildOutcomeView({
        issue,
        workspace,
        entry,
        configuredSelection: modelSelection,
        overrides: {
          status: outcomeToStatus(outcome.kind),
          attempt,
          error: outcome.errorMessage ?? outcome.errorCode,
          message: removalResult?.preserved
            ? "workspace preserved after cleanup protection triggered"
            : "workspace cleaned after terminal state",
        },
      }),
    );
    this.deps.eventBus?.emit("issue.completed", {
      issueId: issue.id,
      identifier: issue.identifier,
      outcome: outcomeToStatus(outcome.kind),
    });
    this.ctx.releaseIssueClaim(issue.id);
  }

  private finalizeInactiveIssue(prepared: PreparedWorkerOutcome): void {
    const { entry, latestIssue: issue, workspace, modelSelection } = prepared;
    this.setCompletedView(
      issue.identifier,
      this.buildOutcomeView({
        issue,
        workspace,
        entry,
        configuredSelection: modelSelection,
        overrides: {
          status: "paused",
          message: "issue is no longer active",
        },
      }),
    );
    this.deps.eventBus?.emit("issue.completed", {
      issueId: issue.id,
      identifier: issue.identifier,
      outcome: "paused",
    });
    this.ctx.releaseIssueClaim(issue.id);
  }

  private finalizeOperatorAbort(prepared: PreparedWorkerOutcome): void {
    const { outcome, entry, latestIssue: issue, workspace, modelSelection, attempt } = prepared;
    const message = outcome.errorMessage ?? "worker cancelled by operator request";
    this.notifyChannel({
      type: "worker_failed",
      severity: "info",
      timestamp: nowIso(),
      message,
      issue: issueRef(issue),
      attempt,
      metadata: { errorCode: outcome.errorCode },
    });
    this.setCompletedView(
      issue.identifier,
      this.buildOutcomeView({
        issue,
        workspace,
        entry,
        configuredSelection: modelSelection,
        overrides: {
          status: "cancelled",
          attempt,
          error: outcome.errorCode,
          message,
        },
      }),
    );
    this.deps.eventBus?.emit("issue.completed", {
      issueId: issue.id,
      identifier: issue.identifier,
      outcome: "cancelled",
    });
    this.ctx.suppressIssueDispatch?.(issue);
    this.ctx.releaseIssueClaim(issue.id);
  }

  private async finalizeCancelledOrHardFailure(prepared: PreparedWorkerOutcome): Promise<void> {
    const { outcome, entry, latestIssue: issue, workspace, modelSelection, attempt } = prepared;
    const errorReason = outcome.errorMessage ?? outcome.errorCode ?? "worker stopped without a retry";
    this.notifyChannel({
      type: "worker_failed",
      severity: "critical",
      timestamp: nowIso(),
      message: errorReason,
      issue: issueRef(issue),
      attempt,
      metadata: { errorCode: outcome.errorCode },
    });
    this.setCompletedView(
      issue.identifier,
      this.buildOutcomeView({
        issue,
        workspace,
        entry,
        configuredSelection: modelSelection,
        overrides: {
          status: outcomeToStatus(outcome.kind),
          attempt,
          error: outcome.errorCode,
          message: errorReason,
        },
      }),
    );
    this.deps.eventBus?.emit("issue.completed", {
      issueId: issue.id,
      identifier: issue.identifier,
      outcome: outcomeToStatus(outcome.kind),
    });
    this.ctx.releaseIssueClaim(issue.id);
    await writeFailureWriteback(this.ctx, {
      issue,
      entry,
      attemptCount: attempt,
      errorReason,
    });
  }

  private async finalizeStopSignal(
    stopSignal: StopSignal,
    prepared: PreparedWorkerOutcome,
    turnCount: number | null,
  ): Promise<void> {
    const { entry, latestIssue: issue, workspace, modelSelection, attempt } = prepared;
    const { pullRequestUrl, summary } = await this.runGitPostRun(stopSignal, entry, workspace, issue);

    await this.deps.attemptStore
      .updateAttempt(entry.runId, {
        stopSignal,
        pullRequestUrl,
        summary,
        status: stopSignal === "blocked" ? "paused" : "completed",
      })
      .catch((error) => {
        this.deps.logger.info(
          { attempt_id: entry.runId, error: toErrorString(error) },
          "attempt update failed after stop signal (non-fatal)",
        );
      });

    if (pullRequestUrl) {
      this.deps.logger.info({ issue_identifier: issue.identifier, url: pullRequestUrl }, "pull request created");
      this.registerPrForMonitoring(entry, issue, pullRequestUrl).catch((error) => {
        this.deps.logger.warn(
          { issue_identifier: issue.identifier, error: toErrorString(error) },
          "PR registration for monitoring failed (non-fatal)",
        );
      });
    }

    const isBlocked = stopSignal === "blocked";
    const statusMessage = isBlocked ? "worker reported issue blocked" : "worker reported issue complete";
    this.setCompletedView(
      issue.identifier,
      this.buildOutcomeView({
        issue,
        workspace,
        entry,
        configuredSelection: modelSelection,
        overrides: {
          status: isBlocked ? "paused" : "completed",
          attempt,
          message: statusMessage,
          pullRequestUrl,
        },
      }),
    );
    this.notifyChannel({
      type: isBlocked ? "worker_failed" : "worker_completed",
      severity: isBlocked ? "critical" : "info",
      timestamp: nowIso(),
      message: statusMessage,
      issue: issueRef(issue),
      attempt,
      metadata: { workspace: workspace.path, pullRequestUrl },
    });
    this.deps.eventBus?.emit("issue.completed", {
      issueId: issue.id,
      identifier: issue.identifier,
      outcome: isBlocked ? "paused" : "completed",
    });
    if (isBlocked) {
      this.ctx.releaseIssueClaim(issue.id);
    }

    const transitionedState = await writeCompletionWriteback(this.ctx, {
      issue,
      entry,
      attempt,
      stopSignal,
      pullRequestUrl,
      turnCount,
    }).catch((error) => {
      this.deps.logger.warn(
        { issue_identifier: issue.identifier, error: toErrorString(error) },
        "completion writeback failed (non-fatal)",
      );
      return null;
    });

    if (transitionedState) {
      const view = this.state.completedViews.get(issue.identifier);
      if (view) {
        view.state = transitionedState;
      }
    }
  }

  private snapshotCallbacks(): SnapshotBuilderCallbacks {
    return {
      getConfig: () => this.deps.configStore.getConfig(),
      resolveModelSelection: (identifier: string) => this.ctx.resolveModelSelection(identifier),
      getDetailViews: () => this.state.detailViews,
      getCompletedViews: () => this.state.completedViews,
      getRunningEntries: () => this.state.runningEntries,
      getRetryEntries: () => this.state.retryEntries,
      getQueuedViews: () => this.state.queuedViews,
      getRecentEvents: () => this.state.recentEvents,
      getRateLimits: () => this.state.rateLimits,
      getCodexTotals: () => this.state.codexTotals,
      getStallEvents: () => this.state.stallEvents,
      getTemplateOverride: (identifier: string) => this.state.issueTemplateOverrides.get(identifier) ?? null,
      getTemplateName: (templateId: string) => this.deps.templateStore?.get(templateId)?.name ?? null,
      getSystemHealth: () => this.readModelDeps.getSystemHealth?.() ?? null,
      getWebhookHealth: () => {
        const tracker = this.deps.webhookHealthTracker;
        if (!tracker) {
          return undefined;
        }
        const health = tracker.getHealth();
        return {
          status: health.status,
          effectiveIntervalMs: health.effectiveIntervalMs,
          stats: health.stats,
          lastDeliveryAt: health.lastDeliveryAt,
          lastEventType: health.lastEventType,
        };
      },
    };
  }

  private pushEvent(event: RuntimeEventRecord): void {
    pushRecentEvent(this.state, event);
    this.state.markDirty();
    forwardToEventBus(this.deps, event);
  }

  private async runGitPostRun(
    stopSignal: StopSignal,
    entry: RunningEntry,
    workspace: Workspace,
    issue: Issue,
  ): Promise<{ pullRequestUrl: string | null; summary: string | null }> {
    if (stopSignal !== "done" || !entry.repoMatch || !this.deps.gitManager) {
      return { pullRequestUrl: null, summary: null };
    }

    try {
      const result = await executeGitPostRun(this.deps.gitManager, workspace, issue, entry.repoMatch);
      return { pullRequestUrl: result.pullRequestUrl, summary: result.summary };
    } catch (error) {
      this.deps.logger.info(
        { issue_identifier: issue.identifier, error: toErrorString(error) },
        "git post-run failed after DONE — completing issue anyway",
      );
      return { pullRequestUrl: null, summary: null };
    }
  }

  private async registerPrForMonitoring(entry: RunningEntry, issue: Issue, pullRequestUrl: string): Promise<void> {
    const repoMatch = entry.repoMatch;
    if (!repoMatch) {
      return;
    }

    const owner = repoMatch.githubOwner ?? null;
    const repoName = repoMatch.githubRepo ?? null;
    if (!owner || !repoName) {
      return;
    }

    const pullNumberMatch = /\/pull\/(\d+)$/.exec(pullRequestUrl);
    if (!pullNumberMatch) {
      return;
    }

    const attemptStore = this.deps.attemptStore;
    if (!attemptStore.upsertPr) {
      this.deps.logger.warn({ issue_identifier: issue.identifier }, "PR registration skipped: upsertPr not available");
      return;
    }

    const pullNumber = parseInt(pullNumberMatch[1], 10);
    const now = new Date().toISOString();
    const input: UpsertPrInput = {
      issueId: issue.id,
      owner,
      repo: repoName,
      pullNumber,
      url: pullRequestUrl,
      attemptId: entry.runId,
      status: "open",
      createdAt: now,
      updatedAt: now,
      branchName: issue.branchName ?? "",
    };

    await attemptStore.upsertPr(input);
  }

  private async removeWorkspaceWithLogging(
    issueIdentifier: string,
    issue: Issue,
  ): Promise<{
    preserved?: boolean;
    autoCommitSha?: string | null;
  } | null> {
    if (this.deps.workspaceManager.removeWorkspaceWithResult) {
      return this.deps.workspaceManager.removeWorkspaceWithResult(issueIdentifier, issue).catch((error) => {
        this.deps.logger.info(
          { issue_identifier: issueIdentifier, error: toErrorString(error) },
          "workspace cleanup failed (non-fatal)",
        );
        return null;
      });
    }

    await this.deps.workspaceManager.removeWorkspace(issueIdentifier, issue).catch((error) => {
      this.deps.logger.info(
        { issue_identifier: issueIdentifier, error: toErrorString(error) },
        "workspace cleanup failed (non-fatal)",
      );
    });
    return null;
  }

  private async recordAutoCommitCleanup(
    entry: RunningEntry,
    issue: Issue,
    outcome: RunOutcome,
    autoCommitSha: string | null,
  ): Promise<void> {
    if (!autoCommitSha || !this.deps.attemptStore.appendEvent || !this.deps.attemptStore.appendCheckpoint) {
      return;
    }

    const createdAt = nowIso();
    await this.deps.attemptStore.appendEvent({
      attemptId: entry.runId,
      at: createdAt,
      issueId: issue.id,
      issueIdentifier: issue.identifier,
      sessionId: entry.sessionId,
      event: "workspace_auto_committed",
      message: "Uncommitted workspace changes were auto-committed before cleanup",
      metadata: {
        commitSha: autoCommitSha,
      },
    });
    await this.deps.attemptStore.appendCheckpoint({
      attemptId: entry.runId,
      trigger: "status_transition",
      eventCursor: null,
      status: outcomeToStatus(outcome.kind) as import("../core/types.js").AttemptRecord["status"],
      threadId: entry.sessionId,
      turnId: outcome.turnId,
      turnCount: outcome.turnCount,
      tokenUsage: entry.tokenUsage,
      metadata: {
        autoCommitSha,
      },
      createdAt,
    });
  }

  private applyUsageEvent(entry: RunningEntry, usage: TokenUsageSnapshot, usageMode: "absolute_total" | "delta"): void {
    if (usageMode === "absolute_total") {
      const previous = entry.sessionId ? (this.state.sessionUsageTotals.get(entry.sessionId) ?? null) : null;
      const delta = usageDelta(previous, usage);
      this.state.codexTotals = {
        ...this.state.codexTotals,
        inputTokens: this.state.codexTotals.inputTokens + delta.inputTokens,
        outputTokens: this.state.codexTotals.outputTokens + delta.outputTokens,
        totalTokens: this.state.codexTotals.totalTokens + delta.totalTokens,
      };
      entry.tokenUsage = usage;
      if (entry.sessionId) {
        this.state.sessionUsageTotals.set(entry.sessionId, usage);
      }
      this.state.markDirty();
      return;
    }

    this.state.codexTotals = {
      ...this.state.codexTotals,
      inputTokens: this.state.codexTotals.inputTokens + usage.inputTokens,
      outputTokens: this.state.codexTotals.outputTokens + usage.outputTokens,
      totalTokens: this.state.codexTotals.totalTokens + usage.totalTokens,
    };
    entry.tokenUsage = {
      inputTokens: (entry.tokenUsage?.inputTokens ?? 0) + usage.inputTokens,
      outputTokens: (entry.tokenUsage?.outputTokens ?? 0) + usage.outputTokens,
      totalTokens: (entry.tokenUsage?.totalTokens ?? 0) + usage.totalTokens,
    };
    this.state.markDirty();
  }

  private detectAndKillStalled(): { killed: number } {
    const result = detectAndKillStalledWorkers({
      runningEntries: this.state.runningEntries,
      stallEvents: this.state.stallEvents,
      getConfig: () => this.deps.configStore.getConfig(),
      pushEvent: (event) => {
        pushRecentEvent(this.state, event);
        forwardToEventBus(this.deps, event);
      },
      logger: { warn: (...args) => this.deps.logger.warn(...args) },
    });
    if (result.updatedStallEvents) {
      this.state.stallEvents = result.updatedStallEvents;
    }
    return { killed: result.killed };
  }

  private async handleWorkerPromise(
    promise: Promise<RunOutcome>,
    workerIssue: Issue,
    workspace: Workspace,
    entry: RunningEntry,
    workerAttempt: number | null,
  ): Promise<void> {
    const metrics = this.deps.metrics ?? createMetricsCollector();
    const observer = this.deps.observability?.getComponent("orchestrator");
    await promise
      .then(async (outcome) => {
        await handleWorkerOutcome(this.ctx, outcome, entry, workerIssue, workspace, workerAttempt);
        metrics.agentRunsTotal.increment({ outcome: outcome.kind });
        observer?.recordOperation({
          metric: "worker_completion",
          operation: "worker_outcome",
          outcome: outcome.kind === "failed" ? "failure" : "success",
          correlationId: entry.runId,
          data: {
            issueId: workerIssue.id,
            issueIdentifier: workerIssue.identifier,
            outcome: outcome.kind,
          },
        });
        observer?.setSession(workerIssue.id, {
          status: outcome.kind,
          correlationId: entry.runId,
          metadata: {
            issueIdentifier: workerIssue.identifier,
            workspaceKey: workspace.workspaceKey,
          },
        });
      })
      .catch(async (error) => {
        await handleWorkerFailure(this.ctx, workerIssue, entry, error);
        metrics.agentRunsTotal.increment({ outcome: "failed" });
        observer?.recordOperation({
          metric: "worker_completion",
          operation: "worker_outcome",
          outcome: "failure",
          correlationId: entry.runId,
          reason: toErrorString(error),
          data: {
            issueId: workerIssue.id,
            issueIdentifier: workerIssue.identifier,
          },
        });
        observer?.setSession(workerIssue.id, {
          status: "failed",
          correlationId: entry.runId,
          metadata: {
            issueIdentifier: workerIssue.identifier,
            error: toErrorString(error),
          },
        });
        observer?.setHealth({
          surface: "workers",
          status: "warn",
          reason: `worker failed for ${workerIssue.identifier}`,
        });
      });
  }
}

function pushRecentEvent(state: OrchestratorState, event: RuntimeEventRecord): void {
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
  if (state.recentEvents.length > MAX_RECENT_EVENTS) {
    state.recentEvents.splice(0, state.recentEvents.length - MAX_RECENT_EVENTS);
  }
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
