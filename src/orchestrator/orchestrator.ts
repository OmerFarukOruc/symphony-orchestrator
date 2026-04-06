import {
  updateIssueModelSelection,
  resolveModelSelection as resolveModelSelectionFromConfig,
} from "./model-selection.js";
import { sortIssuesForDispatch } from "./dispatch.js";
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
import type { OrchestratorContext } from "./context.js";
import { runStartupRecovery } from "./recovery.js";
import type { OrchestratorPort } from "./port.js";
import type { OrchestratorDeps } from "./runtime-types.js";
import { nowIso } from "./views.js";
import type { ModelSelection, ReasoningEffort, RuntimeSnapshot } from "../core/types.js";
import type { RecoveryReport } from "./recovery-types.js";
import { serializeSnapshot } from "../http/route-helpers.js";
import { toErrorString } from "../utils/type-guards.js";
import { createMetricsCollector } from "../observability/metrics.js";

function clearTrackedCollection(size: number, clear: () => void, onDirty: () => void): void {
  if (size === 0) {
    return;
  }
  clear();
  onDirty();
}

class DirtyTrackingMap<K, V> extends Map<K, V> {
  constructor(private readonly onDirty: () => void) {
    super();
  }

  override set(key: K, value: V): this {
    super.set(key, value);
    this.onDirty();
    return this;
  }

  override delete(key: K): boolean {
    const deleted = super.delete(key);
    if (deleted) {
      this.onDirty();
    }
    return deleted;
  }

  override clear(): void {
    clearTrackedCollection(this.size, () => super.clear(), this.onDirty);
  }
}

class DirtyTrackingSet<T> extends Set<T> {
  constructor(private readonly onDirty: () => void) {
    super();
  }

  override add(value: T): this {
    super.add(value);
    this.onDirty();
    return this;
  }

  override delete(value: T): boolean {
    const deleted = super.delete(value);
    if (deleted) {
      this.onDirty();
    }
    return deleted;
  }

  override clear(): void {
    clearTrackedCollection(this.size, () => super.clear(), this.onDirty);
  }
}

export class Orchestrator implements OrchestratorPort {
  private readonly _state: OrchestratorState;
  private readonly _ctx: OrchestratorContext;
  private tickInFlight = false;
  private nextTickTimer: NodeJS.Timeout | null = null;
  private refreshQueued = false;
  private readonly watchdog: Watchdog;
  private lastRecoveryReport: RecoveryReport | null = null;
  private stateRevision = 0;
  private cachedSnapshot: {
    revision: number;
    snapshot: RuntimeSnapshot;
    serializedState: Record<string, unknown>;
  } | null = null;

  constructor(private readonly deps: OrchestratorDeps) {
    this.deps.metrics ??= createMetricsCollector();
    const markDirty = () => this.markStateDirty();
    this._state = {
      running: false,
      runningEntries: new DirtyTrackingMap(markDirty),
      retryEntries: new DirtyTrackingMap(markDirty),
      completedViews: new DirtyTrackingMap(markDirty),
      detailViews: new DirtyTrackingMap(markDirty),
      claimedIssueIds: new DirtyTrackingSet(markDirty),
      queuedViews: [],
      recentEvents: [],
      rateLimits: null,
      issueModelOverrides: new DirtyTrackingMap(markDirty),
      issueTemplateOverrides: new DirtyTrackingMap(markDirty),
      operatorAbortSuppressions: new Map(),
      sessionUsageTotals: new DirtyTrackingMap(markDirty),
      codexTotals: { inputTokens: 0, outputTokens: 0, totalTokens: 0, secondsRunning: 0 },
      stallEvents: [],
      markDirty,
    };
    // Build once — closures inside the context reference state directly,
    // so mutations are visible without rebuilding the context object.
    this._ctx = buildCtx(this._state, this.deps);
    this.watchdog = new Watchdog({
      getRunningCount: () => this._state.runningEntries.size,
      getQueuedCount: () => this._state.queuedViews.length,
      getRecentStalls: () => [...this._state.stallEvents],
      onHealthUpdated: () => this.markStateDirty(),
      logger: deps.logger,
    });
    this.deps.configStore.subscribe(() => {
      this.markStateDirty();
    });
  }

