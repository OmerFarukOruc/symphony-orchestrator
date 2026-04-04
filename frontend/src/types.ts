export interface RuntimeSnapshot {
  generated_at: string;
  counts: { running: number; retrying: number };
  queued: RuntimeIssueView[];
  running: RuntimeIssueView[];
  retrying: RuntimeIssueView[];
  completed: RuntimeIssueView[];
  workflow_columns: WorkflowColumn[];
  codex_totals: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    seconds_running: number;
    cost_usd: number | null;
  };
  rate_limits: RateLimits | null;
  recent_events: RecentEvent[];
  stall_events?: StallEventView[];
  system_health?: SystemHealth;
  webhook_health?: WebhookHealth;
}

export interface WorkflowColumn {
  key: string;
  label: string;
  kind: "backlog" | "todo" | "active" | "gate" | "terminal" | "other";
  terminal: boolean;
  count: number;
  issues: RuntimeIssueView[];
}

export interface RuntimeIssueView {
  issueId: string;
  identifier: string;
  title: string;
  state: string;
  workspaceKey: string | null;
  workspacePath: string | null;
  message: string | null;
  status: string;
  updatedAt: string;
  attempt: number | null;
  error: string | null;
  priority: string | number | null;
  labels: string[];
  startedAt: string | null;
  lastEventAt: string | null;
  nextRetryDueAt?: string | null;
  tokenUsage: { inputTokens: number; outputTokens: number; totalTokens: number } | null;
  model: string | null;
  reasoningEffort: string | null;
  modelSource: string | null;
  configuredModel: string | null;
  configuredReasoningEffort: string | null;
  configuredModelSource: string | null;
  modelChangePending: boolean;
  configuredTemplateId?: string | null;
  configuredTemplateName?: string | null;
  url?: string | null;
  description?: string | null;
  blockedBy?: { id: string | null; identifier: string | null; state: string | null }[];
  branchName?: string | null;
  pullRequestUrl?: string | null;
  createdAt?: string | null;
}

export const REASONING_EFFORT_OPTIONS = ["none", "minimal", "low", "medium", "high", "xhigh"] as const;

export interface IssueDetail extends RuntimeIssueView {
  recentEvents: RecentEvent[];
  attempts: AttemptSummary[];
  currentAttemptId: string | null;
}

export interface AbortIssueResponse {
  ok: true;
  status: "stopping";
  already_stopping: boolean;
  requested_at: string;
}

export interface SteerIssueResponse {
  ok: boolean;
  message: string;
}

export interface AttemptSummary {
  attemptId: string;
  attemptNumber: number | null;
  startedAt: string | null;
  endedAt: string | null;
  status: string;
  model: string | null;
  reasoningEffort: string | null;
  tokenUsage: { inputTokens: number; outputTokens: number; totalTokens: number } | null;
  costUsd: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  appServerBadge?: AttemptAppServerBadge;
}

export interface AttemptRecord extends AttemptSummary {
  issueIdentifier?: string;
  title?: string;
  workspacePath?: string | null;
  workspaceKey?: string | null;
  modelSource?: string;
  turnCount?: number;
  threadId?: string | null;
  turnId?: string | null;
  summary?: string | null;
  events?: RecentEvent[];
  appServer?: AttemptAppServer;
}

export interface AttemptAppServerBadge {
  effectiveProvider: string | null;
  threadStatus: string | null;
}

export interface AttemptAppServer extends AttemptAppServerBadge {
  effectiveModel: string | null;
  reasoningEffort: string | null;
  approvalPolicy: string | null;
  threadName: string | null;
  threadStatusPayload: Record<string, unknown> | null;
  allowedApprovalPolicies: string[] | null;
  allowedSandboxModes: string[] | null;
  networkRequirements: Record<string, unknown> | null;
}

