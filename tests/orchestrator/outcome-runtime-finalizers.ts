import type { ConfigStore } from "../../src/config/store.js";
import type { IssueConfigStorePort } from "../../src/core/issue-config-port.js";
import type { RuntimeIssueView, TokenUsageSnapshot } from "../../src/core/types.js";
import type { OutcomeContext } from "../../src/orchestrator/context.js";
import {
  createRunLifecycleCoordinator,
  type OrchestratorState,
} from "../../src/orchestrator/run-lifecycle-coordinator.js";
import type { OrchestratorDeps, RetryRuntimeEntry } from "../../src/orchestrator/runtime-types.js";
import type { StallEvent } from "../../src/orchestrator/stall-detector.js";

interface AttachOutcomeRuntimeFinalizersOptions {
  running?: boolean;
  retryEntries?: Map<string, RetryRuntimeEntry>;
  claimedIssueIds?: Set<string>;
  queuedViews?: RuntimeIssueView[];
  recentEvents?: OrchestratorState["recentEvents"];
  issueModelOverrides?: OrchestratorState["issueModelOverrides"];
  issueTemplateOverrides?: OrchestratorState["issueTemplateOverrides"];
  operatorAbortSuppressions?: OrchestratorState["operatorAbortSuppressions"];
  sessionUsageTotals?: Map<string, TokenUsageSnapshot>;
  codexTotals?: OrchestratorState["codexTotals"];
  stallEvents?: StallEvent[];
}

export function attachOutcomeRuntimeFinalizers(
  ctx: OutcomeContext,
  options: AttachOutcomeRuntimeFinalizersOptions = {},
): OutcomeContext {
  const tracker = {
    fetchCandidateIssues: async () => [],
    fetchIssuesByStates: async () => [],
    fetchIssueStatesByIds: ctx.deps.tracker.fetchIssueStatesByIds,
    resolveStateId: ctx.deps.tracker.resolveStateId,
    updateIssueState: ctx.deps.tracker.updateIssueState,
    createComment: ctx.deps.tracker.createComment,
    ...ctx.deps.tracker,
  };

  const state: OrchestratorState = {
    running: options.running ?? ctx.isRunning(),
    runningEntries: ctx.runningEntries,
    retryEntries: options.retryEntries ?? new Map<string, RetryRuntimeEntry>(),
    completedViews: ctx.completedViews,
    detailViews: ctx.detailViews,
    claimedIssueIds: options.claimedIssueIds ?? new Set<string>(),
    queuedViews: options.queuedViews ?? [],
    recentEvents: options.recentEvents ?? [],
    rateLimits: null,
    issueModelOverrides: options.issueModelOverrides ?? new Map(),
    issueTemplateOverrides: options.issueTemplateOverrides ?? new Map(),
    operatorAbortSuppressions: options.operatorAbortSuppressions,
    sessionUsageTotals: options.sessionUsageTotals ?? new Map(),
    codexTotals: options.codexTotals ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0, secondsRunning: 0 },
    stallEvents: options.stallEvents ?? [],
    markDirty: ctx.markDirty,
  };

  const deps: OrchestratorDeps = {
    attemptStore: ctx.deps.attemptStore as OrchestratorDeps["attemptStore"],
    configStore: {
      getConfig: () => ctx.getConfig(),
      getWorkflow: () => ({ config: {}, promptTemplate: "Prompt" }),
      subscribe: () => () => undefined,
    } as unknown as ConfigStore,
    tracker: tracker as OrchestratorDeps["tracker"],
    workspaceManager: ctx.deps.workspaceManager as OrchestratorDeps["workspaceManager"],
    agentRunner: {
      runAttempt: async () => {
        throw new Error("test harness agentRunner should not be used");
      },
    } as OrchestratorDeps["agentRunner"],
    issueConfigStore: {
      loadAll: () => [],
      upsertModel: () => undefined,
      upsertTemplateId: () => undefined,
      clearTemplateId: () => undefined,
    } as unknown as IssueConfigStorePort,
    eventBus: ctx.deps.eventBus,
    notificationManager: {
      notify: async (event) => {
        ctx.notify(event);
      },
    },
    gitManager: ctx.deps.gitManager as OrchestratorDeps["gitManager"],
    logger: ctx.deps.logger as OrchestratorDeps["logger"],
    resolveTemplate: async () => "Prompt",
  };

  const runtimeCtx = createRunLifecycleCoordinator(state, deps).getContext();
  runtimeCtx.releaseIssueClaim = ctx.releaseIssueClaim;
  if (ctx.suppressIssueDispatch) {
    runtimeCtx.suppressIssueDispatch = ctx.suppressIssueDispatch;
  }

  ctx.finalizeTerminalPath = runtimeCtx.finalizeTerminalPath;
  ctx.finalizeStopSignal = runtimeCtx.finalizeStopSignal;
  return ctx;
}
