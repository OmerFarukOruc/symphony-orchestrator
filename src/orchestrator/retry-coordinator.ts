import { randomUUID } from "node:crypto";

import type { AttemptStorePort } from "../core/attempt-store-port.js";
import type { AttemptRecord, Issue, ModelSelection, RisolutoLogger, RuntimeIssueView } from "../core/types.js";
import type { RunningEntry } from "./runtime-types.js";
import type { WorkspaceManager } from "../workspace/manager.js";
import type { TrackerPort } from "../tracker/port.js";
import type { OutcomeContext, RetryCoordinator, RetryRuntimeContext } from "./context.js";
import type { PreparedWorkerOutcome } from "./worker-outcome/types.js";
import { writeFailureWriteback } from "./worker-outcome/completion-writeback.js";
import { issueRef } from "./worker-outcome/types.js";
import { handleCancelledOrHardFailure } from "./worker-outcome/terminal-paths.js";
import { issueView, nowIso } from "./views.js";
import { isActiveState, isTerminalState } from "../state/policy.js";
import { toErrorString } from "../utils/type-guards.js";
import { classifyRetryStrategy } from "./retry-policy.js";

export type { RetryCoordinator };

export interface RetryCoordinatorDeps {
  tracker: Pick<TrackerPort, "fetchIssueStatesByIds">;
  attemptStore: Pick<AttemptStorePort, "updateAttempt" | "createAttempt">;
  workspaceManager: Pick<WorkspaceManager, "removeWorkspace">;
  logger: Pick<RisolutoLogger, "info" | "warn" | "error">;
}

export function computeBackoffForAttempt(currentAttempt: number, maxBackoffMs: number): number {
  const nextAttempt = currentAttempt + 1;
  return Math.min(10_000 * 2 ** Math.max(0, nextAttempt - 1), maxBackoffMs);
}

export function createRetryCoordinator(deps: RetryCoordinatorDeps, runtime: RetryRuntimeContext): RetryCoordinator {
  return new RetryCoordinatorImpl(deps, runtime);
}

class RetryCoordinatorImpl implements RetryCoordinator {
  constructor(
    private readonly deps: RetryCoordinatorDeps,
    private readonly runtime: RetryRuntimeContext,
  ) {}

  async dispatch(ctx: OutcomeContext, prepared: PreparedWorkerOutcome): Promise<void> {
    const { outcome } = prepared;

    if (outcome.kind === "normal") {
      const nextAttempt = (prepared.attempt ?? 0) + 1;
      const maxContinuations = ctx.getConfig().agent.maxContinuationAttempts;
      if (nextAttempt > maxContinuations) {
        await this.handleContinuationExhausted(ctx, prepared);
        return;
      }

      this.queuePreparedRetry(prepared, 1_000, "continuation", {
        threadId: prepared.entry.sessionId,
      });
      return;
    }

    if (outcome.errorCode === "model_override_updated") {
      const retryAttempt = prepared.attempt ?? 1;
      this.queueRetry(prepared.latestIssue, retryAttempt, 0, "model_override_updated");
      this.logQueuedRetry(prepared.latestIssue, retryAttempt, 0, "model_override_updated");
      return;
    }

    const strategy = classifyRetryStrategy(outcome.codexErrorInfo ?? null, outcome.errorCode);
    switch (strategy.action) {
      case "hard_fail":
        await handleCancelledOrHardFailure(ctx, prepared);
        return;
      case "retry":
        this.queuePreparedRetry(prepared, strategy.delayMs, strategy.reason);
        return;
      case "compact_and_retry":
      case "default":
        this.handleErrorRetry(prepared);
        return;
    }
  }

  cancel(issueId: string): void {
    const retryEntry = this.runtime.retryEntries.get(issueId);
    if (retryEntry?.timer) {
      clearTimeout(retryEntry.timer);
    }

    const deleted = this.runtime.retryEntries.delete(issueId);
    if (deleted) {
      this.runtime.markDirty();
    }
    if (!this.runtime.runningEntries.has(issueId)) {
      this.runtime.releaseIssueClaim(issueId);
    }
  }

  private handleErrorRetry(prepared: PreparedWorkerOutcome): void {
    const { outcome, entry } = prepared;
    const currentAttempt = prepared.attempt ?? 0;
    const delayMs = computeBackoffForAttempt(currentAttempt, this.runtime.getConfig().agent.maxRetryBackoffMs);

    this.queuePreparedRetry(prepared, delayMs, outcome.errorCode ?? "turn_failed", {
      threadId: entry.sessionId ?? outcome.threadId,
    });
  }

  private queuePreparedRetry(
    prepared: PreparedWorkerOutcome,
    delayMs: number,
    reason: string,
    metadata?: { threadId?: string | null; previousPrFeedback?: string | null },
  ): void {
    const nextAttempt = (prepared.attempt ?? 0) + 1;
    this.queueRetry(prepared.latestIssue, nextAttempt, delayMs, reason, metadata);
    this.logQueuedRetry(prepared.latestIssue, nextAttempt, delayMs, reason);
  }

