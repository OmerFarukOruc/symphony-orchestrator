import { randomUUID } from "node:crypto";

import { AgentRunner } from "./agent-runner.js";
import { AttemptStore } from "./attempt-store.js";
import { ConfigStore } from "./config.js";
import { LinearClient } from "./linear-client.js";
import {
  type IssueView,
  isActiveState,
  isHardFailure,
  isTerminalState,
  issueView,
  nowIso,
  usageDelta,
} from "./orchestrator/views.js";
import type {
  Issue,
  ModelSelection,
  RecentEvent,
  RetryEntry,
  ReasoningEffort,
  RuntimeIssueView,
  RuntimeSnapshot,
  ServiceConfig,
  SymphonyLogger,
  TokenUsageSnapshot,
  Workspace,
} from "./types.js";
import { WorkspaceManager } from "./workspace-manager.js";

interface RunningEntry {
  runId: string;
  issue: Issue;
  workspace: Workspace;
  startedAtMs: number;
  lastEventAtMs: number;
  attempt: number | null;
  abortController: AbortController;
  promise: Promise<void>;
  cleanupOnExit: boolean;
  status: "running" | "stopping";
  sessionId: string | null;
  tokenUsage: TokenUsageSnapshot | null;
  modelSelection: ModelSelection;
}

export class Orchestrator {
  private running = false;
  private tickInFlight = false;
  private nextTickTimer: NodeJS.Timeout | null = null;
  private refreshQueued = false;
  private readonly runningEntries = new Map<string, RunningEntry>();
  private readonly retryEntries = new Map<string, RetryEntry & { issue: Issue; workspaceKey: string | null }>();
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

  constructor(
    private readonly deps: {
      attemptStore: AttemptStore;
      configStore: ConfigStore;
      linearClient: LinearClient;
      workspaceManager: WorkspaceManager;
      agentRunner: AgentRunner;
      logger: SymphonyLogger;
    },
  ) {}

  async start(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
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
    return {
      generatedAt: nowIso(),
      counts: {
        running: this.runningEntries.size,
        retrying: this.retryEntries.size,
      },
      running: [...this.runningEntries.values()].map((entry) => this.runningIssueView(entry)),
      retrying: [...this.retryEntries.values()].map((entry) =>
        issueView(entry.issue, {
          configuredModel: this.resolveModelSelection(entry.identifier).model,
          configuredReasoningEffort: this.resolveModelSelection(entry.identifier).reasoningEffort,
          configuredModelSource: this.resolveModelSelection(entry.identifier).source,
          modelChangePending: false,
          workspaceKey: entry.workspaceKey,
          status: "retrying",
          attempt: entry.attempt,
          error: entry.error,
          message: `retry due at ${new Date(entry.dueAtMs).toISOString()}`,
          model: this.resolveModelSelection(entry.identifier).model,
          reasoningEffort: this.resolveModelSelection(entry.identifier).reasoningEffort,
          modelSource: this.resolveModelSelection(entry.identifier).source,
        }),
      ),
      queued: this.queuedViews,
      completed: [...this.completedViews.values()].slice(0, 25),
      codexTotals: { ...this.codexTotals },
      rateLimits: this.rateLimits,
      recentEvents: [...this.recentEvents],
    };
  }

