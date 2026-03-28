import type { Issue, ModelSelection, RuntimeIssueView, ServiceConfig, TokenUsageSnapshot } from "../core/types.js";
import type { OrchestratorDeps, RetryRuntimeEntry, RunningEntry } from "./runtime-types.js";
import type { StallEvent } from "./stall-detector.js";
import type { RuntimeEventRecord } from "../core/lifecycle-events.js";
import type { GitPostRunPort } from "../git/port.js";
import type { NotificationEvent } from "../notification/channel.js";
import type { TypedEventBus } from "../core/event-bus.js";
import type { SymphonyEventMap } from "../core/symphony-events.js";

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
    attemptStore: { updateAttempt: (attemptId: string, patch: Record<string, unknown>) => Promise<void> };
    workspaceManager: { removeWorkspace: (identifier: string, issue?: Issue) => Promise<void> };
    gitManager?: GitPostRunPort;
    eventBus?: TypedEventBus<SymphonyEventMap>;
    logger: {
      info: (meta: Record<string, unknown>, message: string) => void;
      warn: (meta: Record<string, unknown>, message: string) => void;
    };
  };
  isRunning: () => boolean;
  getConfig: () => ServiceConfig;
  releaseIssueClaim: (issueId: string) => void;
  suppressIssueDispatch?: (issue: Issue) => void;
  resolveModelSelection: (identifier: string) => ModelSelection;
  notify: (event: NotificationEvent) => void;
  queueRetry: (
    issue: Issue,
    attempt: number,
    delayMs: number,
    error: string | null,
    metadata?: { threadId?: string | null },
  ) => void;
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
  notify: (event: NotificationEvent) => void;
  pushEvent: (event: RuntimeEventRecord) => void;
  queueRetry: (
    issue: Issue,
    attempt: number,
    delayMs: number,
    error: string | null,
    metadata?: { threadId?: string | null },
  ) => void;
  clearRetryEntry: (issueId: string) => void;
  launchWorker: (
    issue: Issue,
    attempt: number | null,
    options?: { claimHeld?: boolean; previousThreadId?: string | null },
  ) => Promise<void>;
  canDispatchIssue: (issue: Issue) => boolean;
  hasAvailableStateSlot: (
    issue: Issue,
    pendingStateCounts?: Map<string, number>,
    runningStateCounts?: Map<string, number>,
  ) => boolean;
  revalidateAndLaunchRetry: (issueId: string, attempt: number) => Promise<void>;
  handleRetryLaunchFailure: (issue: Issue, attempt: number, error: unknown) => Promise<void>;
  getQueuedViews: () => RuntimeIssueView[];
  setQueuedViews: (views: RuntimeIssueView[]) => void;
  suppressIssueDispatch?: (issue: Issue) => void;
  applyUsageEvent: (entry: RunningEntry, usage: TokenUsageSnapshot, usageMode: "absolute_total" | "delta") => void;
  setRateLimits: (rateLimits: unknown) => void;
  getStallEvents: () => StallEvent[];
  detectAndKillStalled: () => number;
  eventBus?: TypedEventBus<SymphonyEventMap>;
}
