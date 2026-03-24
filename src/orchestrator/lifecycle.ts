import { sortIssuesForDispatch } from "./dispatch.js";
import { createLifecycleEvent, type RuntimeEventSink } from "./lifecycle-events.js";
import { issueView, nowIso } from "./views.js";
import { isActiveState, isTerminalState } from "../state/policy.js";
import type { AttemptRecord, Issue, ServiceConfig } from "../core/types.js";
import type { RetryRuntimeEntry, RunningEntry } from "./runtime-types.js";

function enforceStallTimeouts(ctx: ReconcileContext, now: number, config: ServiceConfig): void {
  if (config.codex.stallTimeoutMs <= 0) {
    return;
  }
  for (const entry of ctx.runningEntries.values()) {
    if (!entry.abortController.signal.aborted && now - entry.lastEventAtMs > config.codex.stallTimeoutMs) {
      entry.abortController.abort("stalled");
      entry.status = "stopping";
      ctx.pushEvent({
        at: nowIso(),
        issueId: entry.issue.id,
        issueIdentifier: entry.issue.identifier,
        sessionId: entry.sessionId,
        event: "worker_stalled",
        message: "worker exceeded stall timeout and was cancelled",
      });
    }
  }
}

function reconcileRunning(entries: Map<string, RunningEntry>, byId: Map<string, Issue>, config: ServiceConfig): void {
  for (const entry of entries.values()) {
    const latest = byId.get(entry.issue.id);
    if (!latest) {
      continue;
    }
    entry.issue = latest;
    if (isTerminalState(latest.state, config)) {
      entry.cleanupOnExit = true;
      if (!entry.abortController.signal.aborted) {
        entry.abortController.abort("terminal");
      }
      entry.status = "stopping";
    } else if (!isActiveState(latest.state, config) && !entry.abortController.signal.aborted) {
      entry.abortController.abort("inactive");
      entry.status = "stopping";
    }
  }
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
          { issueId: retryEntry.issueId, identifier: latest.identifier, error: String(error) },
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
    linearClient: {
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
export async function reconcileRunningAndRetrying(ctx: ReconcileContext): Promise<void> {
  const now = Date.now();
  const config = ctx.getConfig();

  enforceStallTimeouts(ctx, now, config);

  const trackedIds = new Set<string>([...ctx.runningEntries.keys(), ...ctx.retryEntries.keys()]);
  if (trackedIds.size === 0) {
    return;
  }

  const issues = await ctx.deps.linearClient.fetchIssueStatesByIds([...trackedIds]);
  const byId = new Map(issues.map((issue) => [issue.id, issue]));

  reconcileRunning(ctx.runningEntries, byId, config);
  await reconcileRetries(ctx, byId, config);
}
export async function refreshQueueViews(ctx: {
  queuedViews: IssueView[];
  detailViews: Map<string, IssueView>;
  claimedIssueIds: Set<string>;
  deps: {
    linearClient: { fetchCandidateIssues: () => Promise<Issue[]> };
  };
  canDispatchIssue: (issue: Issue) => boolean;
  resolveModelSelection: (identifier: string) => {
    model: string;
    reasoningEffort: ServiceConfig["codex"]["reasoningEffort"];
    source: "default" | "override";
  };
  setQueuedViews: (views: IssueView[]) => void;
  pushEvent?: RuntimeEventSink;
}): Promise<void> {
  const issues = sortIssuesForDispatch(await ctx.deps.linearClient.fetchCandidateIssues());
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

  const nextDetailViews = new Map<string, IssueView>();
  for (const issue of issues) {
    const selection = ctx.resolveModelSelection(issue.identifier);
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
  ctx.detailViews.clear();
  nextDetailViews.forEach((detailView, identifier) => ctx.detailViews.set(identifier, detailView));
}
export async function cleanupTerminalIssueWorkspaces(ctx: {
  deps: {
    linearClient: { fetchIssuesByStates: (states: string[]) => Promise<Issue[]> };
    workspaceManager: { removeWorkspace: (identifier: string, issue?: Issue) => Promise<void> };
    logger: { warn: (meta: Record<string, unknown>, message: string) => void };
  };
  getConfig: () => ServiceConfig;
}): Promise<void> {
  try {
    const terminalIssues = await ctx.deps.linearClient.fetchIssuesByStates(ctx.getConfig().tracker.terminalStates);
    await Promise.all(
      terminalIssues.map((issue) =>
        ctx.deps.workspaceManager.removeWorkspace(issue.identifier, issue).catch((error: unknown) => {
          ctx.deps.logger.warn(
            { identifier: issue.identifier, error: String(error) },
            "workspace cleanup failed for terminal issue",
          );
        }),
      ),
    );
  } catch (error) {
    ctx.deps.logger.warn({ error: String(error) }, "startup terminal workspace cleanup failed");
  }
}

type IssueView = ReturnType<typeof issueView>;

export function seedCompletedClaims(ctx: {
  claimedIssueIds: Set<string>;
  deps: {
    attemptStore: { getAllAttempts: () => AttemptRecord[] };
    logger: { info: (meta: Record<string, unknown>, message: string) => void };
  };
}): void {
  const attempts = ctx.deps.attemptStore.getAllAttempts();
  const latestByIssueId = new Map<string, AttemptRecord>();
  for (const attempt of attempts) {
    const existing = latestByIssueId.get(attempt.issueId);
    if (!existing || attempt.startedAt > existing.startedAt) {
      latestByIssueId.set(attempt.issueId, attempt);
    }
  }
  let seeded = 0;
  for (const [issueId, attempt] of latestByIssueId) {
    if (attempt.status === "completed") {
      ctx.claimedIssueIds.add(issueId);
      seeded++;
    }
  }
  if (seeded > 0) {
    ctx.deps.logger.info({ count: seeded }, "seeded completed issue claims from attempt store");
  }
}
