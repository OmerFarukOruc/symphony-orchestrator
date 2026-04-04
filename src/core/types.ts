// Exempt: shared domain and runtime type definitions kept together for discoverability.
import type { AgentConfig } from "../config/schemas/agent.js";
import type { AlertConfig, AutomationConfig, NotificationConfig, TriggerConfig } from "./notification-types.js";

export type {
  AlertConfig,
  AlertRuleConfig,
  AutomationConfig,
  AutomationMode,
  NotificationConfig,
  NotificationChannelConfig,
  NotificationDeliveryFailure,
  NotificationDeliverySummary,
  NotificationDesktopChannelConfig,
  NotificationRecord,
  NotificationSeverity,
  NotificationSlackChannelConfig,
  NotificationSlackConfig,
  NotificationVerbosity,
  NotificationWebhookChannelConfig,
  TriggerAction,
  TriggerConfig,
} from "./notification-types.js";

export interface WorkflowDefinition {
  config: Record<string, unknown>;
  promptTemplate: string;
}

export interface IssueBlockerRef {
  id: string | null;
  identifier: string | null;
  state: string | null;
}

export interface Issue {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  priority: number | null;
  state: string;
  branchName: string | null;
  url: string | null;
  labels: string[];
  blockedBy: IssueBlockerRef[];
  createdAt: string | null;
  updatedAt: string | null;
}

export interface Workspace {
  path: string;
  workspaceKey: string;
  createdNow: boolean;
  /** Bare-clone directory for worktree-strategy workspaces; mounted into Docker alongside the workspace. */
  gitBaseDir?: string;
}

export interface RunOutcome {
  kind: "normal" | "failed" | "timed_out" | "stalled" | "cancelled";
  errorCode: string | null;
  errorMessage: string | null;
  codexErrorInfo?: { type: string; message: string; retryAfterMs?: number } | null;
  threadId: string | null;
  turnId: string | null;
  turnCount: number;
}

export interface RetryEntry {
  issueId: string;
  identifier: string;
  attempt: number;
  dueAtMs: number;
  error: string | null;
  timer: NodeJS.Timeout | null;
  /** Thread ID from the previous attempt — enables thread/resume on retry. */
  threadId?: string | null;
  /** Aggregated review feedback from the previous PR — injected into the agent prompt on retry. */
  previousPrFeedback?: string | null;
}

