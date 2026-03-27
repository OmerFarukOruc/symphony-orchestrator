import type { RunAttemptDispatcher } from "../dispatch/types.js";
import type { AttemptStorePort } from "../core/attempt-store-port.js";
import { ConfigStore } from "../config/store.js";
import type { TypedEventBus } from "../core/event-bus.js";
import type { SymphonyEventMap } from "../core/symphony-events.js";
import type { GitIntegrationPort } from "../git/port.js";
import type { TrackerPort } from "../tracker/port.js";
import type { NotificationManager } from "../notification/manager.js";
import type { RepoMatch, RepoRouter } from "../git/repo-router.js";
import type {
  Issue,
  ModelSelection,
  RetryEntry,
  SymphonyLogger,
  TokenUsageSnapshot,
  Workspace,
} from "../core/types.js";
import { WorkspaceManager } from "../workspace/manager.js";

export interface RunningEntry {
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
  lastAgentMessageContent: string | null;
  repoMatch: RepoMatch | null;
  queuePersistence: (task: () => Promise<void>) => void;
  flushPersistence: () => Promise<void>;
  steerTurn?: (message: string) => Promise<boolean>;
}

export type RetryRuntimeEntry = RetryEntry & { issue: Issue; workspaceKey: string | null };

export interface OrchestratorDeps {
  attemptStore: AttemptStorePort;
  configStore: ConfigStore;
  tracker: TrackerPort;
  workspaceManager: WorkspaceManager;
  agentRunner: RunAttemptDispatcher;
  eventBus?: TypedEventBus<SymphonyEventMap>;
  notificationManager?: NotificationManager;
  repoRouter?: Pick<RepoRouter, "matchIssue">;
  gitManager?: GitIntegrationPort;
  logger: SymphonyLogger;
}
