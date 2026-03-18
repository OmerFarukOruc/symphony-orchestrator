import {
  updateIssueModelSelection,
  resolveModelSelection as resolveModelSelectionFromConfig,
} from "./model-selection.js";
import {
  clearRetryEntry as clearRetryEntryState,
  handleRetryLaunchFailure as handleRetryLaunchFailureState,
  queueRetry as queueRetryState,
  revalidateAndLaunchRetry as revalidateAndLaunchRetryState,
} from "./retry-manager.js";
import {
  cleanupTerminalIssueWorkspaces as cleanupTerminalIssueWorkspacesState,
  reconcileRunningAndRetrying as reconcileRunningAndRetryingState,
  refreshQueueViews as refreshQueueViewsState,
} from "./lifecycle.js";
import type { OrchestratorDeps, RetryRuntimeEntry, RunningEntry } from "./runtime-types.js";
import { type IssueView, nowIso, usageDelta } from "./views.js";
import { handleWorkerFailure, handleWorkerOutcome } from "./worker-outcome.js";
import {
  canDispatchIssue as canDispatchIssueState,
  hasAvailableStateSlot as hasAvailableStateSlotState,
  launchAvailableWorkers as launchAvailableWorkersState,
  launchWorker as launchWorkerState,
} from "./worker-launcher.js";
import { buildAttemptDetail, buildIssueDetail, buildSnapshot } from "./snapshot-builder.js";
import type { OrchestratorContext } from "./context.js";
import type {
  Issue,
  ModelSelection,
  RecentEvent,
  ReasoningEffort,
  RunOutcome,
  RuntimeSnapshot,
  ServiceConfig,
  TokenUsageSnapshot,
  Workspace,
} from "../core/types.js";
import type { NotificationEvent } from "../notification/channel.js";
import { globalMetrics } from "../observability/metrics.js";

export class Orchestrator {
  private running = false;
  private tickInFlight = false;
  private nextTickTimer: NodeJS.Timeout | null = null;
  private refreshQueued = false;
  private readonly runningEntries = new Map<string, RunningEntry>();
  private readonly retryEntries = new Map<string, RetryRuntimeEntry>();
  private readonly claimedIssueIds = new Set<string>();
  private readonly recentEvents: RecentEvent[] = [];
  private readonly detailViews = new Map<string, IssueView>();
  private readonly completedViews = new Map<string, IssueView>();
  private readonly sessionUsageTotals = new Map<string, TokenUsageSnapshot>();
  private readonly issueModelOverrides = new Map<string, Omit<ModelSelection, "source">>();
  private queuedViews: IssueView[] = [];
  private rateLimits: unknown | null = null;
  private codexTotals = {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    secondsRunning: 0,
  };

  constructor(private readonly deps: OrchestratorDeps) {}