export interface RecentEvent {
  at: string;
  issueId: string | null;
  issueIdentifier: string | null;
  sessionId: string | null;
  event: string;
  message: string;
  content?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface TokenUsageSnapshot {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export type ReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh";

export interface ModelSelection {
  model: string;
  reasoningEffort: ReasoningEffort | null;
  source: "default" | "override";
}

export interface AttemptRecord {
  attemptId: string;
  issueId: string;
  issueIdentifier: string;
  title: string;
  workspaceKey: string | null;
  workspacePath: string | null;
  status: "running" | "completed" | "failed" | "timed_out" | "stalled" | "cancelled" | "paused";
  attemptNumber: number | null;
  startedAt: string;
  endedAt: string | null;
  model: string;
  reasoningEffort: ReasoningEffort | null;
  modelSource: "default" | "override";
  threadId: string | null;
  turnId: string | null;
  turnCount: number;
  errorCode: string | null;
  errorMessage: string | null;
  tokenUsage: TokenUsageSnapshot | null;
  pullRequestUrl?: string | null;
  stopSignal?: "done" | "blocked" | null;
  /** Agent-authored markdown summary of PR changes (3–8 bullets). Null when generation failed or skipped. */
  summary?: string | null;
}

export interface AttemptEvent extends RecentEvent {
  attemptId: string;
  usage?: TokenUsageSnapshot | null;
  rateLimits?: unknown;
  content?: string | null;
}

export interface RuntimeIssueView {
  issueId: string;
  identifier: string;
  title: string;
  state: string;
  workspaceKey: string | null;
  workspacePath?: string | null;
  message: string | null;
  status: string;
  updatedAt: string;
  attempt: number | null;
  error: string | null;
  priority?: number | null;
  labels?: string[];
  startedAt?: string | null;
  lastEventAt?: string | null;
  tokenUsage?: TokenUsageSnapshot | null;
  model?: string | null;
  reasoningEffort?: ReasoningEffort | null;
  modelSource?: "default" | "override" | null;
  configuredModel?: string | null;
  configuredReasoningEffort?: ReasoningEffort | null;
  configuredModelSource?: "default" | "override" | null;
  modelChangePending?: boolean;
  configuredTemplateId?: string | null;
  configuredTemplateName?: string | null;
  url?: string | null;
  description?: string | null;
  blockedBy?: IssueBlockerRef[];
  branchName?: string | null;
  pullRequestUrl?: string | null;
  nextRetryDueAt?: string | null;
  createdAt?: string | null;
}

export interface WorkflowColumnView {
  key: string;
  label: string;
  kind: "backlog" | "todo" | "active" | "gate" | "terminal" | "other";
  terminal: boolean;
  count: number;
  issues: RuntimeIssueView[];
}

export interface StallEventView {
  at: string;
  issueId: string;
  issueIdentifier: string;
  silentMs: number;
  timeoutMs: number;
}

export type HealthStatus = "healthy" | "degraded" | "critical";

export interface SystemHealth {
  status: HealthStatus;
  checkedAt: string;
  runningCount: number;
  message: string;
}

export interface RuntimeSnapshot {
  generatedAt: string;
  counts: { running: number; retrying: number };
  running: RuntimeIssueView[];
  retrying: RuntimeIssueView[];
  queued?: RuntimeIssueView[];
  completed?: RuntimeIssueView[];
  workflowColumns: WorkflowColumnView[];
  codexTotals: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    secondsRunning: number;
    costUsd: number;
  };
  rateLimits: unknown;
  recentEvents: RecentEvent[];
  stallEvents?: StallEventView[];
  systemHealth?: SystemHealth;
  webhookHealth?: {
    status: string;
    effectiveIntervalMs: number;
    stats: { deliveriesReceived: number; lastDeliveryAt: string | null; lastEventType: string | null };
    lastDeliveryAt: string | null;
    lastEventType: string | null;
  };
  availableModels?: string[] | null;
}

export interface ValidationError {
  code: string;
  message: string;
}

export interface TrackerConfig {
  kind: string;
  apiKey: string;
  endpoint: string;
  projectSlug: string | null;
  owner?: string;
  repo?: string;
  activeStates: string[];
  terminalStates: string[];
}

export interface GitHubConfig {
  token: string;
  apiBaseUrl: string;
}

export interface RepoConfig {
  repoUrl: string;
  defaultBranch: string;
  identifierPrefix: string | null;
  label: string | null;
  githubOwner?: string | null;
  githubRepo?: string | null;
  githubTokenEnv?: string | null;
}

export interface PollingConfig {
  intervalMs: number;
}

export interface WebhookConfig {
  webhookUrl: string;
  webhookSecret: string;
  /** Previous secret during rotation window (optional, for dual-secret validation). */
  previousWebhookSecret?: string | null;
  pollingStretchMs: number;
  pollingBaseMs: number;
  healthCheckIntervalMs: number;
}

interface WorkspaceHooks {
  afterCreate: string | null;
  beforeRun: string | null;
  afterRun: string | null;
  beforeRemove: string | null;
  timeoutMs: number;
}

export type WorkspaceStrategy = "directory" | "worktree";

export interface WorkspaceConfig {
  root: string;
  hooks: WorkspaceHooks;
  strategy: WorkspaceStrategy;
  branchPrefix: string;
}

// AgentConfig is defined co-located with its Zod schema; re-exported here for consumers.
export type { AgentConfig };

// ---------------------------------------------------------------------------
// PR lifecycle and checkpoint types (PR/CI Automation Pipeline Bundle)
// ---------------------------------------------------------------------------

/**
 * The event that triggered a checkpoint write.
 * - `attempt_created` — first checkpoint: written when the attempt row is persisted.
 * - `cursor_advanced` — thread or turn cursor advanced (new `attempt_events` rows).
 * - `status_transition` — attempt status changed (e.g. running → completed).
 * - `terminal_completion` — attempt reached a terminal state (completed/failed/cancelled).
 * - `pr_merged` — PR was merged; archive-on-merge triggered.
 */
export type CheckpointTrigger =
  | "attempt_created"
  | "cursor_advanced"
  | "status_transition"
  | "terminal_completion"
  | "pr_merged";

/**
 * A durable record of a GitHub pull request associated with an attempt.
 * The `(owner, repo, pullNumber)` triple is the stable external key.
 * `attemptId` is a loose reference — no FK constraint — because the
 * attempt may be archived before the PR is closed.
 */
export interface PrRecord {
  prId: string;
  attemptId: string;
  issueId: string;
  owner: string;
  repo: string;
  pullNumber: number;
  url: string;
  status: "open" | "merged" | "closed";
  mergedAt: string | null;
  mergeCommitSha: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * A single entry in the per-attempt checkpoint history.
 * Checkpoints are append-only and ordered by `ordinal` (ascending).
 * `eventCursor` is a loose integer high-water mark referencing
 * the highest `attempt_events.id` value at the time of the write.
 */
export interface AttemptCheckpointRecord {
  checkpointId: number;
  attemptId: string;
  ordinal: number;
  trigger: CheckpointTrigger;
  eventCursor: number | null;
  status: AttemptRecord["status"];
  threadId: string | null;
  turnId: string | null;
  turnCount: number;
  tokenUsage: TokenUsageSnapshot | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

/**
 * Merge policy rules evaluated by `evaluateMergePolicy()` before
 * requesting auto-merge via the GitHub API.
 *
 * This interface mirrors the shape of `mergePolicyConfigSchema` in
 * `src/config/schemas/pr-policy.ts` and is kept here as the canonical
 * domain type consumed by the policy engine (U5).
 */
export interface MergePolicy {
  enabled: boolean;
  allowedPaths: string[];
  maxChangedFiles?: number | null;
  maxDiffLines?: number | null;
  requireLabels: string[];
  excludeLabels: string[];
}

export interface SandboxSecurityConfig {
  noNewPrivileges: boolean;
  dropCapabilities: boolean;
  gvisor: boolean;
  seccompProfile: string;
}

export interface SandboxResourceConfig {
  memory: string;
  memoryReservation: string;
  memorySwap: string;
  cpus: string;
  tmpfsSize: string;
}

export interface SandboxLogConfig {
  driver: string;
  maxSize: string;
  maxFile: number;
}

export interface SandboxConfig {
  image: string;
  network: string;
  security: SandboxSecurityConfig;
  resources: SandboxResourceConfig;
  extraMounts: string[];
  envPassthrough: string[];
  logs: SandboxLogConfig;
  egressAllowlist: string[];
}

export type CodexAuthMode = "api_key" | "openai_login";

export interface CodexAuthConfig {
  mode: CodexAuthMode;
  sourceHome: string;
}

export interface CodexProviderConfig {
  id: string | null;
  name: string | null;
  baseUrl: string | null;
  envKey: string | null;
  envKeyInstructions: string | null;
  wireApi: string | null;
  requiresOpenaiAuth: boolean;
  httpHeaders: Record<string, string>;
  envHttpHeaders: Record<string, string>;
  queryParams: Record<string, string>;
}

export interface CodexConfig {
  command: string;
  model: string;
  reasoningEffort: ReasoningEffort | null;
  approvalPolicy: string | Record<string, unknown>;
  threadSandbox: string;
  personality: string;
  turnSandboxPolicy: { type: string; [key: string]: unknown };
  selfReview: boolean;
  readTimeoutMs: number;
  turnTimeoutMs: number;
  drainTimeoutMs: number;
  startupTimeoutMs: number;
  stallTimeoutMs: number;
  structuredOutput: boolean;
  auth: CodexAuthConfig;
  provider: CodexProviderConfig | null;
  sandbox: SandboxConfig;
}

export interface ServerConfig {
  port: number;
}

export type StateStageKind = "backlog" | "todo" | "active" | "gate" | "terminal";

export interface StateStageConfig {
  name: string;
  kind: StateStageKind;
}

export interface StateMachineConfig {
  stages: StateStageConfig[];
  transitions: Record<string, string[]>;
}

export interface ServiceConfig {
  tracker: TrackerConfig;
  notifications?: NotificationConfig;
  triggers?: TriggerConfig | null;
  automations?: AutomationConfig[];
  alerts?: AlertConfig | null;
  github?: GitHubConfig | null;
  repos?: RepoConfig[];
  polling: PollingConfig;
  workspace: WorkspaceConfig;
  agent: AgentConfig;
  codex: CodexConfig;
  stateMachine?: StateMachineConfig | null;
  server: ServerConfig;
  webhook?: WebhookConfig | null;
}

export interface RisolutoLogger {
  debug(meta: unknown, message?: string): void;
  info(meta: unknown, message?: string): void;
  warn(meta: unknown, message?: string): void;
  error(meta: unknown, message?: string): void;
  child(meta: Record<string, unknown>): RisolutoLogger;
}
