import type { RuntimeEventSink } from "../core/lifecycle-events.js";
import { toErrorString } from "../utils/type-guards.js";
import { issueView } from "./views.js";
import { isActiveState, isTerminalState } from "../state/policy.js";
import type { AttemptRecord, Issue, ServiceConfig } from "../core/types.js";
import type { RetryRuntimeEntry, RunningEntry } from "./runtime-types.js";
import type { RetryCoordinator } from "./retry-coordinator.js";
import {
  planRunningEntryReconciliation,
  projectQueueAndDetailViews,
  seedCompletedClaimsFromAttempts,
} from "./core/lifecycle-state.js";

const VISIBLE_QUEUE_LIMIT = 50;

function reconcileRunning(
  entries: Map<string, RunningEntry>,
  byId: Map<string, Issue>,
  config: ServiceConfig,
): boolean {
  let changed = false;
  for (const plan of planRunningEntryReconciliation(entries, byId, config)) {
    const entry = entries.get(plan.issueId);
    if (!entry || !plan.latestIssue) {
      continue;
    }
    if (plan.issueChanged) {
      entry.issue = plan.latestIssue;
      changed = true;
    }
    if (plan.cleanupOnExit && !entry.cleanupOnExit) {
      entry.cleanupOnExit = true;
      changed = true;
    }
    if (plan.abortReason) {
      entry.abortController.abort(plan.abortReason);
    }
    if (entry.status !== plan.nextStatus) {
      entry.status = plan.nextStatus;
      changed = true;
    }
  }
  return changed;
}
async function reconcileRetries(ctx: ReconcileContext, byId: Map<string, Issue>, config: ServiceConfig): Promise<void> {
  for (const retryEntry of ctx.retryEntries.values()) {
    const latest = byId.get(retryEntry.issueId);
    if (!latest) {
      cancelRetryEntry(ctx, retryEntry.issueId);
      continue;
    }
    retryEntry.issue = latest;
    if (isTerminalState(latest.state, config)) {
      cancelRetryEntry(ctx, retryEntry.issueId);
      await ctx.deps.workspaceManager.removeWorkspace(latest.identifier, latest).catch((error: unknown) => {
        ctx.deps.logger.warn(
          { issueId: retryEntry.issueId, identifier: latest.identifier, error: toErrorString(error) },
          "workspace cleanup failed during retry reconciliation",
        );
      });
    } else if (!isActiveState(latest.state, config)) {
      cancelRetryEntry(ctx, retryEntry.issueId);
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
  retryCoordinator?: RetryCoordinator;
  clearRetryEntry?: (issueId: string) => void;
  pushEvent: RuntimeEventSink;
}

function cancelRetryEntry(ctx: ReconcileContext, issueId: string): void {
  if (ctx.retryCoordinator) {
    ctx.retryCoordinator.cancel(issueId);
    return;
  }
  ctx.clearRetryEntry?.(issueId);
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
type ModelSelectionResolver = (identifier: string) => {
  model: string;
  reasoningEffort: ServiceConfig["codex"]["reasoningEffort"];
  source: "default" | "override";
};

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
    markDirty?: () => void;
    pushEvent?: RuntimeEventSink;
  },
  candidateIssues?: Issue[],
): Promise<void> {
  const issues = candidateIssues ?? (await ctx.deps.tracker.fetchCandidateIssues());
  const projection = projectQueueAndDetailViews({
    issues,
    canDispatchIssue: ctx.canDispatchIssue,
    resolveModelSelection: ctx.resolveModelSelection,
    previousQueuedIssueIds: new Set(ctx.queuedViews.map((view) => view.issueId)),
    visibleQueueLimit: VISIBLE_QUEUE_LIMIT,
  });

  if (ctx.pushEvent) {
    for (const event of projection.queuedEvents) {
      ctx.pushEvent(event);
    }
  }

  ctx.setQueuedViews(projection.queuedViews);
  refreshDetailViews(ctx.detailViews, projection.detailViews, ctx.markDirty);
}

function refreshDetailViews(
  detailViews: Map<string, IssueView>,
  nextDetailViews: Map<string, IssueView>,
  markDirty?: () => void,
): void {
  const hadEntries = detailViews.size > 0 || nextDetailViews.size > 0;
  detailViews.clear();
  nextDetailViews.forEach((detailView, identifier) => detailViews.set(identifier, detailView));
  if (hadEntries) markDirty?.();
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

export function seedCompletedClaims(ctx: {
  claimedIssueIds: Set<string>;
  completedViews: Map<string, ReturnType<typeof issueView>>;
  markDirty?: () => void;
  deps: {
    attemptStore: { getAllAttempts: () => AttemptRecord[] };
    logger: { info: (meta: Record<string, unknown>, message: string) => void };
  };
}): void {
  const projection = seedCompletedClaimsFromAttempts(ctx.deps.attemptStore.getAllAttempts());
  projection.claimedIssueIds.forEach((issueId) => ctx.claimedIssueIds.add(issueId));
  projection.completedViews.forEach((view, identifier) => ctx.completedViews.set(identifier, view));

  if (projection.seededCount > 0) {
    ctx.markDirty?.();
    ctx.deps.logger.info({ count: projection.seededCount }, "seeded completed views from attempt store");
  }
}
