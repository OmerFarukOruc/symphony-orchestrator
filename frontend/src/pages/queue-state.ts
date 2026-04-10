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

export function isDefaultFilters(filters: QueueFilters): boolean {
  return (
    filters.search === "" &&
    filters.stages.size === 0 &&
    filters.priority === "all" &&
    filters.sort === "updated" &&
    filters.density === "comfortable" &&
    filters.showCompleted === true
  );
}

export function hasActiveFilters(filters: QueueFilters): boolean {
  return filters.search !== "" || filters.stages.size > 0 || filters.priority !== "all";
}

export function createUiState(_columns: WorkflowColumn[]): QueueUiState {
  return {
    focusedColumn: 0,
    focusedCard: 0,
    collapsed: new Set<string>(),
  };
}

function normalizeStageKey(key: string): string {
  const lower = key.toLowerCase();
  if (lower === "cancelled" || lower === "canceled") return "cancelled";
  return lower.replaceAll(" ", "_");
}

export function filterColumn(column: WorkflowColumn, filters: QueueFilters): RuntimeIssueView[] {
  if (!filters.showCompleted && column.terminal) {
    return [];
  }
  if (filters.stages.size > 0 && !filters.stages.has(normalizeStageKey(column.key))) {
    return [];
  }
  return sortIssues(column.issues ?? [], filters.sort).filter((issue) => {
    if (filters.priority !== "all" && normalizePriority(issue.priority) !== filters.priority) {
      return false;
    }
    return matchesIssueSearch(issue, filters.search);
  });
}
