import { AgentRunner } from "../agent-runner/index.js";
import { AttemptStore } from "../core/attempt-store.js";
import { ConfigStore } from "../config/store.js";
import type { GitManager } from "../git/manager.js";
import { LinearClient } from "../linear/client.js";
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
}

export type RetryRuntimeEntry = RetryEntry & { issue: Issue; workspaceKey: string | null };

export interface OrchestratorDeps {
  attemptStore: AttemptStore;
  configStore: ConfigStore;
  linearClient: LinearClient;
  workspaceManager: WorkspaceManager;
  agentRunner: AgentRunner;
  notificationManager?: NotificationManager;
  repoRouter?: Pick<RepoRouter, "matchIssue">;
  gitManager?: Pick<GitManager, "cloneInto" | "commitAndPush" | "createPullRequest">;
  logger: SymphonyLogger;
}
