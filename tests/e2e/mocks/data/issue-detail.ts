import type { RecentEvent } from "./runtime-snapshot";

export interface IssueDetail {
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
  branchName?: string | null;
  pullRequestUrl?: string | null;
  createdAt?: string | null;
  recentEvents: RecentEvent[];
  attempts: AttemptSummary[];
  currentAttemptId: string | null;
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
  costUsd: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  appServerBadge?: {
    effectiveProvider: string | null;
    threadStatus: string | null;
  };
}

export function buildIssueDetail(overrides?: Partial<IssueDetail>): IssueDetail {
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
    pullRequestUrl: "https://github.com/owner/repo/pull/42",
    createdAt: "2026-01-15T10:00:00.000Z",
    recentEvents: [
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
        at: "2026-01-15T12:01:00.000Z",
        issue_id: "issue-001",
        issue_identifier: "SYM-42",
        session_id: "sess-001",
        event: "tool_use",
        message: "Reading file src/auth.ts",
        content: null,
      },
      {
        at: "2026-01-15T12:02:00.000Z",
        issue_id: "issue-001",
        issue_identifier: "SYM-42",
        session_id: "sess-001",
        event: "reasoning",
        message: "Analyzing authentication flow",
        content: null,
      },
    ],
    attempts: [
      {
        attemptId: "att-001",
        attemptNumber: 1,
        startedAt: "2026-01-15T11:00:00.000Z",
        endedAt: null,
        status: "running",
        model: "o3-mini",
        reasoningEffort: "medium",
        tokenUsage: { inputTokens: 5000, outputTokens: 3000, totalTokens: 8000 },
        costUsd: null,
        errorCode: null,
        errorMessage: null,
        appServerBadge: {
          effectiveProvider: "openai",
          threadStatus: "completed",
        },
      },
    ],
    currentAttemptId: "att-001",
    ...overrides,
  };
}