  private markStateDirty(): void {
    this.stateRevision += 1;
    this.cachedSnapshot = null;
  }

  async start(): Promise<void> {
    if (this._state.running) return;
    this._state.running = true;
    this.markStateDirty();
    this.watchdog.start();
    this.lastRecoveryReport = await runStartupRecovery({
      attemptStore: this.deps.attemptStore,
      tracker: this.deps.tracker,
      workspaceManager: this.deps.workspaceManager,
      getConfig: () => this.deps.configStore.getConfig(),
      launchWorker: (issue, attempt, options) => this._ctx.launchWorker(issue, attempt, options),
      logger: this.deps.logger,
    });
    await cleanupTerminalWorkspaces(this._state, this.deps);
    seedCompletedClaims({
      claimedIssueIds: this._state.claimedIssueIds,
      completedViews: this._state.completedViews,
      deps: { attemptStore: this.deps.attemptStore, logger: this.deps.logger },
    });
    const configRows = this.deps.issueConfigStore.loadAll();
    for (const row of configRows) {
      if (row.model !== null) {
        this._state.issueModelOverrides.set(row.identifier, {
          model: row.model,
          reasoningEffort: (row.reasoningEffort as ReasoningEffort) ?? undefined,
        });
      }
      if (row.templateId !== null) {
        this._state.issueTemplateOverrides.set(row.identifier, row.templateId);
      }
    }
    this.scheduleTick(0);
  }

