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
  url?: string | null;
  description?: string | null;
  branchName?: string | null;
  createdAt?: string | null;
}

export interface WorkflowColumn {
  key: string;
  label: string;
  kind: "backlog" | "todo" | "active" | "gate" | "terminal" | "other";
  terminal: boolean;
  count: number;
  issues: RuntimeIssueView[];
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
  rate_limits: Record<string, unknown> | null;
  recent_events: RecentEvent[];
  stall_events?: unknown[];
  system_health?: {
    status: "healthy" | "degraded" | "critical";
    checked_at: string;
    running_count: number;
    message: string;
  };
}

function buildIssueView(overrides?: Partial<RuntimeIssueView>): RuntimeIssueView {
  return {
    issueId: "issue-001",
    identifier: "SYM-42",
    title: "Fix authentication bug",
    state: "In Progress",
    workspaceKey: "ws-001",
    workspacePath: "/tmp/workspace/sym-42",
    message: null,
    status: "running",
    updatedAt: "2026-01-15T12:00:00.000Z",
    attempt: 1,
    error: null,
    priority: 2,
    labels: ["bug", "auth"],
    startedAt: "2026-01-15T11:00:00.000Z",
    lastEventAt: "2026-01-15T12:00:00.000Z",
    tokenUsage: { inputTokens: 5000, outputTokens: 3000, totalTokens: 8000 },
    model: "o3-mini",
    reasoningEffort: "medium",
    modelSource: "config",
    configuredModel: "o3-mini",
    configuredReasoningEffort: "medium",
    configuredModelSource: "config",
    modelChangePending: false,
    url: "https://linear.app/team/SYM-42",
    description: "Users cannot log in after password reset",
    branchName: "sym-42-fix-auth",
    createdAt: "2026-01-15T10:00:00.000Z",
    ...overrides,
  };
}

export function buildRuntimeSnapshot(overrides?: Partial<RuntimeSnapshot>): RuntimeSnapshot {
  const runningIssue = buildIssueView();
  const queuedIssue = buildIssueView({
    issueId: "issue-002",
    identifier: "SYM-43",
    title: "Add rate limiting",
    state: "Todo",
    status: "queued",
    startedAt: null,
    attempt: null,
    tokenUsage: null,
    labels: ["feature"],
  });
  const completedIssue = buildIssueView({
    issueId: "issue-003",
    identifier: "SYM-41",
    title: "Update README docs",
    state: "Done",
    status: "completed",
    labels: ["docs"],
  });

  return {
    generated_at: "2026-01-15T12:00:00.000Z",
    counts: { running: 1, retrying: 0 },
    queued: [queuedIssue],
    running: [runningIssue],
    retrying: [],
    completed: [completedIssue],
    workflow_columns: [
      { key: "backlog", label: "Backlog", kind: "backlog", terminal: false, count: 0, issues: [] },
      { key: "todo", label: "Todo", kind: "todo", terminal: false, count: 1, issues: [queuedIssue] },
      {
        key: "in_progress",
        label: "In Progress",
        kind: "active",
        terminal: false,
        count: 1,
        issues: [runningIssue],
      },
      { key: "done", label: "Done", kind: "terminal", terminal: true, count: 1, issues: [completedIssue] },
    ],
    codex_totals: {
      input_tokens: 15_000,
      output_tokens: 8_000,
      total_tokens: 23_000,
      seconds_running: 3600,
    },
    rate_limits: null,
    recent_events: [
      {
        at: "2026-01-15T12:00:00.000Z",
        issue_id: "issue-001",
        issue_identifier: "SYM-42",
        session_id: "sess-001",
        event: "agent_started",
        message: "Agent started working on SYM-42",
        content: null,
      },
      {
        at: "2026-01-15T11:55:00.000Z",
        issue_id: "issue-003",
        issue_identifier: "SYM-41",
        session_id: "sess-003",
        event: "agent_completed",
        message: "Agent completed SYM-41",
        content: null,
      },
    ],
    system_health: {
      status: "healthy",
      checked_at: "2026-01-15T12:00:00.000Z",
      running_count: 1,
      message: "All systems operational",
    },
    ...overrides,
  };
}

export { buildIssueView };
