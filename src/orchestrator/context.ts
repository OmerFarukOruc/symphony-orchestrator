import type { Issue, ModelSelection, RuntimeIssueView, ServiceConfig, TokenUsageSnapshot } from "../core/types.js";
import type { OrchestratorDeps, RetryRuntimeEntry, RunningEntry } from "./runtime-types.js";
import type { LaunchWorkerOptions } from "./runtime-types.js";
import type { StallEvent } from "./stall-detector.js";
import type { RuntimeEventRecord } from "../core/lifecycle-events.js";
import type { GitDiffPort, GitPostRunPort } from "../git/port.js";
import type { NotificationEvent } from "../notification/channel.js";
import type { TypedEventBus } from "../core/event-bus.js";
import type { RisolutoEventMap } from "../core/risoluto-events.js";
import type { WorkspaceRemovalResult } from "../workspace/manager.js";
import type { OutcomeViewInput } from "./outcome-view-builder.js";
import type { StopSignal } from "../core/signal-detection.js";
import type { PreparedWorkerOutcome, TerminalPathKind } from "./worker-outcome/types.js";

/**
 * Retry coordination contract. Defined here (rather than retry-coordinator.ts)
 * to avoid a circular import: retry-coordinator.ts depends on OutcomeContext and
 * RetryRuntimeContext from this file, so the interface must live upstream.
 */
export interface RetryCoordinator {
  dispatch(ctx: OutcomeContext, prepared: PreparedWorkerOutcome): Promise<void>;
  cancel(issueId: string): void;
}

/** Shared context type for outcome handlers. Used internally by worker-outcome.ts. */
export interface OutcomeContext {
  runningEntries: Map<string, RunningEntry>;
  completedViews: Map<string, RuntimeIssueView>;
  detailViews: Map<string, RuntimeIssueView>;
  deps: {
    tracker: {
      fetchIssueStatesByIds: (ids: string[]) => Promise<Issue[]>;
      resolveStateId: (stateName: string) => Promise<string | null>;
      updateIssueState: (issueId: string, stateId: string) => Promise<void>;
      createComment: (issueId: string, body: string) => Promise<void>;
    };
    attemptStore: {
      updateAttempt: (attemptId: string, patch: Record<string, unknown>) => Promise<void>;
      appendEvent?: (event: import("../core/types.js").AttemptEvent) => Promise<void>;
      appendCheckpoint?: (
        checkpoint: Omit<import("../core/types.js").AttemptCheckpointRecord, "checkpointId" | "ordinal">,
      ) => Promise<void>;
      upsertPr?: (pr: import("../core/attempt-store-port.js").UpsertPrInput) => Promise<void>;
    };
    workspaceManager: {
      removeWorkspace: (identifier: string, issue?: Issue) => Promise<void>;
      removeWorkspaceWithResult?: (identifier: string, issue?: Issue) => Promise<WorkspaceRemovalResult>;
    };
    gitManager?: GitPostRunPort & GitDiffPort;
    eventBus?: TypedEventBus<RisolutoEventMap>;
    logger: {
      info: (meta: Record<string, unknown>, message: string) => void;
      warn: (meta: Record<string, unknown>, message: string) => void;
    };
  };
  isRunning: () => boolean;
  getConfig: () => ServiceConfig;
  releaseIssueClaim: (issueId: string) => void;
  suppressIssueDispatch?: (issue: Issue) => void;
  markDirty: () => void;
  resolveModelSelection: (identifier: string) => ModelSelection;
  buildOutcomeView: (input: OutcomeViewInput) => RuntimeIssueView;
  setDetailView: (identifier: string, view: RuntimeIssueView) => RuntimeIssueView;
  setCompletedView: (identifier: string, view: RuntimeIssueView) => RuntimeIssueView;
  finalizeTerminalPath?: (kind: TerminalPathKind, prepared: PreparedWorkerOutcome) => Promise<void>;
  finalizeStopSignal?: (
    stopSignal: StopSignal,
    prepared: PreparedWorkerOutcome,
    turnCount: number | null,
  ) => Promise<void>;
  notify: (event: NotificationEvent) => void;
  retryCoordinator: RetryCoordinator;
}

export interface OrchestratorContext {
  running: boolean;
  runningEntries: Map<string, RunningEntry>;
  retryEntries: Map<string, RetryRuntimeEntry>;
  completedViews: Map<string, RuntimeIssueView>;
  detailViews: Map<string, RuntimeIssueView>;
  claimedIssueIds: Set<string>;
  queuedViews: RuntimeIssueView[];
  deps: OrchestratorDeps;
  getConfig: () => ServiceConfig;
  isRunning: () => boolean;
  resolveModelSelection: (identifier: string) => ModelSelection;
  releaseIssueClaim: (issueId: string) => void;
  claimIssue: (issueId: string) => void;
  markDirty: () => void;
  notify: (event: NotificationEvent) => void;
  pushEvent: (event: RuntimeEventRecord) => void;
  retryCoordinator: RetryCoordinator;
  buildOutcomeView: (input: OutcomeViewInput) => RuntimeIssueView;
  setDetailView: (identifier: string, view: RuntimeIssueView) => RuntimeIssueView;
  setCompletedView: (identifier: string, view: RuntimeIssueView) => RuntimeIssueView;
  finalizeTerminalPath?: (kind: TerminalPathKind, prepared: PreparedWorkerOutcome) => Promise<void>;
  finalizeStopSignal?: (
    stopSignal: StopSignal,
    prepared: PreparedWorkerOutcome,
    turnCount: number | null,
  ) => Promise<void>;
  launchWorker: (issue: Issue, attempt: number | null, options?: LaunchWorkerOptions) => Promise<void>;
  canDispatchIssue: (issue: Issue) => boolean;
  hasAvailableStateSlot: (
    issue: Issue,
    pendingStateCounts?: Map<string, number>,
    runningStateCounts?: Map<string, number>,
  ) => boolean;
  getQueuedViews: () => RuntimeIssueView[];
  setQueuedViews: (views: RuntimeIssueView[]) => void;
  suppressIssueDispatch?: (issue: Issue) => void;
  applyUsageEvent: (entry: RunningEntry, usage: TokenUsageSnapshot, usageMode: "absolute_total" | "delta") => void;
  setRateLimits: (rateLimits: unknown) => void;
  getStallEvents: () => StallEvent[];
  detectAndKillStalled: () => { killed: number };
  eventBus?: TypedEventBus<RisolutoEventMap>;
}

export type RetryRuntimeContext = Pick<
  OrchestratorContext,
  | "runningEntries"
  | "retryEntries"
  | "detailViews"
  | "completedViews"
  | "isRunning"
  | "getConfig"
  | "claimIssue"
  | "releaseIssueClaim"
  | "hasAvailableStateSlot"
  | "markDirty"
  | "notify"
  | "pushEvent"
  | "resolveModelSelection"
  | "setDetailView"
  | "setCompletedView"
  | "launchWorker"
>;