  getIssueDetail(identifier: string): Record<string, unknown> | null {
    const runningEntry = [...this.runningEntries.values()].find((entry) => entry.issue.identifier === identifier);
    const retryEntry = [...this.retryEntries.values()].find((entry) => entry.identifier === identifier);
    const completedEntry = this.completedViews.get(identifier);
    const detail =
      (runningEntry ? this.runningIssueView(runningEntry) : null) ??
      (retryEntry
        ? issueView(retryEntry.issue, {
            configuredModel: this.resolveModelSelection(retryEntry.identifier).model,
            configuredReasoningEffort: this.resolveModelSelection(retryEntry.identifier).reasoningEffort,
            configuredModelSource: this.resolveModelSelection(retryEntry.identifier).source,
            modelChangePending: false,
            workspaceKey: retryEntry.workspaceKey,
            status: "retrying",
            attempt: retryEntry.attempt,
            error: retryEntry.error,
            message: `retry due at ${new Date(retryEntry.dueAtMs).toISOString()}`,
            model: this.resolveModelSelection(retryEntry.identifier).model,
            reasoningEffort: this.resolveModelSelection(retryEntry.identifier).reasoningEffort,
            modelSource: this.resolveModelSelection(retryEntry.identifier).source,
          })
        : null) ??
      completedEntry ??
      this.detailViews.get(identifier);
    if (!detail) {
      return null;
    }
    const relatedEvents = runningEntry
      ? this.deps.attemptStore.getEvents(runningEntry.runId)
      : this.recentEvents.filter((event) => event.issueIdentifier === identifier);

    const archivedAttempts = this.deps.attemptStore.getAttemptsForIssue(identifier);
    return {
      ...detail,
      recentEvents: relatedEvents,
      attempts: archivedAttempts.map((attempt) => ({
        attemptId: attempt.attemptId,
        attemptNumber: attempt.attemptNumber,
        startedAt: attempt.startedAt,
        endedAt: attempt.endedAt,
        status: attempt.status,
        model: attempt.model,
        reasoningEffort: attempt.reasoningEffort,
        tokenUsage: attempt.tokenUsage,
        errorCode: attempt.errorCode,
        errorMessage: attempt.errorMessage,
      })),
      currentAttemptId: runningEntry?.runId ?? null,
    };
  }

  getAttemptDetail(attemptId: string): Record<string, unknown> | null {
    const attempt = this.deps.attemptStore.getAttempt(attemptId);
    if (!attempt) {
      return null;
    }
    return {
      ...attempt,
      events: this.deps.attemptStore.getEvents(attemptId),
    };
  }

  async updateIssueModelSelection(input: {
    identifier: string;
    model: string;
    reasoningEffort: ReasoningEffort | null;
  }): Promise<{ updated: boolean; restarted: boolean; appliesNextAttempt: boolean; selection: ModelSelection } | null> {
    const identifier = input.identifier;
    const existingDetail = this.getIssueDetail(identifier);
    if (!existingDetail) {
      return null;
    }

    this.issueModelOverrides.set(identifier, {
      model: input.model,
      reasoningEffort: input.reasoningEffort,
    });

    const selection = this.resolveModelSelection(identifier);
    const runningEntry = [...this.runningEntries.values()].find((entry) => entry.issue.identifier === identifier);
    if (runningEntry && !runningEntry.abortController.signal.aborted) {
      this.pushEvent({
        at: nowIso(),
        issueId: runningEntry.issue.id,
        issueIdentifier: runningEntry.issue.identifier,
        sessionId: runningEntry.sessionId,
        event: "model_selection_updated",
        message: `next run model updated to ${selection.model}${selection.reasoningEffort ? ` (${selection.reasoningEffort})` : ""}`,
      });
      return {
        updated: true,
        restarted: false,
        appliesNextAttempt: true,
        selection,
      };
    }

    const retryEntry = [...this.retryEntries.values()].find((entry) => entry.identifier === identifier);
    if (retryEntry) {
      this.pushEvent({
        at: nowIso(),
        issueId: retryEntry.issue.id,
        issueIdentifier: retryEntry.issue.identifier,
        sessionId: null,
        event: "model_selection_updated",
        message: `next run model updated to ${selection.model}${selection.reasoningEffort ? ` (${selection.reasoningEffort})` : ""}`,
      });
      return {
        updated: true,
        restarted: false,
        appliesNextAttempt: true,
        selection,
      };
    }

    this.requestRefresh("model_selection_updated");
    return {
      updated: true,
      restarted: false,
      appliesNextAttempt: false,
      selection,
    };
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
    const startedAtMs = Date.now();
    try {
      await this.reconcileRunningAndRetrying();
      await this.refreshQueueViews();
      await this.launchAvailableWorkers();
    } catch (error) {
      this.deps.logger.error({ error: String(error) }, "orchestrator tick failed");
    } finally {
      this.codexTotals.secondsRunning += (Date.now() - startedAtMs) / 1000;
      this.tickInFlight = false;
      const delayMs = this.refreshQueued ? 0 : this.getConfig().polling.intervalMs;
      this.refreshQueued = false;
      if (this.running) {
        this.scheduleTick(delayMs);
      }
    }
  }