  private logQueuedRetry(issue: Issue, attempt: number, delayMs: number, reason: string): void {
    this.deps.logger.info(
      { issue_id: issue.id, issue_identifier: issue.identifier, attempt, delay_ms: delayMs, reason },
      "worker retry queued",
    );
  }

  private queueRetry(
    issue: Issue,
    attempt: number,
    delayMs: number,
    error: string | null,
    metadata?: { threadId?: string | null; previousPrFeedback?: string | null },
  ): void {
    if (!this.runtime.isRunning()) {
      return;
    }

    this.runtime.claimIssue(issue.id);
    const existing = this.runtime.retryEntries.get(issue.id);
    if (existing?.timer) {
      clearTimeout(existing.timer);
    }

    const dueAtMs = Date.now() + delayMs;
    const timer = setTimeout(() => {
      void this.revalidateAndLaunch(issue.id, attempt).catch((retryError) => {
        void this.handleRetryLaunchFailure(issue, attempt, retryError);
      });
    }, delayMs);

    this.runtime.retryEntries.set(issue.id, {
      issueId: issue.id,
      identifier: issue.identifier,
      attempt,
      dueAtMs,
      error,
      timer,
      threadId: metadata?.threadId ?? null,
      previousPrFeedback: metadata?.previousPrFeedback ?? null,
      issue,
      workspaceKey: this.runtime.detailViews.get(issue.identifier)?.workspaceKey ?? null,
    });
    this.runtime.markDirty();
    this.runtime.notify({
      type: "worker_retry",
      severity: "critical",
      timestamp: nowIso(),
      message: `retry queued in ${delayMs}ms`,
      issue: issueRef(issue),
      attempt,
      metadata: {
        delayMs,
        error,
      },
    });
  }

  private async revalidateAndLaunch(issueId: string, attempt: number): Promise<void> {
    const retryEntry = this.runtime.retryEntries.get(issueId);
    if (!retryEntry || !this.runtime.isRunning()) {
      return;
    }

    const [latestIssue] = await this.deps.tracker.fetchIssueStatesByIds([issueId]);
    const config = this.runtime.getConfig();

    if (!latestIssue) {
      this.cancel(issueId);
      return;
    }
    retryEntry.issue = latestIssue;

    if (isTerminalState(latestIssue.state, config)) {
      this.cancel(issueId);
      await this.deps.workspaceManager.removeWorkspace(latestIssue.identifier, latestIssue).catch((error: unknown) => {
        this.deps.logger.warn(
          { issueId, identifier: latestIssue.identifier, error: toErrorString(error) },
          "workspace cleanup failed during retry launch",
        );
      });
      return;
    }

    if (!isActiveState(latestIssue.state, config)) {
      this.cancel(issueId);
      return;
    }

    if (
      this.runtime.runningEntries.size >= config.agent.maxConcurrentAgents ||
      !this.runtime.hasAvailableStateSlot(latestIssue)
    ) {
      this.queueRetry(latestIssue, attempt, 1_000, retryEntry.error, {
        threadId: retryEntry.threadId,
        previousPrFeedback: retryEntry.previousPrFeedback,
      });
      return;
    }

    this.runtime.retryEntries.delete(issueId);
    this.runtime.markDirty();
    await this.runtime.launchWorker(latestIssue, attempt, {
      claimHeld: true,
      previousThreadId: retryEntry.threadId,
      previousPrFeedback: retryEntry.previousPrFeedback,
    });
  }

  private async handleRetryLaunchFailure(issue: Issue, attempt: number, error: unknown): Promise<void> {
    const runningEntry = this.runtime.runningEntries.get(issue.id) ?? null;
    this.runtime.runningEntries.delete(issue.id);
    this.runtime.markDirty();
    this.cancel(issue.id);

    const errorText = toErrorString(error);
    const message = `retry startup failed: ${errorText}`;

    this.deps.logger.error(
      { issue_id: issue.id, issue_identifier: issue.identifier, error: errorText },
      "retry-launched worker startup failed",
    );
    this.runtime.pushEvent({
      at: nowIso(),
      issueId: issue.id,
      issueIdentifier: issue.identifier,
      sessionId: runningEntry?.sessionId ?? null,
      event: "worker_failed",
      message,
    });

    const failureView = buildRetryFailureView(this.runtime, issue, runningEntry, errorText, attempt);
    this.runtime.setDetailView(issue.identifier, failureView);
    this.runtime.setCompletedView(issue.identifier, failureView);

    const selection = runningEntry?.modelSelection ?? this.runtime.resolveModelSelection(issue.identifier);
    await persistRetryFailure({
      attemptStore: this.deps.attemptStore,
      runningEntry,
      issue,
      selection,
      errorText,
      attempt,
      workspaceKey: failureView.workspaceKey ?? null,
      logger: this.deps.logger,
    });
  }

