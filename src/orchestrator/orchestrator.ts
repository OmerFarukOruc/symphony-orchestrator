import { updateIssueModelSelection } from "./model-selection.js";
import { sortIssuesForDispatch } from "./dispatch.js";
import { Watchdog } from "./watchdog.js";
import { seedCompletedClaims } from "./lifecycle.js";
import { createLifecycleState } from "./core/lifecycle-state.js";
import type { AttemptDetailView, IssueDetailView } from "./snapshot-builder.js";
import {
  createRunLifecycleCoordinator,
  type OrchestratorState,
  type RunLifecycleCoordinator,
} from "./run-lifecycle-coordinator.js";
import type { OrchestratorContext } from "./context.js";
import { runStartupRecovery } from "./recovery.js";
import type { OrchestratorPort } from "./port.js";
import type {
  AbortIssueCommand,
  AbortIssueResult,
  ClearIssueTemplateOverrideCommand,
  ClearIssueTemplateOverrideResult,
  OrchestratorCommand,
  RefreshCommand,
  RefreshCommandResult,
  SetIssueTemplateOverrideCommand,
  SetIssueTemplateOverrideResult,
  SteerIssueCommand,
  SteerIssueResult,
  UpdateIssueModelSelectionCommand,
  UpdateIssueModelSelectionResult,
} from "./port.js";
import type { OrchestratorDeps, RunningEntry } from "./runtime-types.js";
import { serializeSnapshot } from "./snapshot-builder.js";
import { nowIso } from "./views.js";
import type { ReasoningEffort, RuntimeSnapshot } from "../core/types.js";
import type { RecoveryReport } from "./recovery-types.js";
import { toErrorString } from "../utils/type-guards.js";
import { createMetricsCollector } from "../observability/metrics.js";
import type { ObservabilityHealthStatus } from "../observability/health.js";

export class Orchestrator implements OrchestratorPort {
  private readonly _state: OrchestratorState;
  private readonly runtimeCoordinator: RunLifecycleCoordinator;
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
  private runningEntryLookupCache: {
    revision: number;
    entriesByIdentifier: Map<string, RunningEntry>;
  } | null = null;

  constructor(private readonly deps: OrchestratorDeps) {
    this.deps.metrics ??= createMetricsCollector();
    const markDirty = () => this.markStateDirty();
    this._state = createLifecycleState(markDirty);
    this.watchdog = new Watchdog({
      getRunningCount: () => this._state.runningEntries.size,
      getQueuedCount: () => this._state.queuedViews.length,
      getRecentStalls: () => [...this._state.stallEvents],
      onHealthUpdated: () => this.markStateDirty(),
      logger: deps.logger,
    });
    this.runtimeCoordinator = createRunLifecycleCoordinator(this._state, this.deps, {
      getSystemHealth: () => {
        const health = this.watchdog.getHealth();
        return {
          status: health.status,
          checkedAt: health.checkedAt,
          runningCount: health.runningCount,
          message: health.message,
        };
      },
    });
    this._ctx = this.runtimeCoordinator.getContext();
    this.deps.configStore.subscribe(() => {
      this.markStateDirty();
    });
  }

  private markStateDirty(): void {
    this.stateRevision += 1;
    this.cachedSnapshot = null;
    this.runningEntryLookupCache = null;
  }

  private getRunningEntryByIdentifier(identifier: string) {
    if (this.runningEntryLookupCache?.revision !== this.stateRevision) {
      const entriesByIdentifier = new Map<string, RunningEntry>();
      for (const entry of this._state.runningEntries.values()) {
        entriesByIdentifier.set(entry.issue.identifier, entry);
      }
      this.runningEntryLookupCache = {
        revision: this.stateRevision,
        entriesByIdentifier,
      };
    }

    return this.runningEntryLookupCache.entriesByIdentifier.get(identifier) ?? null;
  }

