import type { WorkflowColumn } from "../types";
import { filterColumn, hasActiveFilters, type QueueFilters, type QueueUiState } from "./queue-state";

interface QueueKeyboardOptions {
  columns: WorkflowColumn[];
  filters: QueueFilters;
  ui: QueueUiState;
  search: HTMLInputElement;
  filterButton?: HTMLButtonElement;
  onSelect: (issueId: string, fullPage: boolean) => void;
  onClose: () => void;
  onClearFilters: () => void;
  onRender: () => void;
}

export function handleQueueKeyboard(event: KeyboardEvent, options: QueueKeyboardOptions): void {
  if (event.target instanceof HTMLElement && ["INPUT", "SELECT", "TEXTAREA"].includes(event.target.tagName)) {
    return;
  }
  const { columns, filters, ui, search, filterButton, onSelect, onClose, onClearFilters, onRender } = options;
  const visible = columns.filter((column) => filterColumn(column, filters).length > 0);
  if (event.key === "/") {
    event.preventDefault();
    search.focus();
    return;
  }
  if (event.key === "f") {
    filterButton?.focus();
    return;
  }
  if (event.key === "[") {
    ui.focusedColumn = Math.max(0, ui.focusedColumn - 1);
    ui.focusedCard = 0;
    onRender();
    return;
  }
  if (event.key === "]") {
    ui.focusedColumn = Math.min(Math.max(visible.length - 1, 0), ui.focusedColumn + 1);
    ui.focusedCard = 0;
    onRender();
    return;
  }
  if (event.key === "j") {
    ui.focusedCard += 1;
    onRender();
    return;
  }
  if (event.key === "k") {
    ui.focusedCard = Math.max(0, ui.focusedCard - 1);
    onRender();
    return;
  }
  if (event.key === "Enter") {
    const issue = filterColumn(columns[ui.focusedColumn] ?? columns[0], filters)[ui.focusedCard];
    if (issue) {
      onSelect(issue.identifier, event.shiftKey);
    }
    return;
  }
  if (event.key === "Escape") {
    if (hasActiveFilters(filters)) {
      onClearFilters();
      return;
    }
    onClose();
  }
}
