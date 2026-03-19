import {
  updateIssueModelSelection,
  resolveModelSelection as resolveModelSelectionFromConfig,
} from "./model-selection.js";
import {
  reconcileRunningAndRetrying as reconcileRunningAndRetryingState,
  refreshQueueViews as refreshQueueViewsState,
} from "./lifecycle.js";
import { launchAvailableWorkers as launchAvailableWorkersState } from "./worker-launcher.js";
import { buildAttemptDetail, buildIssueDetail, buildSnapshot } from "./snapshot-builder.js";
import { buildCtx, cleanupTerminalWorkspaces, type OrchestratorState } from "./orchestrator-delegates.js";
import type { OrchestratorDeps } from "./runtime-types.js";
import { nowIso } from "./views.js";
import type { ModelSelection, ReasoningEffort, RuntimeSnapshot } from "../core/types.js";
import { globalMetrics } from "../observability/metrics.js";

export class Orchestrator {
  private readonly _state: OrchestratorState;
  private tickInFlight = false;
  private nextTickTimer: NodeJS.Timeout | null = null;
  private refreshQueued = false;

  constructor(private readonly deps: OrchestratorDeps) {
    this._state = {
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
      sessionUsageTotals: new Map(),
      codexTotals: { inputTokens: 0, outputTokens: 0, totalTokens: 0, secondsRunning: 0 },
    };
  }

  private ctx() {
    return buildCtx(this._state, this.deps);
  }

  async start(): Promise<void> {
    if (this._state.running) return;
    this._state.running = true;
    await cleanupTerminalWorkspaces(this._state, this.deps);
    this.scheduleTick(0);
  }

  async stop(): Promise<void> {
    this._state.running = false;
    if (this.nextTickTimer) {
      clearTimeout(this.nextTickTimer);
      this.nextTickTimer = null;
    }
    for (const retry of this._state.retryEntries.values()) {
      if (retry.timer) clearTimeout(retry.timer);
    }
    this._state.retryEntries.clear();
    this._state.claimedIssueIds.clear();
    const workers = [...this._state.runningEntries.values()];
    for (const worker of workers) worker.abortController.abort("shutdown");
    await Promise.allSettled(workers.map((w) => w.promise));
  }

  requestRefresh(reason: string): { queued: boolean; coalesced: boolean; requestedAt: string } {
    const requestedAt = nowIso();
    const coalesced = this.refreshQueued;
    this.refreshQueued = true;
    this.deps.logger.info({ reason, requestedAt }, "refresh requested");
    this.scheduleTick(0);
    return { queued: !coalesced, coalesced, requestedAt };
  }

  getSnapshot(): RuntimeSnapshot {
    const cb = this.snapshotCallbacks();
    return buildSnapshot({ attemptStore: this.deps.attemptStore }, cb);
  }

  getIssueDetail(identifier: string): Record<string, unknown> | null {
    const detail = buildIssueDetail(identifier, { attemptStore: this.deps.attemptStore }, this.snapshotCallbacks());
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
        getConfig: () => this.deps.configStore.getConfig(),
        getIssueDetail: (id) => this.getIssueDetail(id),
        issueModelOverrides: this._state.issueModelOverrides,
        runningEntries: this._state.runningEntries,
        retryEntries: this._state.retryEntries,
        pushEvent: (event) => this.ctx().pushEvent(event),
        requestRefresh: (r) => this.requestRefresh(r),
      },
      input,
    );
  }

  private scheduleTick(delayMs: number): void {
    if (!this._state.running || this.tickInFlight) return;
    if (this.nextTickTimer) clearTimeout(this.nextTickTimer);
    this.nextTickTimer = setTimeout(() => {
      this.nextTickTimer = null;
      void this.tick();
    }, delayMs);
  }

  private async tick(): Promise<void> {
    if (!this._state.running || this.tickInFlight) return;
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
      const delayMs = this.refreshQueued ? 0 : this.deps.configStore.getConfig().polling.intervalMs;
      this.refreshQueued = false;
      if (this._state.running) this.scheduleTick(delayMs);
    }
  }

  private snapshotCallbacks() {
    return {
      getConfig: () => this.deps.configStore.getConfig(),
      resolveModelSelection: (identifier: string) =>
        resolveModelSelectionFromConfig(this._state.issueModelOverrides, this.deps.configStore.getConfig(), identifier),
      getDetailViews: () => this._state.detailViews,
      getCompletedViews: () => this._state.completedViews,
      getRunningEntries: () => this._state.runningEntries,
      getRetryEntries: () => this._state.retryEntries,
      getQueuedViews: () => this._state.queuedViews,
      getRecentEvents: () => this._state.recentEvents,
      getRateLimits: () => this._state.rateLimits,
      getCodexTotals: () => this._state.codexTotals,
    };
  }
}