  async stop(): Promise<void> {
    this._state.running = false;
    this.markStateDirty();
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

  requestTargetedRefresh(issueId: string, issueIdentifier: string, reason: string): void {
    this.deps.logger.info({ issueId, issueIdentifier, reason }, "targeted refresh requested");
    // For now, trigger a full refresh — the orchestrator will coalesce multiple calls.
    // Future: implement issue-specific fetch via tracker.fetchIssueStatesByIds() to avoid full poll.
    this.requestRefresh(reason);
  }

  stopWorkerForIssue(issueIdentifier: string, reason: string): void {
    const entry = [...this._state.runningEntries.values()].find(
      (runningEntry) => runningEntry.issue.identifier === issueIdentifier,
    );
    if (!entry) {
      this.deps.logger.debug({ issueIdentifier, reason }, "stopWorkerForIssue: no running worker found");
      return;
    }
    if (entry.status === "stopping" || entry.abortController.signal.aborted) {
      this.deps.logger.debug({ issueIdentifier, reason }, "stopWorkerForIssue: already stopping");
      return;
    }
    this.deps.logger.info({ issueIdentifier, reason }, "stopping worker via webhook signal");
    entry.status = "stopping";
    this.markStateDirty();
    this._ctx.pushEvent({
      at: nowIso(),
      issueId: entry.issue.id,
      issueIdentifier: entry.issue.identifier,
      sessionId: entry.sessionId,
      event: "worker_webhook_stop",
      message: `worker stopped via webhook: ${reason}`,
    });
    entry.abortController.abort("webhook_stop");
    this.requestRefresh("webhook_worker_stopped");
  }

  getSnapshot(): RuntimeSnapshot {
    return this.getCachedSnapshot().snapshot;
  }

  getRecoveryReport(): RecoveryReport | null {
    return this.lastRecoveryReport
      ? { ...this.lastRecoveryReport, results: [...this.lastRecoveryReport.results] }
      : null;
  }

  getSerializedState(): Record<string, unknown> {
    return this.getCachedSnapshot().serializedState;
  }

  private getCachedSnapshot(): {
    revision: number;
    snapshot: RuntimeSnapshot;
    serializedState: Record<string, unknown>;
  } {
    if (this.cachedSnapshot?.revision === this.stateRevision) {
      return this.cachedSnapshot;
    }

    const cb = this.snapshotCallbacks();
    const snapshot = buildSnapshot({ attemptStore: this.deps.attemptStore }, cb);
    this.cachedSnapshot = {
      revision: this.stateRevision,
      serializedState: serializeSnapshot(snapshot as RuntimeSnapshot & Record<string, unknown>),
      snapshot,
    };
    return this.cachedSnapshot;
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
      this.markStateDirty();
      this._ctx.pushEvent({
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
        pushEvent: (event) => this._ctx.pushEvent(event),
        requestRefresh: (r) => this.requestRefresh(r),
        issueConfigStore: this.deps.issueConfigStore,
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

  getTemplateOverride(identifier: string): string | null {
    return this._state.issueTemplateOverrides.get(identifier) ?? null;
  }

  updateIssueTemplateOverride(identifier: string, templateId: string): boolean {
    const detail = this.getIssueDetail(identifier);
    if (!detail) return false;
    this._state.issueTemplateOverrides.set(identifier, templateId);
    this.deps.issueConfigStore.upsertTemplateId(identifier, templateId);
    return true;
  }

  clearIssueTemplateOverride(identifier: string): boolean {
    const detail = this.getIssueDetail(identifier);
    if (!detail) return false;
    this._state.issueTemplateOverrides.delete(identifier);
    this.deps.issueConfigStore.clearTemplateId(identifier);
    return true;
  }

  async steerIssue(identifier: string, message: string): Promise<{ ok: boolean } | null> {
    const entry = [...this._state.runningEntries.values()].find(
      (runningEntry) => runningEntry.issue.identifier === identifier,
    );
    if (!entry?.steerTurn) return null;
    const ok = await entry.steerTurn(message);
    return { ok };
  }

  getEffectivePollingInterval(): number {
    const tracker = this.deps.webhookHealthTracker;
    if (!tracker) return this.deps.configStore.getConfig().polling.intervalMs;

    const health = tracker.getHealth();
    if (health.status === "disconnected") return this.deps.configStore.getConfig().polling.intervalMs;
    if (health.status === "connected") return health.effectiveIntervalMs;
    return this.deps.configStore.getConfig().polling.intervalMs; // degraded = base rate from config
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
    const metrics = this.deps.metrics ?? createMetricsCollector();
    this.deps.metrics = metrics;
    try {
      if (this._ctx.detectAndKillStalled().killed > 0) {
        this.markStateDirty();
      }
      if (await reconcileRunningAndRetryingState(this._ctx)) {
        this.markStateDirty();
      }
      const candidateIssues = sortIssuesForDispatch(await this.deps.tracker.fetchCandidateIssues());
      await refreshQueueViewsState(this._ctx, candidateIssues);
      await launchAvailableWorkersState(this._ctx, candidateIssues);
      metrics.orchestratorPollsTotal.increment({ status: "ok" });
      this.deps.eventBus?.emit("poll.complete", {
        timestamp: nowIso(),
        issueCount: this._state.queuedViews.length + this._state.runningEntries.size,
      });
    } catch (error) {
      metrics.orchestratorPollsTotal.increment({ status: "error" });
      this.deps.logger.error({ error: toErrorString(error) }, "orchestrator tick failed");
    } finally {
      this.tickInFlight = false;
      const delayMs = this.refreshQueued ? 0 : this.getEffectivePollingInterval();
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
      getTemplateOverride: (identifier: string) => this._state.issueTemplateOverrides.get(identifier) ?? null,
      getTemplateName: (templateId: string) => this.deps.templateStore?.get(templateId)?.name ?? null,
      getSystemHealth: () => {
        const h = this.watchdog.getHealth();
        return { status: h.status, checkedAt: h.checkedAt, runningCount: h.runningCount, message: h.message };
      },
      getWebhookHealth: () => {
        const tracker = this.deps.webhookHealthTracker;
        if (!tracker) return undefined;
        const h = tracker.getHealth();
        return {
          status: h.status,
          effectiveIntervalMs: h.effectiveIntervalMs,
          stats: h.stats,
          lastDeliveryAt: h.lastDeliveryAt,
          lastEventType: h.lastEventType,
        };
      },
    };
  }
}
