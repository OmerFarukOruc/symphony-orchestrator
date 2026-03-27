import type { Issue, RuntimeIssueView, TokenUsageSnapshot } from "../core/types.js";

export function nowIso(): string {
  return new Date().toISOString();
}

export function isHardFailure(errorCode: string | null): boolean {
  return [
    "startup_failed",
    "inactive",
    "terminal",
    "shutdown",
    "cancelled",
    "auth_token_expired",
    "unauthorized",
  ].includes(errorCode ?? "");
}

export function issueView(issue: Issue, extra?: Partial<RuntimeIssueView>): RuntimeIssueView {
  return {
    issueId: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    state: issue.state,
    workspaceKey: null,
    message: null,
    status: issue.state,
    updatedAt: issue.updatedAt ?? nowIso(),
    attempt: null,
    error: null,
    priority: issue.priority,
    labels: issue.labels,
    url: issue.url,
    description: issue.description,
    blockedBy: issue.blockedBy,
    branchName: issue.branchName,
    createdAt: issue.createdAt,
    ...extra,
  };
}

export function usageDelta(previous: TokenUsageSnapshot | null, next: TokenUsageSnapshot): TokenUsageSnapshot {
  return {
    inputTokens: Math.max(0, next.inputTokens - (previous?.inputTokens ?? 0)),
    outputTokens: Math.max(0, next.outputTokens - (previous?.outputTokens ?? 0)),
    totalTokens: Math.max(0, next.totalTokens - (previous?.totalTokens ?? 0)),
  };
}
