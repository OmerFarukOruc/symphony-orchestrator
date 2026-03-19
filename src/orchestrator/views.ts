import type { Issue, RuntimeIssueView, TokenUsageSnapshot } from "../core/types.js";

export function nowIso(): string {
  return new Date().toISOString();
}

export function isHardFailure(errorCode: string | null): boolean {
  return ["startup_failed", "turn_input_required", "inactive", "terminal", "shutdown", "cancelled"].includes(
    errorCode ?? "",
  );
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