  async start(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    await this.cleanupTerminalIssueWorkspaces();
    this.scheduleTick(0);
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.nextTickTimer) {
      clearTimeout(this.nextTickTimer);
      this.nextTickTimer = null;
    }
    for (const retry of this.retryEntries.values()) {
      if (retry.timer) {
        clearTimeout(retry.timer);
      }
    }
    this.retryEntries.clear();
    this.claimedIssueIds.clear();
    const workers = [...this.runningEntries.values()];
    for (const worker of workers) {
      worker.abortController.abort("shutdown");
    }
    await Promise.allSettled(workers.map((worker) => worker.promise));
  }

  requestRefresh(reason: string): { queued: boolean; coalesced: boolean; requestedAt: string } {
    const requestedAt = nowIso();
    const coalesced = this.refreshQueued;
    this.refreshQueued = true;
    this.deps.logger.info({ reason, requestedAt }, "refresh requested");
    this.scheduleTick(0);
    return {
      queued: !coalesced,
      coalesced,
      requestedAt,
    };
  }

  getSnapshot(): RuntimeSnapshot {
    return buildSnapshot(
      {
        attemptStore: this.deps.attemptStore,
      },
      {
        getConfig: () => this.getConfig(),
        resolveModelSelection: (identifier) => this.resolveModelSelection(identifier),
        getDetailViews: () => this.detailViews,
        getCompletedViews: () => this.completedViews,
        getRunningEntries: () => this.runningEntries,
        getRetryEntries: () => this.retryEntries,
        getQueuedViews: () => this.queuedViews,
        getRecentEvents: () => this.recentEvents,
        getRateLimits: () => this.rateLimits,
        getCodexTotals: () => this.codexTotals,
      },
    );
  }

  getIssueDetail(identifier: string): Record<string, unknown> | null {
    const detail = buildIssueDetail(
      identifier,
      { attemptStore: this.deps.attemptStore },
      {
        getConfig: () => this.getConfig(),
        resolveModelSelection: (issueIdentifier) => this.resolveModelSelection(issueIdentifier),
        getDetailViews: () => this.detailViews,
        getCompletedViews: () => this.completedViews,
        getRunningEntries: () => this.runningEntries,
        getRetryEntries: () => this.retryEntries,
        getQueuedViews: () => this.queuedViews,
        getRecentEvents: () => this.recentEvents,
        getRateLimits: () => this.rateLimits,
        getCodexTotals: () => this.codexTotals,
      },
    );
    return detail ? { ...detail } : null;
  }

  getAttemptDetail(attemptId: string): Record<string, unknown> | null {
    const detail = buildAttemptDetail(attemptId, { attemptStore: this.deps.attemptStore });
    return detail ? { ...detail } : null;
  }

  async updateIssueModelSelection(input: {
    identifier: string;
    model: string;
    reasoningEffort: ReasoningEffort | null;
  }): Promise<{ updated: boolean; restarted: boolean; appliesNextAttempt: boolean; selection: ModelSelection } | null> {
    return updateIssueModelSelection(
      {
        getConfig: () => this.getConfig(),
        getIssueDetail: (identifier) => this.getIssueDetail(identifier),
        issueModelOverrides: this.issueModelOverrides,
        runningEntries: this.runningEntries,
        retryEntries: this.retryEntries,
        pushEvent: (event) => this.pushEvent(event),
        requestRefresh: (reason) => this.requestRefresh(reason),
      },
      input,
    );
  }

  private scheduleTick(delayMs: number): void {
    if (!this.running || this.tickInFlight) {
      return;
    }
    if (this.nextTickTimer) {
      clearTimeout(this.nextTickTimer);
    }
    this.nextTickTimer = setTimeout(() => {
      this.nextTickTimer = null;
      void this.tick();
    }, delayMs);
  }

  private async tick(): Promise<void> {
    if (!this.running || this.tickInFlight) {
      return;
    }
    this.tickInFlight = true;
    try {
      await reconcileRunningAndRetryingState(this.ctx());
      await refreshQueueViewsState(this.ctx());
      await launchAvailableWorkersState(this.ctx());
      globalMetrics.orchestratorPollsTotal.increment({ status: "ok" });
    } catch (error) {
      globalMetrics.orchestratorPollsTotal.increment({ status: "error" });
      this.deps.logger.error({ error: String(error) }, "orchestrator tick failed");
    } finally {
      this.tickInFlight = false;
      const delayMs = this.refreshQueued ? 0 : this.getConfig().polling.intervalMs;
      this.refreshQueued = false;
      if (this.running) {
        this.scheduleTick(delayMs);
      }
    }
  }

  private ctx(): OrchestratorContext {
    return {
      running: this.running,
      runningEntries: this.runningEntries,
      retryEntries: this.retryEntries,
      completedViews: this.completedViews,
      detailViews: this.detailViews,
      claimedIssueIds: this.claimedIssueIds,
      queuedViews: this.queuedViews,
      deps: this.deps,
      getConfig: () => this.getConfig(),
      isRunning: () => this.running,
      resolveModelSelection: (identifier) => this.resolveModelSelection(identifier),
      releaseIssueClaim: (issueId) => this.releaseIssueClaim(issueId),
      claimIssue: (issueId) => this.claimIssue(issueId),
      notify: (event) => this.notify(event),
      pushEvent: (event) => this.pushEvent(event),
      queueRetry: (issue, attempt, delayMs, error) => this.queueRetry(issue, attempt, delayMs, error),
      clearRetryEntry: (issueId) => this.clearRetryEntry(issueId),
      launchWorker: (issue, attempt, options) => this.launchWorker(issue, attempt, options),
      canDispatchIssue: (issue) => this.canDispatchIssue(issue),
      hasAvailableStateSlot: (issue, pendingStateCounts) => this.hasAvailableStateSlot(issue, pendingStateCounts),
      revalidateAndLaunchRetry: (issueId, attempt) => this.revalidateAndLaunchRetry(issueId, attempt),
      handleRetryLaunchFailure: (issue, attempt, error) => this.handleRetryLaunchFailure(issue, attempt, error),
      getQueuedViews: () => this.queuedViews,
      setQueuedViews: (views) => {
        this.queuedViews = views;
      },
      applyUsageEvent: (entry, usage, usageMode) => this.applyUsageEvent(entry, usage, usageMode),
      setRateLimits: (rateLimits) => {
        this.rateLimits = rateLimits;
      },
    };
  }

  private async launchWorker(issue: Issue, attempt: number | null, options?: { claimHeld?: boolean }): Promise<void> {
    await launchWorkerState(
      {
        ...this.ctx(),
        handleWorkerPromise: (promise, workerIssue, workspace, entry, workerAttempt) =>
          this.handleWorkerPromise(promise, workerIssue, workspace, entry, workerAttempt),
      },
      issue,
      attempt,
      options,
    );
  }

  private async handleWorkerPromise(
    promise: Promise<RunOutcome>,
    workerIssue: Issue,
    workspace: Workspace,
    entry: RunningEntry,
    workerAttempt: number | null,
  ): Promise<void> {
    await promise
      .then(async (outcome) => {
        await handleWorkerOutcome(this.ctx(), outcome, entry, workerIssue, workspace, workerAttempt);
        globalMetrics.agentRunsTotal.increment({ outcome: outcome.kind });
      })
      .catch(async (error) => {
        await handleWorkerFailure(this.ctx(), workerIssue, entry, error);
        globalMetrics.agentRunsTotal.increment({ outcome: "failed" });
      });
  }

  private queueRetry(issue: Issue, attempt: number, delayMs: number, error: string | null): void {
    queueRetryState(this.ctx(), issue, attempt, delayMs, error);
  }

  private async revalidateAndLaunchRetry(issueId: string, attempt: number): Promise<void> {
    await revalidateAndLaunchRetryState(this.ctx(), issueId, attempt);
  }

  private clearRetryEntry(issueId: string): void {
    clearRetryEntryState(this.ctx(), issueId);
  }

  private notify(event: NotificationEvent): void {
    if (!this.deps.notificationManager) {
      return;
    }
    void this.deps.notificationManager.notify(event);
  }

  private pushEvent(event: RecentEvent & { usage?: unknown; rateLimits?: unknown }): void {
    this.recentEvents.unshift({
      at: event.at,
      issueId: event.issueId,
      issueIdentifier: event.issueIdentifier,
      sessionId: event.sessionId,
      event: event.event,
      message: event.message,
      content: event.content ?? null,
    });
    if (this.recentEvents.length > 250) {
      this.recentEvents.length = 250;
    }
  }

  private applyUsageEvent(entry: RunningEntry, usage: TokenUsageSnapshot, usageMode: "absolute_total" | "delta"): void {
    if (usageMode === "absolute_total") {
      const previous = entry.sessionId ? (this.sessionUsageTotals.get(entry.sessionId) ?? null) : null;
      const delta = usageDelta(previous, usage);
      this.codexTotals.inputTokens += delta.inputTokens;
      this.codexTotals.outputTokens += delta.outputTokens;
      this.codexTotals.totalTokens += delta.totalTokens;
      entry.tokenUsage = usage;
      if (entry.sessionId) {
        this.sessionUsageTotals.set(entry.sessionId, usage);
      }
      return;
    }

    this.codexTotals.inputTokens += usage.inputTokens;
    this.codexTotals.outputTokens += usage.outputTokens;
    this.codexTotals.totalTokens += usage.totalTokens;
    entry.tokenUsage = {
      inputTokens: (entry.tokenUsage?.inputTokens ?? 0) + usage.inputTokens,
      outputTokens: (entry.tokenUsage?.outputTokens ?? 0) + usage.outputTokens,
      totalTokens: (entry.tokenUsage?.totalTokens ?? 0) + usage.totalTokens,
    };
  }

  private async cleanupTerminalIssueWorkspaces(): Promise<void> {
    await cleanupTerminalIssueWorkspacesState(this.ctx());
  }

  private canDispatchIssue(issue: Issue): boolean {
    return canDispatchIssueState(issue, this.getConfig(), this.claimedIssueIds);
  }

  private hasAvailableStateSlot(issue: Issue, pendingStateCounts?: Map<string, number>): boolean {
    return hasAvailableStateSlotState(issue, this.getConfig(), this.runningEntries, pendingStateCounts);
  }

  private claimIssue(issueId: string): void {
    this.claimedIssueIds.add(issueId);
  }

  private releaseIssueClaim(issueId: string): void {
    this.claimedIssueIds.delete(issueId);
  }

  private async handleRetryLaunchFailure(issue: Issue, attempt: number, error: unknown): Promise<void> {
    await handleRetryLaunchFailureState(this.ctx(), issue, attempt, error);
  }

  private resolveModelSelection(identifier: string): ModelSelection {
    return resolveModelSelectionFromConfig(this.issueModelOverrides, this.getConfig(), identifier);
  }

  private getConfig(): ServiceConfig {
    return this.deps.configStore.getConfig();
  }
}