export interface AttemptCheckpointRecord {
  checkpointId: number;
  attemptId: string;
  ordinal: number;
  trigger: string;
  eventCursor: number | null;
  status: string;
  threadId: string | null;
  turnId: string | null;
  turnCount: number;
  tokenUsage: { inputTokens: number; outputTokens: number; totalTokens: number } | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface TrackedPrRecord {
  issueId: string;
  url: string;
  number: number;
  repo: string;
  branchName: string;
  status: "open" | "merged" | "closed";
  mergedAt: string | null;
  mergeCommitSha: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RecentEvent {
  at: string;
  issue_id: string;
  issue_identifier: string;
  session_id: string | null;
  event: string;
  message: string;
  content: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface StallEventView {
  at: string;
  issue_id: string;
  issue_identifier: string;
  silent_ms: number;
  timeout_ms: number;
}

export interface SystemHealth {
  status: "healthy" | "degraded" | "critical";
  checked_at: string;
  running_count: number;
  message: string;
}

export interface WebhookHealth {
  status: "connected" | "degraded" | "disconnected";
  effective_interval_ms: number;
  stats: {
    deliveries_received: number;
    last_delivery_at: string | null;
    last_event_type: string | null;
  };
  last_delivery_at: string | null;
  last_event_type: string | null;
}

export interface RateLimits {
  [key: string]: unknown;
}

export interface RuntimeInfo {
  version: string;
  data_dir: string;
  feature_flags: Record<string, boolean>;
  provider_summary: string;
}

export interface NotificationDeliveryFailure {
  channel: string;
  error: string;
}

export interface NotificationDeliverySummary {
  deliveredChannels: string[];
  failedChannels: NotificationDeliveryFailure[];
  skippedDuplicate: boolean;
}

export interface NotificationRecord {
  id: string;
  type: string;
  severity: "info" | "warning" | "critical";
  title: string;
  message: string;
  source: string | null;
  href: string | null;
  read: boolean;
  dedupeKey: string | null;
  metadata: Record<string, unknown> | null;
  deliverySummary: NotificationDeliverySummary | null;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationsListResponse {
  notifications: NotificationRecord[];
  unreadCount: number;
  totalCount: number;
}

export interface NotificationReadResponse {
  ok: true;
  notification: NotificationRecord;
  unreadCount: number;
}

export interface NotificationsReadAllResponse {
  ok: true;
  updatedCount: number;
  unreadCount: number;
}

export interface SetupStatus {
  configured: boolean;
  steps: {
    masterKey: { done: boolean };
    linearProject: { done: boolean };
    repoRoute: { done: boolean };
    openaiKey: { done: boolean };
    githubToken: { done: boolean };
  };
}

export interface LinearProject {
  id: string;
  name: string;
  slugId: string;
  teamKey: string | null;
}

/* ---- Git Context ---- */

export interface GitPullView {
  number: number;
  title: string;
  author: string;
  state: string;
  updatedAt: string;
  url: string;
  headBranch: string;
  checksStatus: string | null;
}

export interface GitCommitView {
  sha: string;
  message: string;
  author: string;
  date: string;
}

export interface GitRepoView {
  repoUrl: string;
  defaultBranch: string;
  identifierPrefix: string | null;
  label: string | null;
  githubOwner: string | null;
  githubRepo: string | null;
  configured: boolean;
  github?: {
    description: string | null;
    visibility: string;
    openPrCount: number;
    pulls: GitPullView[];
    recentCommits: GitCommitView[];
  };
}

export interface ActiveBranchView {
  identifier: string;
  branchName: string;
  status: string;
  workspacePath: string | null;
  issueTitle: string;
  pullRequestUrl: string | null;
}

export interface GitContextResponse {
  repos: GitRepoView[];
  activeBranches: ActiveBranchView[];
  githubAvailable: boolean;
}

/* ---- Workspace Inventory ---- */

export interface WorkspaceInventoryEntry {
  workspace_key: string;
  path: string;
  status: "running" | "retrying" | "completed" | "orphaned";
  strategy: string;
  issue: {
    identifier: string;
    title: string;
    state: string;
  } | null;
  disk_bytes: number | null;
  last_modified_at: string | null;
}

export interface WorkspaceInventoryResponse {
  workspaces: WorkspaceInventoryEntry[];
  generated_at: string;
  total: number;
  active: number;
  orphaned: number;
}

export interface PromptTemplate {
  id: string;
  name: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditRecord {
  id: number;
  tableName: string;
  key: string;
  path: string | null;
  operation: string;
  previousValue: string | null;
  newValue: string | null;
  actor: string;
  requestId: string | null;
  timestamp: string;
}

/** Lightweight payload from SSE audit.mutation events (no old/new values). */
export interface AuditMutationEvent {
  tableName: string;
  key: string;
  path: string | null;
  operation: string;
  actor: string;
  timestamp: string;
}
