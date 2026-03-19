import type {
  Issue,
  ModelSelection,
  RecentEvent,
  RuntimeIssueView,
  ServiceConfig,
  TokenUsageSnapshot,
} from "../core/types.js";
import type { OrchestratorDeps, RetryRuntimeEntry, RunningEntry } from "./runtime-types.js";

import type { NotificationEvent } from "../notification/channel.js";

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
  pushEvent: (event: RecentEvent & { usage?: unknown; rateLimits?: unknown }) => void;
  queueRetry: (issue: Issue, attempt: number, delayMs: number, error: string | null) => void;
  clearRetryEntry: (issueId: string) => void;
  launchWorker: (issue: Issue, attempt: number | null, options?: { claimHeld?: boolean }) => Promise<void>;
  canDispatchIssue: (issue: Issue) => boolean;
  hasAvailableStateSlot: (issue: Issue, pendingStateCounts?: Map<string, number>) => boolean;
  revalidateAndLaunchRetry: (issueId: string, attempt: number) => Promise<void>;
  handleRetryLaunchFailure: (issue: Issue, attempt: number, error: unknown) => Promise<void>;
  getQueuedViews: () => RuntimeIssueView[];
  setQueuedViews: (views: RuntimeIssueView[]) => void;
  applyUsageEvent: (entry: RunningEntry, usage: TokenUsageSnapshot, usageMode: "absolute_total" | "delta") => void;
  setRateLimits: (rateLimits: unknown) => void;
}
