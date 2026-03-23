import type { RuntimeIssueView, WorkflowColumn } from "../types";
import { matchesIssueSearch, normalizePriority, sortIssues } from "../utils/issues";

export interface QueueFilters {
  search: string;
  stages: Set<string>;
  priority: string;
  density: "compact" | "comfortable";
  sort: string;
  showCompleted: boolean;
}

export interface QueueUiState {
  focusedColumn: number;
  focusedCard: number;
  collapsed: Set<string>;
}

export function createFilters(): QueueFilters {
  return {
    search: "",
    stages: new Set<string>(),
    priority: "all",
    density: "comfortable",
    sort: "updated",
    showCompleted: true,
  };
}

export function createUiState(_columns: WorkflowColumn[]): QueueUiState {
  return {
    focusedColumn: 0,
    focusedCard: 0,
    collapsed: new Set<string>(),
  };
}

export function filterColumn(column: WorkflowColumn, filters: QueueFilters): RuntimeIssueView[] {
  if (!filters.showCompleted && column.terminal) {
    return [];
  }
  if (filters.stages.size > 0 && !filters.stages.has(column.key)) {
    return [];
  }
  return sortIssues(column.issues, filters.sort).filter((issue) => {
    if (filters.priority !== "all" && normalizePriority(issue.priority) !== filters.priority) {
      return false;
    }
    return matchesIssueSearch(issue, filters.search);
  });
}
