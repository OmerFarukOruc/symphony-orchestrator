import type { PlannedIssue } from "../types";

export function parseLabels(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

export function planSummary(plan: PlannedIssue[]): { count: number; deps: number; high: number } {
  return plan.reduce(
    (acc, issue) => {
      acc.count += 1;
      acc.deps += issue.dependencies.length;
      if (issue.priority === "high") {
        acc.high += 1;
      }
      return acc;
    },
    { count: 0, deps: 0, high: 0 },
  );
}

export function moveItem(plan: PlannedIssue[], from: number, to: number): PlannedIssue[] {
  const next = [...plan];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function normalizeDependencies(plan: PlannedIssue[]): PlannedIssue[] {
  const ids = new Set(plan.map((issue) => issue.id));
  return plan.map((issue) => ({
    ...issue,
    dependencies: issue.dependencies.filter((dep) => dep !== issue.id && ids.has(dep)),
  }));
}

export function buildCreatedLinks(externalIds: string[]): { identifier: string; url: string }[] {
  return externalIds.map((identifier) => ({
    identifier,
    url: `https://linear.app/search/results/all/${encodeURIComponent(identifier)}`,
  }));
}
