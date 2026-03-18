import { listWorkflowStages, normalizeStateKey } from "../state/policy.js";
import type { RuntimeIssueView, ServiceConfig, WorkflowColumnView } from "../core/types.js";

function dedupeIssueViews(items: RuntimeIssueView[]): RuntimeIssueView[] {
  const seen = new Set<string>();
  const unique: RuntimeIssueView[] = [];
  for (const item of items) {
    const key = item.identifier || item.issueId;
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(item);
  }
  return unique;
}

export function buildWorkflowColumns(
  config: ServiceConfig,
  groups: {
    running: RuntimeIssueView[];
    retrying: RuntimeIssueView[];
    queued?: RuntimeIssueView[];
    completed?: RuntimeIssueView[];
  },
): WorkflowColumnView[] {
  const stages = listWorkflowStages(config);
  const columns = new Map<string, WorkflowColumnView>();

  for (const stage of stages) {
    columns.set(stage.key, {
      key: stage.key,
      label: stage.label,
      kind: stage.kind,
      terminal: stage.terminal,
      count: 0,
      issues: [],
    });
  }

  const items = dedupeIssueViews([
    ...groups.running,
    ...groups.retrying,
    ...(groups.queued ?? []),
    ...(groups.completed ?? []),
  ]);
  const otherItems: RuntimeIssueView[] = [];

  for (const item of items) {
    const column = columns.get(normalizeStateKey(item.state));
    if (column) {
      column.issues.push(item);
      column.count += 1;
      continue;
    }
    otherItems.push(item);
  }

  const ordered = stages
    .map((stage) => columns.get(stage.key))
    .filter((column): column is WorkflowColumnView => Boolean(column));
  if (otherItems.length > 0) {
    ordered.push({
      key: "other",
      label: "Other",
      kind: "other",
      terminal: false,
      count: otherItems.length,
      issues: otherItems,
    });
  }
  return ordered;
}
