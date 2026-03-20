import type { RecentEvent, RuntimeIssueView, WorkflowColumn } from "../types";

const PRIORITY_ORDER: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export function normalizePriority(priority: string | number | null | undefined): string {
  if (priority === null || priority === undefined) return "low";
  const value = String(priority).trim().toLowerCase();
  return PRIORITY_ORDER[value] !== undefined ? value : "low";
}

export function formatPriority(priority: string | number | null | undefined): string {
  const value = normalizePriority(priority);
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function priorityRank(priority: string | number | null | undefined): number {
  return PRIORITY_ORDER[normalizePriority(priority)] ?? PRIORITY_ORDER.low;
}

export function matchesIssueSearch(issue: RuntimeIssueView, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return true;
  }
  return `${issue.identifier} ${issue.title}`.toLowerCase().includes(needle);
}

export function getRetryLabel(issue: RuntimeIssueView): string | null {
  if (issue.status !== "retrying" || !issue.message) {
    return null;
  }
  return issue.message;
}

export function sortIssues(issues: RuntimeIssueView[], mode: string): RuntimeIssueView[] {
  const sorted = [...issues];
  sorted.sort((left, right) => {
    if (mode === "priority") {
      return priorityRank(left.priority) - priorityRank(right.priority);
    }
    if (mode === "tokens") {
      return (right.tokenUsage?.totalTokens ?? 0) - (left.tokenUsage?.totalTokens ?? 0);
    }
    return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
  });
  return sorted;
}

export function buildAttentionList(columns: WorkflowColumn[]): RuntimeIssueView[] {
  const issues = columns.flatMap((column) => column.issues);
  return [...issues]
    .filter((issue) => issue.status !== "completed")
    .sort((left, right) => {
      const leftBlocked = left.status === "blocked" ? 0 : 1;
      const rightBlocked = right.status === "blocked" ? 0 : 1;
      if (leftBlocked !== rightBlocked) {
        return leftBlocked - rightBlocked;
      }
      const leftRetry = left.status === "retrying" ? Date.parse(left.updatedAt) : Number.POSITIVE_INFINITY;
      const rightRetry = right.status === "retrying" ? Date.parse(right.updatedAt) : Number.POSITIVE_INFINITY;
      if (leftRetry !== rightRetry) {
        return leftRetry - rightRetry;
      }
      const leftPending = left.modelChangePending ? 0 : 1;
      const rightPending = right.modelChangePending ? 0 : 1;
      if (leftPending !== rightPending) {
        return leftPending - rightPending;
      }
      return priorityRank(left.priority) - priorityRank(right.priority);
    })
    .slice(0, 6);
}

export function latestTerminalIssues(columns: WorkflowColumn[]): RuntimeIssueView[] {
  return columns
    .filter((column) => column.terminal)
    .flatMap((column) => column.issues)
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
    .slice(0, 8);
}

export function recentEventKey(event: RecentEvent): string {
  return `${event.at}:${event.issue_identifier}:${event.event}:${event.message}`;
}
