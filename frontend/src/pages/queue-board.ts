import { createEmptyState } from "../components/empty-state";
import { createKanbanCard, type KanbanCardHandle } from "../components/kanban-card";
import { router } from "../router";
import {
  createKanbanColumn,
  applyColumnStage,
  setDropAllowed,
  type KanbanColumnHandle,
} from "../components/kanban-column";
import type { WorkflowColumn } from "../types";
import { skeletonColumn } from "../ui/skeleton";
import { filterColumn, type QueueFilters, type QueueUiState } from "./queue-state";
import type { DragStateManager } from "./drag-state";

interface QueueBoardRendererOptions {
  board: HTMLElement;
  filters: QueueFilters;
  getUi: () => QueueUiState;
  getRouteId: () => string;
  clearFilters: () => void;
  requestRender: () => void;
  onOpenIssue: (issueId: string, fullPage: boolean) => void;
  dragManager?: DragStateManager;
}

export function createQueueBoardRenderer(options: QueueBoardRendererOptions): {
  renderLoading: () => void;
  render: (columns: WorkflowColumn[]) => void;
} {
  const columnHandles = new Map<string, KanbanColumnHandle>();
  const cardHandles = new Map<string, KanbanCardHandle>();
  let currentColumns: WorkflowColumn[] = [];

  if (options.dragManager) {
    options.board.addEventListener("kanban-drop", (event) => {
      const { identifier, targetColumnKey } = (event as CustomEvent<{ identifier: string; targetColumnKey: string }>)
        .detail;
      void options.dragManager!.onDrop(identifier, targetColumnKey, currentColumns);
    });

    options.board.addEventListener("dragstart", (event) => {
      const card = (event.target as HTMLElement).closest(".kanban-card");
      const sourceSection = card?.closest(".kanban-column") as HTMLElement | null;
      const sourceColumnKey = sourceSection?.dataset.stage ?? null;
      if (!sourceColumnKey) return;
      options.dragManager!.onDragStart((card as HTMLElement).dataset.issueId ?? "", sourceColumnKey, {
        sourceEl: card as HTMLElement,
        x: event.clientX,
        y: event.clientY,
      });
      // Update forbidden state on all column handles
      for (const [key, handle] of columnHandles) {
        setDropAllowed(handle, options.dragManager!.canDrop(sourceColumnKey, key));
      }
    });

    options.board.addEventListener("dragend", () => {
      options.dragManager!.onDragEnd();
      for (const handle of columnHandles.values()) {
        setDropAllowed(handle, true);
      }
    });
  }

  function renderLoading(): void {
    options.board.replaceChildren(
      ...Array.from({ length: 3 }, (_, index) => {
        const column = skeletonColumn();
        column.classList.add("stagger-item");
        column.style.setProperty("--stagger-index", String(index));
        return column;
      }),
    );
  }

  function getColumnHandle(key: string): KanbanColumnHandle {
    const existing = columnHandles.get(key);
    if (existing) return existing;
    const handle = createKanbanColumn(() => {
      const ui = options.getUi();
      if (ui.collapsed.has(key)) ui.collapsed.delete(key);
      else ui.collapsed.add(key);
      options.requestRender();
    });
    columnHandles.set(key, handle);
    return handle;
  }

  function render(columns: WorkflowColumn[]): void {
    if (columns.length === 0) {
      renderLoading();
      return;
    }
    options.board.classList.toggle("is-compact", options.filters.density === "compact");
    options.board.classList.toggle("is-comfortable", options.filters.density === "comfortable");
    /* Even when no issues match, render all columns with their per-column
       empty states so the Kanban board structure stays visible. */

    currentColumns = columns;
    const nextIssueIds = new Set<string>();
    const ui = options.getUi();
    const sections = columns.map((column, columnIndex) => {
      const list = filterColumn(column, options.filters);
      const handle = getColumnHandle(column.key);
      applyColumnStage(handle, column.key);
      handle.section.classList.toggle("is-collapsed", ui.collapsed.has(column.key));
      handle.section.classList.toggle("is-focused", ui.focusedColumn === columnIndex);
      handle.section.classList.toggle("is-gate", column.kind === "gate");
      handle.section.style.setProperty("--stagger-index", String(columnIndex));
      handle.label.textContent = column.label;
      handle.count.textContent = String(list.length);
      // Show collapse toggle on all columns
      handle.toggle.hidden = false;
      handle.toggle.textContent = ui.collapsed.has(column.key) ? "Expand" : "Collapse";

      if (list.length === 0) {
        const emptyHint = column.terminal
          ? "Completed work is tucked away here."
          : "No active issues yet. They appear when Linear syncs.";
        const hasFilters =
          options.filters.search.trim().length > 0 ||
          options.filters.stages.size > 0 ||
          options.filters.priority !== "all" ||
          !options.filters.showCompleted;
        handle.body.replaceChildren(
          createEmptyState(
            `No ${column.label.toLowerCase()} issues`,
            hasFilters ? `${emptyHint} Clear filters to widen the board again.` : emptyHint,
            hasFilters ? "Clear filters" : "Open overview",
            hasFilters ? options.clearFilters : () => router.navigate("/"),
            column.terminal ? "terminal" : "queue",
          ),
        );
        return handle.section;
      }

      const cards = list.map((issue, cardIndex) => {
        nextIssueIds.add(issue.identifier);
        const existing = cardHandles.get(issue.identifier);
        const card =
          existing ??
          createKanbanCard({
            issue,
            selected: false,
            focused: false,
            onOpen: () => undefined,
            onFullPage: () => undefined,
            onFocus: () => undefined,
          });
        card.update({
          issue,
          selected: options.getRouteId() === issue.identifier,
          focused: ui.focusedColumn === columnIndex && ui.focusedCard === cardIndex,
          onOpen: () => options.onOpenIssue(issue.identifier, false),
          onFullPage: () => options.onOpenIssue(issue.identifier, true),
          onMove: options.dragManager
            ? (direction) => {
                void options.dragManager!.moveByOffset(issue.identifier, column.key, direction, currentColumns);
              }
            : undefined,
          onFocus: () => {
            ui.focusedColumn = columnIndex;
            ui.focusedCard = cardIndex;
          },
        });
        if (!existing) {
          cardHandles.set(issue.identifier, card);
        }
        card.element.style.setProperty("--stagger-index", String(cardIndex));
        return card.element;
      });
      handle.body.replaceChildren(...cards);
      return handle.section;
    });

    for (const [issueId] of cardHandles) {
      if (!nextIssueIds.has(issueId)) {
        cardHandles.delete(issueId);
      }
    }

    options.board.replaceChildren(...sections);
  }

  return { renderLoading, render };
}
