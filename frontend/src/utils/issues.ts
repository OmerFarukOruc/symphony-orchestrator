import type { RuntimeIssueView, WorkflowColumn } from "../types/runtime.js";

const PRIORITY_ORDER: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
  none: 4,
};

/** Statuses that represent a terminal outcome — no longer need operator attention. */
const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled", "timed_out", "stalled"]);

function isTerminalStatus(status: string): boolean {
  return TERMINAL_STATUSES.has(status);
}

/** Linear numeric priority mapping: 0=none, 1=urgent, 2=high, 3=medium, 4=low */
const LINEAR_PRIORITY_MAP: Record<number, string> = {
  0: "none",
  1: "urgent",
  2: "high",
  3: "medium",
  4: "low",
};

function isLinearNumericPriority(value: number): boolean {
  return value >= 0 && value <= 4;
}

export function normalizePriority(priority: string | number | null | undefined): string {
  if (priority === null || priority === undefined) return "low";

  if (typeof priority === "number" && isLinearNumericPriority(priority)) {
    return LINEAR_PRIORITY_MAP[priority] ?? "low";
  }

  const value = String(priority).trim().toLowerCase();

  if (PRIORITY_ORDER[value] !== undefined) {
    return value;
  }

  const numericValue = Number.parseInt(value, 10);
  if (!Number.isNaN(numericValue) && isLinearNumericPriority(numericValue)) {
    return LINEAR_PRIORITY_MAP[numericValue] ?? "low";
  }

  return "low";
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
  const issues = columns.flatMap((column) => column.issues ?? []);
  return [...issues]
    .filter((issue) => !isTerminalStatus(issue.status))
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

export function latestTerminalIssues(completed: RuntimeIssueView[]): RuntimeIssueView[] {
  return [...completed].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)).slice(0, 8);
}