  private async handleContinuationExhausted(ctx: OutcomeContext, prepared: PreparedWorkerOutcome): Promise<void> {
    const { entry, latestIssue, workspace, modelSelection, attempt } = prepared;
    const maxContinuations = ctx.getConfig().agent.maxContinuationAttempts;
    const message = `agent did not emit RISOLUTO_STATUS after ${maxContinuations} continuations`;

    ctx.notify({
      type: "worker_failed",
      severity: "critical",
      timestamp: nowIso(),
      message,
      issue: issueRef(latestIssue),
      attempt,
    });
    ctx.setCompletedView(
      latestIssue.identifier,
      ctx.buildOutcomeView({
        issue: latestIssue,
        workspace,
        entry,
        configuredSelection: modelSelection,
        overrides: {
          status: "failed",
          attempt,
          error: "max_continuations_exceeded",
          message,
        },
      }),
    );
    ctx.deps.eventBus?.emit("issue.completed", {
      issueId: latestIssue.id,
      identifier: latestIssue.identifier,
      outcome: "failed",
    });
    ctx.releaseIssueClaim(latestIssue.id);
    await ctx.deps.attemptStore.updateAttempt(entry.runId, {
      status: "failed",
      errorCode: "max_continuations_exceeded",
      errorMessage: message,
    });

    await writeFailureWriteback(ctx, {
      issue: latestIssue,
      entry,
      attemptCount: attempt,
      errorReason: message,
    });
  }
}

function buildRetryFailureView(
  runtime: Pick<RetryRuntimeContext, "detailViews" | "resolveModelSelection">,
  issue: Issue,
  runningEntry: RunningEntry | null,
  errorText: string,
  attempt: number,
): RuntimeIssueView {
  const selection = runningEntry?.modelSelection ?? runtime.resolveModelSelection(issue.identifier);
  const configuredSelection = runtime.resolveModelSelection(issue.identifier);
  const workspaceKey =
    runningEntry?.workspace.workspaceKey ?? runtime.detailViews.get(issue.identifier)?.workspaceKey ?? null;

  return issueView(issue, {
    workspaceKey,
    workspacePath: runningEntry?.workspace.path ?? null,
    status: "failed",
    attempt,
    error: errorText,
    message: `retry startup failed: ${errorText}`,
    startedAt: runningEntry ? new Date(runningEntry.startedAtMs).toISOString() : null,
    tokenUsage: runningEntry?.tokenUsage ?? null,
    configuredModel: configuredSelection.model,
    configuredReasoningEffort: configuredSelection.reasoningEffort,
    configuredModelSource: configuredSelection.source,
    modelChangePending: false,
    model: selection.model,
    reasoningEffort: selection.reasoningEffort,
    modelSource: selection.source,
  });
}

function buildFailureAttemptData(
  runningEntry: RunningEntry | null,
  issue: Issue,
  selection: ModelSelection,
  errorText: string,
  attempt: number,
  workspaceKey: string | null,
  endedAt: string,
): AttemptRecord {
  return {
    attemptId: runningEntry?.runId ?? randomUUID(),
    issueId: issue.id,
    issueIdentifier: issue.identifier,
    title: issue.title,
    workspaceKey,
    workspacePath: runningEntry?.workspace.path ?? null,
    status: "failed",
    attemptNumber: attempt,
    startedAt: runningEntry ? new Date(runningEntry.startedAtMs).toISOString() : endedAt,
    endedAt,
    model: selection.model,
    reasoningEffort: selection.reasoningEffort,
    modelSource: selection.source,
    threadId: runningEntry?.sessionId ?? null,
    turnId: null,
    turnCount: 0,
    errorCode: "worker_failed",
    errorMessage: errorText,
    tokenUsage: runningEntry?.tokenUsage ?? null,
  };
}

interface PersistRetryFailureInput {
  attemptStore: Pick<AttemptStorePort, "updateAttempt" | "createAttempt">;
  runningEntry: RunningEntry | null;
  issue: Issue;
  selection: ModelSelection;
  errorText: string;
  attempt: number;
  workspaceKey: string | null;
  logger: Pick<RisolutoLogger, "warn">;
}

async function persistRetryFailure(input: PersistRetryFailureInput): Promise<void> {
  const { attemptStore, runningEntry, issue, selection, errorText, attempt, workspaceKey, logger } = input;
  const endedAt = nowIso();
  const attemptId = runningEntry?.runId ?? randomUUID();

  let persisted = false;
  if (runningEntry) {
    try {
      await attemptStore.updateAttempt(attemptId, {
        status: "failed" as const,
        endedAt,
        errorCode: "worker_failed",
        errorMessage: errorText,
        tokenUsage: runningEntry.tokenUsage ?? null,
        threadId: runningEntry.sessionId ?? null,
      });
      persisted = true;
    } catch (updateError) {
      logger.warn(
        {
          issue_id: issue.id,
          issue_identifier: issue.identifier,
          attempt_id: attemptId,
          error: toErrorString(updateError),
        },
        "retry failure: failed to update attempt record, falling back to create",
      );
    }
  }

  if (!persisted) {
    const data = buildFailureAttemptData(runningEntry, issue, selection, errorText, attempt, workspaceKey, endedAt);
    try {
      await attemptStore.createAttempt(data);
    } catch (createError) {
      logger.warn(
        { issue_id: issue.id, issue_identifier: issue.identifier, error: toErrorString(createError) },
        "retry failure: failed to create fallback attempt record",
      );
    }
  }
}