  async start(): Promise<void> {
    if (this._state.running) return;
    this._state.running = true;
    this.markStateDirty();
    this.deps.observability?.getComponent("orchestrator").setHealth({
      surface: "orchestrator",
      status: "ok",
      reason: "orchestrator started",
    });
    this.watchdog.start();
    this.lastRecoveryReport = await runStartupRecovery({
      attemptStore: this.deps.attemptStore,
      tracker: this.deps.tracker,
      workspaceManager: this.deps.workspaceManager,
      getConfig: () => this.deps.configStore.getConfig(),
      launchWorker: (issue, attempt, options) => this._ctx.launchWorker(issue, attempt, options),
      logger: this.deps.logger,
    });
    await this.runtimeCoordinator.cleanupTerminalWorkspaces();
    seedCompletedClaims({
      claimedIssueIds: this._state.claimedIssueIds,
      completedViews: this._state.completedViews,
      markDirty: () => this.markStateDirty(),
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
    if (configRows.length > 0) {
      this.markStateDirty();
    }
    this.scheduleTick(0);
  }

  async stop(): Promise<void> {
    this._state.running = false;
    this.markStateDirty();
    this.deps.observability?.getComponent("orchestrator").setHealth({
      surface: "orchestrator",
      status: "warn",
      reason: "orchestrator stopped",
    });
    this.watchdog.stop();
    if (this.nextTickTimer) {
      clearTimeout(this.nextTickTimer);
      this.nextTickTimer = null;
    }
    for (const retry of this._state.retryEntries.values()) {
      if (retry.timer) clearTimeout(retry.timer);
    }
    if (this._state.retryEntries.size > 0) {
      this._state.retryEntries.clear();
      this.markStateDirty();
    }
    if (this._state.claimedIssueIds.size > 0) {
      this._state.claimedIssueIds.clear();
      this.markStateDirty();
    }
    const workers = [...this._state.runningEntries.values()];
    for (const worker of workers) worker.abortController.abort("shutdown");
    await Promise.allSettled(workers.map((w) => w.promise));
  }

  async executeCommand(command: RefreshCommand): Promise<RefreshCommandResult>;
  async executeCommand(command: AbortIssueCommand): Promise<AbortIssueResult>;
  async executeCommand(command: UpdateIssueModelSelectionCommand): Promise<UpdateIssueModelSelectionResult>;
  async executeCommand(command: SetIssueTemplateOverrideCommand): Promise<SetIssueTemplateOverrideResult>;
  async executeCommand(command: ClearIssueTemplateOverrideCommand): Promise<ClearIssueTemplateOverrideResult>;
  async executeCommand(command: SteerIssueCommand): Promise<SteerIssueResult>;
  async executeCommand(
    command: OrchestratorCommand,
  ): Promise<
    | RefreshCommandResult
    | AbortIssueResult
    | UpdateIssueModelSelectionResult
    | SetIssueTemplateOverrideResult
    | ClearIssueTemplateOverrideResult
    | SteerIssueResult
  > {
    switch (command.type) {
      case "refresh":
        return this.handleRefreshCommand(command);
      case "abort_issue":
        return this.handleAbortIssueCommand(command.identifier);
      case "update_issue_model_selection":
        return this.handleUpdateIssueModelSelectionCommand({
          identifier: command.identifier,
          model: command.model,
          reasoningEffort: command.reasoningEffort,
        });
      case "set_issue_template_override":
        return this.handleSetIssueTemplateOverrideCommand(command.identifier, command.templateId);
      case "clear_issue_template_override":
        return this.handleClearIssueTemplateOverrideCommand(command.identifier);
      case "steer_issue":
        return this.handleSteerIssueCommand(command.identifier, command.message);
      default: {
        const unreachable: never = command;
        throw new Error(`Unsupported orchestrator command: ${JSON.stringify(unreachable)}`);
      }
    }
  }

  requestRefresh(reason: string): { queued: boolean; coalesced: boolean; requestedAt: string } {
    const result = this.handleRefreshCommand({ type: "refresh", reason });
    return {
      queued: result.queued,
      coalesced: result.coalesced,
      requestedAt: result.requestedAt,
    };
  }

  requestTargetedRefresh(issueId: string, issueIdentifier: string, reason: string): void {
    void this.handleRefreshCommand({ type: "refresh", issueId, issueIdentifier, reason });
  }

  stopWorkerForIssue(issueIdentifier: string, reason: string): void {
    const entry = this.getRunningEntryByIdentifier(issueIdentifier);
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

    const snapshot = this.runtimeCoordinator.buildSnapshot();
    this.cachedSnapshot = {
      revision: this.stateRevision,
      serializedState: serializeSnapshot(snapshot),
      snapshot,
    };
    return this.cachedSnapshot;
  }

  getIssueDetail(identifier: string): IssueDetailView | null {
    const detail = this.runtimeCoordinator.buildIssueDetail(identifier);
    return detail ? { ...detail } : null;
  }

  getAttemptDetail(attemptId: string): AttemptDetailView | null {
    const detail = this.runtimeCoordinator.buildAttemptDetail(attemptId);
    return detail ? { ...detail } : null;
  }

  abortIssue(identifier: string): AbortIssueResult {
    return this.handleAbortIssueCommand(identifier);
  }

  async updateIssueModelSelection(input: {
    identifier: string;
    model: string;
    reasoningEffort: ReasoningEffort | null;
  }): Promise<UpdateIssueModelSelectionResult> {
    return this.handleUpdateIssueModelSelectionCommand(input);
  }

  getTemplateOverride(identifier: string): string | null {
    return this._state.issueTemplateOverrides.get(identifier) ?? null;
  }

  updateIssueTemplateOverride(identifier: string, templateId: string): boolean {
    return Boolean(this.handleSetIssueTemplateOverrideCommand(identifier, templateId));
  }

  clearIssueTemplateOverride(identifier: string): boolean {
    return Boolean(this.handleClearIssueTemplateOverrideCommand(identifier));
  }

  async steerIssue(identifier: string, message: string): Promise<SteerIssueResult> {
    return this.handleSteerIssueCommand(identifier, message);
  }

  private handleAbortIssueCommand(identifier: string): AbortIssueResult {
    const entry = this.getRunningEntryByIdentifier(identifier);
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

  private async handleUpdateIssueModelSelectionCommand(input: {
    identifier: string;
    model: string;
    reasoningEffort: ReasoningEffort | null;
  }): Promise<UpdateIssueModelSelectionResult> {
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
        markDirty: () => this.markStateDirty(),
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

  private handleSetIssueTemplateOverrideCommand(
    identifier: string,
    templateId: string,
  ): SetIssueTemplateOverrideResult {
    const detail = this.getIssueDetail(identifier);
    if (!detail) return null;
    this._state.issueTemplateOverrides.set(identifier, templateId);
    this.markStateDirty();
    this.deps.issueConfigStore.upsertTemplateId(identifier, templateId);
    return { updated: true, appliesNextAttempt: true };
  }

  private handleClearIssueTemplateOverrideCommand(identifier: string): ClearIssueTemplateOverrideResult {
    const detail = this.getIssueDetail(identifier);
    if (!detail) return null;
    this._state.issueTemplateOverrides.delete(identifier);
    this.markStateDirty();
    this.deps.issueConfigStore.clearTemplateId(identifier);
    return { cleared: true };
  }

  private async handleSteerIssueCommand(identifier: string, message: string): Promise<SteerIssueResult> {
    const entry = this.getRunningEntryByIdentifier(identifier);
    if (!entry?.steerTurn) return null;
    const ok = await entry.steerTurn(message);
    return { ok };
  }

  private handleRefreshCommand(command: RefreshCommand): RefreshCommandResult {
    if (command.issueId && command.issueIdentifier) {
      this.deps.logger.info(
        { issueId: command.issueId, issueIdentifier: command.issueIdentifier, reason: command.reason },
        "targeted refresh requested",
      );
      const fullRefresh = this.handleRefreshCommand({ type: "refresh", reason: command.reason });
      return {
        ...fullRefresh,
        targeted: true,
        issueId: command.issueId,
        issueIdentifier: command.issueIdentifier,
      };
    }

    const requestedAt = nowIso();
    const coalesced = this.refreshQueued;
    this.refreshQueued = true;
    this.deps.logger.info({ reason: command.reason, requestedAt }, "refresh requested");
    this.scheduleTick(0);
    return { queued: !coalesced, coalesced, requestedAt, targeted: false };
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
    const observer = this.deps.observability?.getComponent("orchestrator");
    this.deps.metrics = metrics;
    const startedAt = Date.now();
    try {
      if (this._ctx.detectAndKillStalled().killed > 0) {
        this.markStateDirty();
      }
      if (await this.runtimeCoordinator.reconcileRunningAndRetrying()) {
        this.markStateDirty();
      }
      const candidateIssues = sortIssuesForDispatch(await this.deps.tracker.fetchCandidateIssues());
      await this.runtimeCoordinator.refreshQueueViews(candidateIssues);
      await this.runtimeCoordinator.launchAvailableWorkers(candidateIssues);
      metrics.orchestratorPollsTotal.increment({ status: "ok" });
      observer?.recordOperation({
        metric: "lifecycle_poll",
        operation: "orchestrator_tick",
        outcome: "success",
        durationMs: Date.now() - startedAt,
        data: {
          running: this._state.runningEntries.size,
          queued: this._state.queuedViews.length,
        },
      });
      const health = this.watchdog.getHealth();
      observer?.setHealth({
        surface: "orchestrator",
        status: mapWatchdogStatus(health.status),
        reason: health.message,
        details: {
          runningCount: health.runningCount,
          recentStalls: health.recentStalls.length,
        },
      });
      this.deps.eventBus?.emit("poll.complete", {
        timestamp: nowIso(),
        issueCount: this._state.queuedViews.length + this._state.runningEntries.size,
      });
    } catch (error) {
      metrics.orchestratorPollsTotal.increment({ status: "error" });
      observer?.recordOperation({
        metric: "lifecycle_poll",
        operation: "orchestrator_tick",
        outcome: "failure",
        durationMs: Date.now() - startedAt,
        reason: toErrorString(error),
      });
      observer?.setHealth({
        surface: "orchestrator",
        status: "error",
        reason: toErrorString(error),
      });
      this.deps.logger.error({ error: toErrorString(error) }, "orchestrator tick failed");
    } finally {
      this.tickInFlight = false;
      const delayMs = this.refreshQueued ? 0 : this.getEffectivePollingInterval();
      this.refreshQueued = false;
      if (this._state.running) this.scheduleTick(delayMs);
    }
  }
}

function mapWatchdogStatus(status: "healthy" | "degraded" | "critical"): ObservabilityHealthStatus {
  if (status === "critical") {
    return "error";
  }
  if (status === "degraded") {
    return "warn";
  }
  return "ok";
}