  private async reconcileRunningAndRetrying(): Promise<void> {
    const now = Date.now();
    const config = this.getConfig();

    for (const entry of this.runningEntries.values()) {
      if (!entry.abortController.signal.aborted && now - entry.lastEventAtMs > config.codex.stallTimeoutMs) {
        entry.abortController.abort("stalled");
        entry.status = "stopping";
        this.pushEvent({
          at: nowIso(),
          issueId: entry.issue.id,
          issueIdentifier: entry.issue.identifier,
          sessionId: entry.sessionId,
          event: "worker_stalled",
          message: "worker exceeded stall timeout and was cancelled",
        });
      }
    }

    const trackedIds = new Set<string>([...this.runningEntries.keys(), ...this.retryEntries.keys()]);
    if (trackedIds.size === 0) {
      return;
    }

    const issues = await this.deps.linearClient.fetchIssueStatesByIds([...trackedIds]);
    const byId = new Map(issues.map((issue) => [issue.id, issue]));

    for (const entry of this.runningEntries.values()) {
      const latest = byId.get(entry.issue.id);
      if (!latest) {
        continue;
      }
      entry.issue = latest;
      if (isTerminalState(latest.state)) {
        entry.cleanupOnExit = true;
        if (!entry.abortController.signal.aborted) {
          entry.abortController.abort("terminal");
        }
        entry.status = "stopping";
      } else if (!isActiveState(latest.state) && !entry.abortController.signal.aborted) {
        entry.abortController.abort("inactive");
        entry.status = "stopping";
      }
    }

    for (const retryEntry of [...this.retryEntries.values()]) {
      const latest = byId.get(retryEntry.issueId);
      if (!latest) {
        continue;
      }
      retryEntry.issue = latest;
      if (isTerminalState(latest.state)) {
        if (retryEntry.timer) {
          clearTimeout(retryEntry.timer);
        }
        this.retryEntries.delete(retryEntry.issueId);
        await this.deps.workspaceManager.removeWorkspace(latest.identifier).catch(() => undefined);
      } else if (!isActiveState(latest.state)) {
        if (retryEntry.timer) {
          clearTimeout(retryEntry.timer);
        }
        this.retryEntries.delete(retryEntry.issueId);
      }
    }
  }

