import type { RecentEvent, RuntimeIssueView } from "./runtime.js";

export const REASONING_EFFORT_OPTIONS = ["none", "minimal", "low", "medium", "high", "xhigh"] as const;

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
