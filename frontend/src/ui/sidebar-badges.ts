import type { RuntimeIssueView, RuntimeSnapshot } from "../types";

export interface SidebarBadgeCounts {
  "/queue"?: number;
  "/notifications"?: number;
  "/git"?: number;
}

export function collectUniqueIssues(snapshot: RuntimeSnapshot): RuntimeIssueView[] {
  const issues = new Map<string, RuntimeIssueView>();
  const groups = [
    snapshot.queued,
    snapshot.running,
    snapshot.retrying,
    snapshot.completed,
    ...snapshot.workflow_columns.map((column) => column.issues),
  ];

  for (const group of groups) {
    for (const issue of group) {
      const existing = issues.get(issue.issueId);
      const existingUpdatedAt = existing?.updatedAt ?? existing?.createdAt ?? "";
      const nextUpdatedAt = issue.updatedAt ?? issue.createdAt ?? "";
      if (!existing || nextUpdatedAt > existingUpdatedAt) {
        issues.set(issue.issueId, issue);
      }
    }
  }

  return [...issues.values()];
}

function getPendingCount(snapshot: RuntimeSnapshot): number {
  const workflowCount = snapshot.workflow_columns.reduce((total, column) => {
    return column.terminal ? total : total + column.count;
  }, 0);

  if (workflowCount > 0) {
    return workflowCount;
  }

  return snapshot.queued.length + snapshot.running.length + snapshot.retrying.length;
}

export function buildSidebarBadgeCounts(snapshot: RuntimeSnapshot): SidebarBadgeCounts {
  const issues = collectUniqueIssues(snapshot);
  return {
    "/queue": getPendingCount(snapshot),
    "/notifications": snapshot.recent_events.length,
    "/git": issues.filter((issue) => Boolean(issue.branchName)).length,
  };
}
