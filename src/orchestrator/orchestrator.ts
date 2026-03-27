import {
  updateIssueModelSelection,
  resolveModelSelection as resolveModelSelectionFromConfig,
} from "./model-selection.js";
import { Watchdog } from "./watchdog.js";
import {
  reconcileRunningAndRetrying as reconcileRunningAndRetryingState,
  refreshQueueViews as refreshQueueViewsState,
  seedCompletedClaims,
} from "./lifecycle.js";
import { launchAvailableWorkers as launchAvailableWorkersState } from "./worker-launcher.js";
import {
  buildAttemptDetail,
  type AttemptDetailView,
  buildIssueDetail,
  type IssueDetailView,
  buildSnapshot,
} from "./snapshot-builder.js";
import { buildCtx, cleanupTerminalWorkspaces, type OrchestratorState } from "./orchestrator-delegates.js";
import type { OrchestratorPort } from "./port.js";
import type { OrchestratorDeps } from "./runtime-types.js";
import { nowIso } from "./views.js";
import type { ModelSelection, ReasoningEffort, RuntimeSnapshot } from "../core/types.js";
import { toErrorString } from "../utils/type-guards.js";
import { globalMetrics } from "../observability/metrics.js";

export class Orchestrator implements OrchestratorPort {
  private readonly _state: OrchestratorState;
  private tickInFlight = false;
  private nextTickTimer: NodeJS.Timeout | null = null;
  private refreshQueued = false;
  private readonly watchdog: Watchdog;

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
      stallEvents: [],
    };
    this.watchdog = new Watchdog({
      getRunningCount: () => this._state.runningEntries.size,
      getQueuedCount: () => this._state.queuedViews.length,
      getRecentStalls: () => [...this._state.stallEvents],
      logger: deps.logger,
    });
  }

  private ctx() {
    return buildCtx(this._state, this.deps);
  }

  async start(): Promise<void> {
    if (this._state.running) return;
    this._state.running = true;
    this.watchdog.start();
    await cleanupTerminalWorkspaces(this._state, this.deps);
    seedCompletedClaims({
      claimedIssueIds: this._state.claimedIssueIds,
      completedViews: this._state.completedViews,
      deps: { attemptStore: this.deps.attemptStore, logger: this.deps.logger },
    });
    this.scheduleTick(0);
  }

  async stop(): Promise<void> {
    this._state.running = false;
    this.watchdog.stop();
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

  getIssueDetail(identifier: string): IssueDetailView | null {
    const detail = buildIssueDetail(identifier, { attemptStore: this.deps.attemptStore }, this.snapshotCallbacks());
    return detail ? { ...detail } : null;
  }

  getAttemptDetail(attemptId: string): AttemptDetailView | null {
    const detail = buildAttemptDetail(attemptId, { attemptStore: this.deps.attemptStore });
    return detail ? { ...detail } : null;
  }

  abortIssue(
    identifier: string,
  ):
    | { ok: true; alreadyStopping: boolean; requestedAt: string }
    | { ok: false; code: "not_found" | "conflict"; message: string } {
    const entry = [...this._state.runningEntries.values()].find(
      (runningEntry) => runningEntry.issue.identifier === identifier,
    );
    if (!entry) {
      const detail = this.getIssueDetail(identifier);
      if (!detail) {
        return { ok: false, code: "not_found", message: "Unknown issue identifier" };
      }
      return { ok: false, code: "conflict", message: "Issue is not currently running" };
    }

    const requestedAt = nowIso();
    const alreadyStopping = entry.status === "stopping" || entry.abortController.signal.aborted;
    if (!alreadyStopping) {
      entry.status = "stopping";
      this.ctx().pushEvent({
        at: requestedAt,
        issueId: entry.issue.id,
        issueIdentifier: entry.issue.identifier,
        sessionId: entry.sessionId,
        event: "worker_abort_requested",
        message: "operator requested worker abort",
      });
      entry.abortController.abort("operator_abort");
    }

    this.requestRefresh("issue_abort_requested");
    return { ok: true, alreadyStopping, requestedAt };
  }

  async updateIssueModelSelection(input: {
    identifier: string;
    model: string;
    reasoningEffort: ReasoningEffort | null;
  }): Promise<{ updated: boolean; restarted: boolean; appliesNextAttempt: boolean; selection: ModelSelection } | null> {
    const result = await updateIssueModelSelection(
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
    if (result) {
      this.deps.eventBus?.emit("model.updated", {
        identifier: input.identifier,
        model: result.selection.model,
        source: result.selection.source,
      });
    }
    return result;
  }

  async steerIssue(identifier: string, message: string): Promise<{ ok: boolean } | null> {
    const entry = [...this._state.runningEntries.values()].find(
      (runningEntry) => runningEntry.issue.identifier === identifier,
    );
    if (!entry?.steerTurn) return null;
    const ok = await entry.steerTurn(message);
    return { ok };
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
      this.ctx().detectAndKillStalled();
      await reconcileRunningAndRetryingState(this.ctx());
      await refreshQueueViewsState(this.ctx());
      await launchAvailableWorkersState(this.ctx());
      globalMetrics.orchestratorPollsTotal.increment({ status: "ok" });
      this.deps.eventBus?.emit("poll.complete", {
        timestamp: nowIso(),
        issueCount: this._state.queuedViews.length + this._state.runningEntries.size,
      });
    } catch (error) {
      globalMetrics.orchestratorPollsTotal.increment({ status: "error" });
      this.deps.logger.error({ error: toErrorString(error) }, "orchestrator tick failed");
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
      getStallEvents: () => this._state.stallEvents,
      getSystemHealth: () => {
        const h = this.watchdog.getHealth();
        return { status: h.status, checkedAt: h.checkedAt, runningCount: h.runningCount, message: h.message };
      },
    };
  }
}
