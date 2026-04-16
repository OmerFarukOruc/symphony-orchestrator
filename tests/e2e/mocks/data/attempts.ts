import type { RecentEvent } from "../../../../src/core/types.js";

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
  appServer?: {
    effectiveProvider: string | null;
    effectiveModel: string | null;
    reasoningEffort: string | null;
    approvalPolicy: string | null;
    threadName: string | null;
    threadStatus: string | null;
    threadStatusPayload: Record<string, unknown> | null;
    allowedApprovalPolicies: string[] | null;
    allowedSandboxModes: string[] | null;
    networkRequirements: Record<string, unknown> | null;
  };
}

export function buildAttemptSummary(overrides?: Partial<AttemptSummary>): AttemptSummary {
  return {
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
    ...overrides,
  };
}

export function buildAttemptRecord(overrides?: Partial<AttemptRecord>): AttemptRecord {
  return {
    ...buildAttemptSummary(),
    issueIdentifier: "SYM-42",
    title: "Fix authentication bug",
    workspacePath: "/tmp/workspace/sym-42",
    workspaceKey: "ws-001",
    modelSource: "default",
    turnCount: 5,
    threadId: "thread-001",
    turnId: "turn-005",
    appServer: {
      effectiveProvider: "openai",
      effectiveModel: "o3-mini",
      reasoningEffort: "medium",
      approvalPolicy: "never",
      threadName: "Issue thread",
      threadStatus: "completed",
      threadStatusPayload: { type: "completed" },
      allowedApprovalPolicies: ["never"],
      allowedSandboxModes: ["workspaceWrite"],
      networkRequirements: { enabled: true, allowedDomains: ["api.openai.com"] },
    },
    summary: null,
    events: [
      {
        at: "2026-01-15T11:30:00.000Z",
        issueId: "issue-001",
        issueIdentifier: "SYM-42",
        sessionId: "sess-001",
        event: "tool_call",
        message: "Called write_file",
        content: null,
      },
    ],
    ...overrides,
  };
}