  private async refreshQueueViews(): Promise<void> {
    const issues = await this.deps.linearClient.fetchCandidateIssues();
    this.queuedViews = issues
      .filter((issue) => !this.runningEntries.has(issue.id) && !this.retryEntries.has(issue.id))
      .slice(0, 50)
      .map((issue) =>
        issueView(issue, {
          status: "queued",
          configuredModel: this.resolveModelSelection(issue.identifier).model,
          configuredReasoningEffort: this.resolveModelSelection(issue.identifier).reasoningEffort,
          configuredModelSource: this.resolveModelSelection(issue.identifier).source,
          modelChangePending: false,
          model: this.resolveModelSelection(issue.identifier).model,
          reasoningEffort: this.resolveModelSelection(issue.identifier).reasoningEffort,
          modelSource: this.resolveModelSelection(issue.identifier).source,
        }),
      );

    for (const issue of issues) {
      if (!this.runningEntries.has(issue.id) && !this.retryEntries.has(issue.id)) {
        const selection = this.resolveModelSelection(issue.identifier);
        this.detailViews.set(
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
    }
  }

  private async launchAvailableWorkers(): Promise<void> {
    const config = this.getConfig();
    const availableSlots = config.agent.maxConcurrentAgents - this.runningEntries.size;
    if (availableSlots <= 0) {
      return;
    }

    const issues = await this.deps.linearClient.fetchCandidateIssues();
    let launched = 0;
    for (const issue of issues) {
      if (launched >= availableSlots) {
        break;
      }
      if (this.runningEntries.has(issue.id) || this.retryEntries.has(issue.id)) {
        continue;
      }
      launched += 1;
      await this.launchWorker(issue, null);
    }
  }

  private async launchWorker(issue: Issue, attempt: number | null): Promise<void> {
    const workflow = this.deps.configStore.getWorkflow();
    const workspace = await this.deps.workspaceManager.ensureWorkspace(issue.identifier);
    const modelSelection = this.resolveModelSelection(issue.identifier);
    const abortController = new AbortController();
    const entry: RunningEntry = {
      runId: randomUUID(),
      issue,
      workspace,
      startedAtMs: Date.now(),
      lastEventAtMs: Date.now(),
      attempt,
      abortController,
      promise: Promise.resolve(),
      cleanupOnExit: false,
      status: "running",
      sessionId: null,
      tokenUsage: null,
      modelSelection,
    };
    this.runningEntries.set(issue.id, entry);
    await this.deps.attemptStore.createAttempt({
      attemptId: entry.runId,
      issueId: issue.id,
      issueIdentifier: issue.identifier,
      title: issue.title,
      workspaceKey: workspace.workspaceKey,
      workspacePath: workspace.path,
      status: "running",
      attemptNumber: attempt,
      startedAt: new Date(entry.startedAtMs).toISOString(),
      endedAt: null,
      model: modelSelection.model,
      reasoningEffort: modelSelection.reasoningEffort,
      modelSource: modelSelection.source,
      threadId: null,
      turnId: null,
      turnCount: 0,
      errorCode: null,
      errorMessage: null,
      tokenUsage: null,
    });
    this.detailViews.set(
      issue.identifier,
      issueView(issue, {
        workspaceKey: workspace.workspaceKey,
        status: "running",
        attempt,
        configuredModel: modelSelection.model,
        configuredReasoningEffort: modelSelection.reasoningEffort,
        configuredModelSource: modelSelection.source,
        modelChangePending: false,
        model: modelSelection.model,
        reasoningEffort: modelSelection.reasoningEffort,
        modelSource: modelSelection.source,
      }),
    );

    entry.promise = this.deps.agentRunner
      .runAttempt({
        issue,
        attempt,
        modelSelection,
        promptTemplate: workflow.promptTemplate,
        workspace,
        signal: abortController.signal,
        onEvent: (event) => {
          entry.sessionId = event.sessionId;
          entry.lastEventAtMs = Date.now();
          this.pushEvent(event);
          void this.deps.attemptStore.appendEvent({
            attemptId: entry.runId,
            at: event.at,
            issueId: event.issueId,
            issueIdentifier: event.issueIdentifier,
            sessionId: event.sessionId,
            event: event.event,
            message: event.message,
            content: event.content ?? null,
            usage: event.usage ?? null,
            rateLimits: event.rateLimits,
          });
          if (event.usage) {
            this.applyUsageEvent(entry, event.usage, event.usageMode ?? "delta");
          }
          if (event.rateLimits !== undefined) {
            this.rateLimits = event.rateLimits;
          }
          void this.deps.attemptStore
            .updateAttempt(entry.runId, {
              threadId: entry.sessionId,
              tokenUsage: entry.tokenUsage,
            })
            .catch(() => undefined);
        },
      })
      .then(async (outcome) => {
        this.runningEntries.delete(issue.id);
        const latestIssue =
          (await this.deps.linearClient.fetchIssueStatesByIds([issue.id]).catch(() => [issue]))[0] ?? issue;
        await this.deps.attemptStore.updateAttempt(entry.runId, {
          issueId: latestIssue.id,
          issueIdentifier: latestIssue.identifier,
          title: latestIssue.title,
          status:
            outcome.kind === "normal"
              ? "completed"
              : outcome.kind === "timed_out"
                ? "timed_out"
                : outcome.kind === "stalled"
                  ? "stalled"
                  : outcome.kind === "cancelled"
                    ? "cancelled"
                    : "failed",
          endedAt: nowIso(),
          threadId: outcome.threadId ?? entry.sessionId,
          turnId: outcome.turnId,
          turnCount: outcome.turnCount,
          errorCode: outcome.errorCode,
          errorMessage: outcome.errorMessage,
          tokenUsage: entry.tokenUsage,
        });
        this.detailViews.set(
          latestIssue.identifier,
          issueView(latestIssue, {
            workspaceKey: workspace.workspaceKey,
            status: outcome.kind,
            attempt,
            error: outcome.errorMessage,
            message: outcome.errorMessage,
            configuredModel: this.resolveModelSelection(latestIssue.identifier).model,
            configuredReasoningEffort: this.resolveModelSelection(latestIssue.identifier).reasoningEffort,
            configuredModelSource: this.resolveModelSelection(latestIssue.identifier).source,
            modelChangePending: false,
            model: entry.modelSelection.model,
            reasoningEffort: entry.modelSelection.reasoningEffort,
            modelSource: entry.modelSelection.source,
          }),
        );

        if (!this.running) {
          this.completedViews.set(
            latestIssue.identifier,
            issueView(latestIssue, {
              workspaceKey: workspace.workspaceKey,
              status: "cancelled",
              attempt,
              error: outcome.errorMessage,
              message: outcome.errorMessage ?? "service stopped before the worker completed",
              configuredModel: this.resolveModelSelection(latestIssue.identifier).model,
              configuredReasoningEffort: this.resolveModelSelection(latestIssue.identifier).reasoningEffort,
              configuredModelSource: this.resolveModelSelection(latestIssue.identifier).source,
              modelChangePending: false,
              model: entry.modelSelection.model,
              reasoningEffort: entry.modelSelection.reasoningEffort,
              modelSource: entry.modelSelection.source,
            }),
          );
          return;
        }

        if (entry.cleanupOnExit || isTerminalState(latestIssue.state)) {
          await this.deps.workspaceManager.removeWorkspace(latestIssue.identifier).catch(() => undefined);
          this.completedViews.set(
            latestIssue.identifier,
            issueView(latestIssue, {
              workspaceKey: workspace.workspaceKey,
              status: "completed",
              message: "workspace cleaned after terminal state",
              configuredModel: this.resolveModelSelection(latestIssue.identifier).model,
              configuredReasoningEffort: this.resolveModelSelection(latestIssue.identifier).reasoningEffort,
              configuredModelSource: this.resolveModelSelection(latestIssue.identifier).source,
              modelChangePending: false,
              model: entry.modelSelection.model,
              reasoningEffort: entry.modelSelection.reasoningEffort,
              modelSource: entry.modelSelection.source,
            }),
          );
          return;
        }

        if (!isActiveState(latestIssue.state)) {
          this.completedViews.set(
            latestIssue.identifier,
            issueView(latestIssue, {
              workspaceKey: workspace.workspaceKey,
              status: "paused",
              message: "issue is no longer active",
              configuredModel: this.resolveModelSelection(latestIssue.identifier).model,
              configuredReasoningEffort: this.resolveModelSelection(latestIssue.identifier).reasoningEffort,
              configuredModelSource: this.resolveModelSelection(latestIssue.identifier).source,
              modelChangePending: false,
              model: entry.modelSelection.model,
              reasoningEffort: entry.modelSelection.reasoningEffort,
              modelSource: entry.modelSelection.source,
            }),
          );
          return;
        }

        if (outcome.errorCode === "model_override_updated") {
          this.queueRetry(latestIssue, attempt ?? 1, 0, "model_override_updated");
          return;
        }

        if (outcome.kind === "cancelled" || isHardFailure(outcome.errorCode)) {
          this.completedViews.set(
            latestIssue.identifier,
            issueView(latestIssue, {
              workspaceKey: workspace.workspaceKey,
              status: outcome.kind === "cancelled" ? "cancelled" : "failed",
              attempt,
              error: outcome.errorCode,
              message: outcome.errorMessage ?? "worker stopped without a retry",
              configuredModel: this.resolveModelSelection(latestIssue.identifier).model,
              configuredReasoningEffort: this.resolveModelSelection(latestIssue.identifier).reasoningEffort,
              configuredModelSource: this.resolveModelSelection(latestIssue.identifier).source,
              modelChangePending: false,
              model: entry.modelSelection.model,
              reasoningEffort: entry.modelSelection.reasoningEffort,
              modelSource: entry.modelSelection.source,
            }),
          );
          return;
        }

        if (outcome.kind === "normal") {
          this.queueRetry(latestIssue, 1, 1000, "continuation");
          this.deps.logger.info(
            {
              issue_id: latestIssue.id,
              issue_identifier: latestIssue.identifier,
              attempt: 1,
              delay_ms: 1000,
              reason: "turn_complete",
            },
            "worker retry queued",
          );
          return;
        }

        const nextAttempt = (attempt ?? 0) + 1;
        const delayMs = Math.min(10_000 * 2 ** Math.max(0, nextAttempt - 1), this.getConfig().agent.maxRetryBackoffMs);
        this.queueRetry(latestIssue, nextAttempt, delayMs, outcome.errorCode ?? "turn_failed");
        this.deps.logger.info(
          {
            issue_id: latestIssue.id,
            issue_identifier: latestIssue.identifier,
            attempt: nextAttempt,
            delay_ms: delayMs,
            reason: outcome.errorCode ?? "turn_failed",
          },
          "worker retry queued",
        );
      })
      .catch((error) => {
        this.runningEntries.delete(issue.id);
        this.pushEvent({
          at: nowIso(),
          issueId: issue.id,
          issueIdentifier: issue.identifier,
          sessionId: entry.sessionId,
          event: "worker_failed",
          message: String(error),
        });
        void this.deps.attemptStore
          .updateAttempt(entry.runId, {
            status: "failed",
            endedAt: nowIso(),
            errorCode: "worker_failed",
            errorMessage: String(error),
            tokenUsage: entry.tokenUsage,
            threadId: entry.sessionId,
          })
          .catch(() => undefined);
      });
  }

  private queueRetry(issue: Issue, attempt: number, delayMs: number, error: string | null): void {
    if (!this.running) {
      return;
    }
    const existing = this.retryEntries.get(issue.id);
    if (existing?.timer) {
      clearTimeout(existing.timer);
    }
    const dueAtMs = Date.now() + delayMs;
    const timer = setTimeout(() => {
      this.retryEntries.delete(issue.id);
      void this.launchWorker(issue, attempt);
    }, delayMs);
    this.retryEntries.set(issue.id, {
      issueId: issue.id,
      identifier: issue.identifier,
      attempt,
      dueAtMs,
      error,
      timer,
      issue,
      workspaceKey: this.detailViews.get(issue.identifier)?.workspaceKey ?? null,
    });
  }

  private pushEvent(event: RecentEvent & { usage?: unknown; rateLimits?: unknown }): void {
    this.recentEvents.unshift({
      at: event.at,
      issueId: event.issueId,
      issueIdentifier: event.issueIdentifier,
      sessionId: event.sessionId,
      event: event.event,
      message: event.message,
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

  private runningIssueView(entry: RunningEntry): RuntimeIssueView {
    const configuredSelection = this.resolveModelSelection(entry.issue.identifier);
    return issueView(entry.issue, {
      workspaceKey: entry.workspace.workspaceKey,
      workspacePath: entry.workspace.path,
      status: entry.status,
      attempt: entry.attempt,
      message: `running in ${entry.workspace.path}`,
      startedAt: new Date(entry.startedAtMs).toISOString(),
      lastEventAt: new Date(entry.lastEventAtMs).toISOString(),
      tokenUsage: entry.tokenUsage,
      priority: entry.issue.priority,
      labels: entry.issue.labels,
      configuredModel: configuredSelection.model,
      configuredReasoningEffort: configuredSelection.reasoningEffort,
      configuredModelSource: configuredSelection.source,
      modelChangePending:
        configuredSelection.model !== entry.modelSelection.model ||
        configuredSelection.reasoningEffort !== entry.modelSelection.reasoningEffort,
      model: entry.modelSelection.model,
      reasoningEffort: entry.modelSelection.reasoningEffort,
      modelSource: entry.modelSelection.source,
    });
  }

  private resolveModelSelection(identifier: string): ModelSelection {
    const override = this.issueModelOverrides.get(identifier);
    if (override) {
      return {
        model: override.model,
        reasoningEffort: override.reasoningEffort,
        source: "override",
      };
    }

    const config = this.getConfig();
    return {
      model: config.codex.model,
      reasoningEffort: config.codex.reasoningEffort,
      source: "default",
    };
  }

  private getConfig(): ServiceConfig {
    return this.deps.configStore.getConfig();
  }
}
