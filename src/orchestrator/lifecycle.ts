import { sortIssuesForDispatch } from "./dispatch.js";
import { createLifecycleEvent, type RuntimeEventSink } from "../core/lifecycle-events.js";
import { toErrorString } from "../utils/type-guards.js";
import { issueView } from "./views.js";
import { isActiveState, isTerminalState } from "../state/policy.js";
import type { AttemptRecord, Issue, ServiceConfig } from "../core/types.js";
import type { RetryRuntimeEntry, RunningEntry } from "./runtime-types.js";

function reconcileRunning(
  entries: Map<string, RunningEntry>,
  byId: Map<string, Issue>,
  config: ServiceConfig,
): boolean {
  let changed = false;
  for (const entry of entries.values()) {
    const latest = byId.get(entry.issue.id);
    if (!latest) {
      continue;
    }
    changed = syncRunningEntry(entry, latest, config) || changed;
  }
  return changed;
}

function syncRunningEntry(entry: RunningEntry, latest: Issue, config: ServiceConfig): boolean {
  let changed = false;
  if (entry.issue !== latest) {
    entry.issue = latest;
    changed = true;
  }

  if (isTerminalState(latest.state, config)) {
    return markRunningEntryStopping(entry, "terminal", true) || changed;
  }
  if (!isActiveState(latest.state, config) && !entry.abortController.signal.aborted) {
    return markRunningEntryStopping(entry, "inactive", false) || changed;
  }
  return changed;
}

function markRunningEntryStopping(
  entry: RunningEntry,
  reason: "terminal" | "inactive",
  cleanupOnExit: boolean,
): boolean {
  let changed = false;
  if (cleanupOnExit && !entry.cleanupOnExit) {
    entry.cleanupOnExit = true;
    changed = true;
  }
  if (!entry.abortController.signal.aborted) {
    entry.abortController.abort(reason);
  }
  if (entry.status !== "stopping") {
    entry.status = "stopping";
    changed = true;
  }
  return changed;
}
async function reconcileRetries(ctx: ReconcileContext, byId: Map<string, Issue>, config: ServiceConfig): Promise<void> {
  for (const retryEntry of ctx.retryEntries.values()) {
    const latest = byId.get(retryEntry.issueId);
    if (!latest) {
      ctx.clearRetryEntry(retryEntry.issueId);
      continue;
    }
    retryEntry.issue = latest;
    if (isTerminalState(latest.state, config)) {
      ctx.clearRetryEntry(retryEntry.issueId);
      await ctx.deps.workspaceManager.removeWorkspace(latest.identifier, latest).catch((error: unknown) => {
        ctx.deps.logger.warn(
          { issueId: retryEntry.issueId, identifier: latest.identifier, error: toErrorString(error) },
          "workspace cleanup failed during retry reconciliation",
        );
      });
    } else if (!isActiveState(latest.state, config)) {
      ctx.clearRetryEntry(retryEntry.issueId);
    }
  }
}
interface ReconcileContext {
  runningEntries: Map<string, RunningEntry>;
  retryEntries: Map<string, RetryRuntimeEntry>;
  deps: {
    tracker: {
      fetchIssueStatesByIds: (ids: string[]) => Promise<Issue[]>;
      fetchIssuesByStates: (states: string[]) => Promise<Issue[]>;
    };
    workspaceManager: { removeWorkspace: (identifier: string, issue?: Issue) => Promise<void> };
    logger: { warn: (meta: Record<string, unknown>, message: string) => void };
  };
  getConfig: () => ServiceConfig;
  clearRetryEntry: (issueId: string) => void;
  pushEvent: RuntimeEventSink;
}
export async function reconcileRunningAndRetrying(ctx: ReconcileContext): Promise<boolean> {
  const config = ctx.getConfig();

  const trackedIds = new Set<string>([...ctx.runningEntries.keys(), ...ctx.retryEntries.keys()]);
  if (trackedIds.size === 0) {
    return false;
  }

  const issues = await ctx.deps.tracker.fetchIssueStatesByIds([...trackedIds]);
  const byId = new Map(issues.map((issue) => [issue.id, issue]));

  const runningChanged = reconcileRunning(ctx.runningEntries, byId, config);
  await reconcileRetries(ctx, byId, config);
  return runningChanged;
}
interface ModelSelectionResolver {
  (identifier: string): {
    model: string;
    reasoningEffort: ServiceConfig["codex"]["reasoningEffort"];
    source: "default" | "override";
  };
}

