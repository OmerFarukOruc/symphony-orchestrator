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
  };
  rate_limits: RateLimits | null;
  recent_events: RecentEvent[];
}

export interface WorkflowColumn {
  key: string;
  label: string;
  kind: string;
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
  tokenUsage: { inputTokens: number; outputTokens: number; totalTokens: number } | null;
  model: string | null;
  reasoningEffort: string | null;
  modelSource: string | null;
  configuredModel: string | null;
  configuredReasoningEffort: string | null;
  configuredModelSource: string | null;
  modelChangePending: boolean;
  url?: string | null;
  description?: string | null;
  blockedBy?: { id: string | null; identifier: string | null; state: string | null }[];
  branchName?: string | null;
  createdAt?: string | null;
}

export const REASONING_EFFORT_OPTIONS = ["none", "minimal", "low", "medium", "high", "xhigh"] as const;

export interface IssueDetail extends RuntimeIssueView {
  recentEvents: RecentEvent[];
  attempts: AttemptSummary[];
  currentAttemptId: string | null;
  url?: string;
  description?: string;
  blocked_by?: string[];
  branch_name?: string;
  pull_request_url?: string;
  next_retry_due_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface AttemptSummary {
  attemptId: string;
  attemptNumber: number;
  startedAt: string | null;
  endedAt: string | null;
  status: string;
  model: string | null;
  reasoningEffort: string | null;
  tokenUsage: { inputTokens: number; outputTokens: number; totalTokens: number } | null;
  errorCode: string | null;
  errorMessage: string | null;
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
  events?: RecentEvent[];
}

export interface RecentEvent {
  at: string;
  issue_id: string;
  issue_identifier: string;
  session_id: string | null;
  event: string;
  message: string;
  content: unknown | null;
}

export interface PlannedIssue {
  id: string;
  title: string;
  summary: string;
  acceptanceCriteria: string[];
  dependencies: string[];
  priority: "low" | "medium" | "high";
  labels: string[];
}

export interface RateLimits {
  [key: string]: unknown;
}

export interface RuntimeInfo {
  version: string;
  workflow_path: string;
  data_dir: string;
  feature_flags: Record<string, boolean>;
  provider_summary: string;
}

export interface SetupStatus {
  configured: boolean;
  steps: {
    masterKey: { done: boolean };
    linearProject: { done: boolean };
    githubToken: { done: boolean };
  };
}

export interface LinearProject {
  id: unknown;
  name: unknown;
  slugId: string;
  teamKey: unknown;
}
