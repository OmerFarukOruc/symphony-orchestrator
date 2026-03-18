import { randomUUID } from "node:crypto";

import { isBlockedByNonTerminal, sortIssuesForDispatch } from "./dispatch.js";
import { issueView, nowIso } from "./views.js";
import { isActiveState, isTodoState, normalizeStateKey } from "../state/policy.js";
import type { NotificationEvent } from "../notification/channel.js";
import type {
  Issue,
  ModelSelection,
  RecentEvent,
  RunOutcome,
  ServiceConfig,
  TokenUsageSnapshot,
  Workspace,
} from "../core/types.js";
import type { OrchestratorDeps, RunningEntry } from "./runtime-types.js";

export function canDispatchIssue(issue: Issue, config: ServiceConfig, claimedIssueIds: Set<string>): boolean {
  if (!isActiveState(issue.state, config)) {
    return false;
  }
  if (claimedIssueIds.has(issue.id)) {
    return false;
  }
  if (isTodoState(issue.state, config)) {
    return !isBlockedByNonTerminal(issue, config);
  }
  return true;
}

export function hasAvailableStateSlot(
  issue: Issue,
  config: ServiceConfig,
  runningEntries: Map<string, RunningEntry>,
  pendingStateCounts?: Map<string, number>,
): boolean {
  const stateKey = normalizeStateKey(issue.state);
  const configuredLimit = config.agent.maxConcurrentAgentsByState[stateKey];
  if (configuredLimit === undefined) {
    return true;
  }

  const runningCount = [...runningEntries.values()].filter(
    (entry) => normalizeStateKey(entry.issue.state) === stateKey,
  ).length;
  const pendingCount = pendingStateCounts?.get(stateKey) ?? 0;
  return runningCount + pendingCount < configuredLimit;
}

export async function launchAvailableWorkers(ctx: {
  deps: Pick<OrchestratorDeps, "linearClient">;
  getConfig: () => ServiceConfig;
  runningEntries: Map<string, RunningEntry>;
  claimIssue: (issueId: string) => void;
  canDispatchIssue: (issue: Issue) => boolean;
  hasAvailableStateSlot: (issue: Issue, pendingStateCounts?: Map<string, number>) => boolean;
  launchWorker: (issue: Issue, attempt: number | null, options?: { claimHeld?: boolean }) => Promise<void>;
}): Promise<void> {
  const config = ctx.getConfig();
  const availableSlots = config.agent.maxConcurrentAgents - ctx.runningEntries.size;
  if (availableSlots <= 0) {
    return;
  }

  const issues = sortIssuesForDispatch(await ctx.deps.linearClient.fetchCandidateIssues());
  let launched = 0;
  const pendingStateCounts = new Map<string, number>();
  for (const issue of issues) {
    if (launched >= availableSlots) {
      break;
    }
    if (!ctx.canDispatchIssue(issue)) {
      continue;
    }
    if (!ctx.hasAvailableStateSlot(issue, pendingStateCounts)) {
      continue;
    }
    ctx.claimIssue(issue.id);
    launched += 1;
    const stateKey = normalizeStateKey(issue.state);
    pendingStateCounts.set(stateKey, (pendingStateCounts.get(stateKey) ?? 0) + 1);
    await ctx.launchWorker(issue, null, { claimHeld: true });
  }
}

type LaunchContext = {
  deps: Pick<
    OrchestratorDeps,
    "agentRunner" | "attemptStore" | "configStore" | "workspaceManager" | "repoRouter" | "gitManager" | "logger"
  >;
  runningEntries: Map<string, RunningEntry>;
  completedViews: Map<string, ReturnType<typeof issueView>>;
  detailViews: Map<string, ReturnType<typeof issueView>>;
  getQueuedViews: () => ReturnType<typeof issueView>[];
  setQueuedViews: (views: ReturnType<typeof issueView>[]) => void;
  claimIssue: (issueId: string) => void;
  releaseIssueClaim: (issueId: string) => void;
  resolveModelSelection: (identifier: string) => ModelSelection;
  notify: (event: NotificationEvent) => void;
  pushEvent: (event: RecentEvent & { usage?: unknown; rateLimits?: unknown }) => void;
  applyUsageEvent: (entry: RunningEntry, usage: TokenUsageSnapshot, usageMode: "absolute_total" | "delta") => void;
  setRateLimits: (rateLimits: unknown | null) => void;
  handleWorkerPromise: (
    promise: Promise<RunOutcome>,
    issue: Issue,
    workspace: Workspace,
    entry: RunningEntry,
    attempt: number | null,
  ) => Promise<void>;
};

async function prepareWorkspace(
  ctx: LaunchContext,
  issue: Issue,
): Promise<Awaited<ReturnType<typeof ctx.deps.workspaceManager.ensureWorkspace>>> {
  const repoMatch = ctx.deps.repoRouter?.matchIssue(issue) ?? null;
  try {
    const workspace = await ctx.deps.workspaceManager.ensureWorkspace(issue.identifier);
    if (repoMatch && workspace.createdNow && ctx.deps.gitManager) {
      await ctx.deps.gitManager.cloneInto(repoMatch, workspace.path, issue);
    }
    return workspace;
  } catch (error) {
    ctx.releaseIssueClaim(issue.id);
    throw error;
  }
}