export async function refreshQueueViews(
  ctx: {
    queuedViews: IssueView[];
    detailViews: Map<string, IssueView>;
    claimedIssueIds: Set<string>;
    deps: {
      tracker: { fetchCandidateIssues: () => Promise<Issue[]> };
    };
    canDispatchIssue: (issue: Issue) => boolean;
    resolveModelSelection: ModelSelectionResolver;
    setQueuedViews: (views: IssueView[]) => void;
    pushEvent?: RuntimeEventSink;
  },
  candidateIssues?: Issue[],
): Promise<void> {
  const issues = candidateIssues ?? sortIssuesForDispatch(await ctx.deps.tracker.fetchCandidateIssues());
  const dispatchableIssues = issues.filter((issue) => ctx.canDispatchIssue(issue));
  const previousQueuedIssueIds = new Set(ctx.queuedViews.map((view) => view.issueId));
  const visibleQueuedIssues = dispatchableIssues.slice(0, 50);
  const queuedViews = visibleQueuedIssues.map((issue) => {
    const selection = ctx.resolveModelSelection(issue.identifier);
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

  if (ctx.pushEvent) {
    for (const issue of visibleQueuedIssues) {
      if (previousQueuedIssueIds.has(issue.id)) {
        continue;
      }
      ctx.pushEvent(
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
    }
  }
  ctx.setQueuedViews(queuedViews);

  refreshDetailViews(ctx.detailViews, issues, ctx.resolveModelSelection);
}

function refreshDetailViews(
  detailViews: Map<string, IssueView>,
  issues: Issue[],
  resolveModelSelection: ModelSelectionResolver,
): void {
  const nextDetailViews = new Map<string, IssueView>();
  for (const issue of issues) {
    const selection = resolveModelSelection(issue.identifier);
    nextDetailViews.set(
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
  detailViews.clear();
  nextDetailViews.forEach((detailView, identifier) => detailViews.set(identifier, detailView));
}
export async function cleanupTerminalIssueWorkspaces(ctx: {
  deps: {
    tracker: { fetchIssuesByStates: (states: string[]) => Promise<Issue[]> };
    workspaceManager: { removeWorkspace: (identifier: string, issue?: Issue) => Promise<void> };
    logger: { warn: (meta: Record<string, unknown>, message: string) => void };
  };
  getConfig: () => ServiceConfig;
}): Promise<void> {
  try {
    const terminalIssues = await ctx.deps.tracker.fetchIssuesByStates(ctx.getConfig().tracker.terminalStates);
    await Promise.all(
      terminalIssues.map((issue) =>
        ctx.deps.workspaceManager.removeWorkspace(issue.identifier, issue).catch((error: unknown) => {
          ctx.deps.logger.warn(
            { identifier: issue.identifier, error: toErrorString(error) },
            "workspace cleanup failed for terminal issue",
          );
        }),
      ),
    );
  } catch (error) {
    ctx.deps.logger.warn({ error: toErrorString(error) }, "startup terminal workspace cleanup failed");
  }
}

type IssueView = ReturnType<typeof issueView>;

const TERMINAL_ATTEMPT_STATUSES = new Set(["completed", "failed", "timed_out", "stalled", "cancelled", "paused"]);

export function seedCompletedClaims(ctx: {
  claimedIssueIds: Set<string>;
  completedViews: Map<string, ReturnType<typeof issueView>>;
  deps: {
    attemptStore: { getAllAttempts: () => AttemptRecord[] };
    logger: { info: (meta: Record<string, unknown>, message: string) => void };
  };
}): void {
  const attempts = ctx.deps.attemptStore.getAllAttempts();
  const latestByIssue = new Map<string, AttemptRecord>();
  for (const attempt of attempts) {
    const key = attempt.issueIdentifier;
    const existing = latestByIssue.get(key);
    if (!existing || attempt.startedAt > existing.startedAt) {
      latestByIssue.set(key, attempt);
    }
  }
  let seeded = 0;
  for (const [, attempt] of latestByIssue) {
    if (attempt.status === "completed") {
      ctx.claimedIssueIds.add(attempt.issueId);
    }
    if (TERMINAL_ATTEMPT_STATUSES.has(attempt.status)) {
      ctx.completedViews.set(attempt.issueIdentifier, attemptToCompletedView(attempt));
      seeded++;
    }
  }
  if (seeded > 0) {
    ctx.deps.logger.info({ count: seeded }, "seeded completed views from attempt store");
  }
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

function attemptToCompletedView(attempt: AttemptRecord): ReturnType<typeof issueView> {
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