function buildRunningEntry(
  ctx: LaunchContext,
  issue: Issue,
  workspace: Workspace,
  attempt: number | null,
  modelSelection: ModelSelection,
): RunningEntry {
  const runId = randomUUID();
  let persistenceQueue = Promise.resolve();
  const queuePersistence = (task: () => Promise<void>) => {
    persistenceQueue = persistenceQueue.then(task).catch((error) => {
      ctx.deps.logger.warn(
        {
          issue_id: issue.id,
          issue_identifier: issue.identifier,
          attempt_id: runId,
          error: String(error),
        },
        "attempt persistence write failed",
      );
    });
  };
  return {
    runId,
    issue,
    workspace,
    startedAtMs: Date.now(),
    lastEventAtMs: Date.now(),
    attempt,
    abortController: new AbortController(),
    promise: Promise.resolve(),
    cleanupOnExit: false,
    status: "running",
    sessionId: null,
    tokenUsage: null,
    modelSelection,
    lastAgentMessageContent: null,
    repoMatch: ctx.deps.repoRouter?.matchIssue(issue) ?? null,
    queuePersistence,
    flushPersistence: () => persistenceQueue,
  };
}

async function persistInitialAttempt(
  ctx: LaunchContext,
  entry: RunningEntry,
  issue: Issue,
  workspace: Workspace,
  attempt: number | null,
  modelSelection: ModelSelection,
): Promise<void> {
  await ctx.deps.attemptStore.createAttempt({
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
}

function emitLaunchNotifications(
  ctx: LaunchContext,
  issue: Issue,
  workspace: Workspace,
  attempt: number | null,
  modelSelection: ModelSelection,
): void {
  const issueRef = {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    state: issue.state,
    url: issue.url,
  };
  ctx.notify({
    type: "issue_claimed",
    severity: "info",
    timestamp: nowIso(),
    message: "issue claimed for execution",
    issue: issueRef,
    attempt,
    metadata: { workspace: workspace.path },
  });
  ctx.notify({
    type: "worker_launched",
    severity: "info",
    timestamp: nowIso(),
    message: "worker launched",
    issue: issueRef,
    attempt,
    metadata: {
      workspace: workspace.path,
      model: modelSelection.model,
      reasoningEffort: modelSelection.reasoningEffort,
    },
  });
}

function buildOnEventHandler(
  ctx: LaunchContext,
  entry: RunningEntry,
): (
  event: RecentEvent & {
    usage?: TokenUsageSnapshot;
    usageMode?: "absolute_total" | "delta";
    rateLimits?: unknown;
    content?: string | null;
  },
) => void {
  return (event) => {
    entry.sessionId = event.sessionId;
    entry.lastEventAtMs = Date.now();
    if (event.event === "item_completed" && event.message.includes("agentMessage") && event.content) {
      entry.lastAgentMessageContent = event.content;
    }
    ctx.pushEvent(event);
    if (event.usage) {
      ctx.applyUsageEvent(entry, event.usage, event.usageMode ?? "delta");
    }
    if (event.rateLimits !== undefined) {
      ctx.setRateLimits(event.rateLimits);
    }
    entry.queuePersistence(async () => {
      await ctx.deps.attemptStore.appendEvent({
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
        await ctx.deps.attemptStore.updateAttempt(entry.runId, { tokenUsage: entry.tokenUsage });
      }
    });
  };
}

export async function launchWorker(
  ctx: LaunchContext,
  issue: Issue,
  attempt: number | null,
  options?: { claimHeld?: boolean },
): Promise<void> {
  if (!options?.claimHeld) {
    ctx.claimIssue(issue.id);
  }

  const workspace = await prepareWorkspace(ctx, issue);
  const modelSelection = ctx.resolveModelSelection(issue.identifier);
  const entry = buildRunningEntry(ctx, issue, workspace, attempt, modelSelection);

  ctx.runningEntries.set(issue.id, entry);
  ctx.completedViews.delete(issue.identifier);
  ctx.setQueuedViews(ctx.getQueuedViews().filter((view) => view.issueId !== issue.id));

  await persistInitialAttempt(ctx, entry, issue, workspace, attempt, modelSelection);
  ctx.detailViews.set(
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
  emitLaunchNotifications(ctx, issue, workspace, attempt, modelSelection);

  const workflow = ctx.deps.configStore.getWorkflow();
  const promise = ctx.deps.agentRunner.runAttempt({
    issue,
    attempt,
    modelSelection,
    promptTemplate: workflow.promptTemplate,
    workspace,
    signal: entry.abortController.signal,
    onEvent: buildOnEventHandler(ctx, entry),
  });
  entry.promise = ctx.handleWorkerPromise(promise, issue, workspace, entry, attempt);
}
