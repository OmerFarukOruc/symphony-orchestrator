import { createEmptyState } from "../components/empty-state";
import { createKanbanCard, type KanbanCardHandle } from "../components/kanban-card";
import { router } from "../router";
import {
  createKanbanColumn,
  applyColumnStage,
  setDropAllowed,
  type KanbanColumnHandle,
} from "../components/kanban-column";
import type { RecentEvent, WorkflowColumn } from "../types";
import { skeletonColumn } from "../ui/skeleton";
import { filterColumn, type QueueFilters, type QueueUiState } from "./queue-state";
import type { DragStateManager } from "./drag-state";

interface QueueBoardRendererOptions {
  board: HTMLElement;
  filters: QueueFilters;
  getUi: () => QueueUiState;
  getRouteId: () => string;
  getRecentEvents: () => RecentEvent[];
  clearFilters: () => void;
  requestRender: () => void;
  onOpenIssue: (issueId: string, fullPage: boolean) => void;
  dragManager?: DragStateManager;
}

const ATTENTION_LANE_KEYS = new Set(["review", "in_review", "blocked", "retrying"]);
const LIVE_LANE_KEYS = new Set(["in_progress"]);
const TERMINAL_LANE_KEYS = new Set(["done", "completed", "closed", "cancelled", "canceled", "duplicate"]);

function makeMoveHandler(
  options: QueueBoardRendererOptions,
  issueId: string,
  columnKey: string,
  getCurrentColumns: () => WorkflowColumn[],
): (direction: -1 | 1) => void {
  return (direction: -1 | 1) => {
    options.dragManager!.moveByOffset(issueId, columnKey, direction, getCurrentColumns()).catch(() => {});
  };
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
      options.dragManager!.onDrop(identifier, targetColumnKey, currentColumns).catch(() => {});
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
      handle.section.classList.toggle("is-empty", list.length === 0 && !ui.collapsed.has(column.key));
      handle.section.classList.toggle("is-focused", ui.focusedColumn === columnIndex);
      handle.section.classList.toggle("is-gate", column.kind === "gate");
      handle.section.classList.toggle("is-attention-lane", ATTENTION_LANE_KEYS.has(column.key));
      handle.section.classList.toggle("is-live-lane", LIVE_LANE_KEYS.has(column.key));
      handle.section.classList.toggle("is-terminal-lane", TERMINAL_LANE_KEYS.has(column.key) || column.terminal);
      handle.section.style.setProperty("--stagger-index", String(columnIndex));
      handle.label.textContent = column.label;
      handle.count.textContent = String(list.length);
      // Show collapse toggle on all columns
      const collapsed = ui.collapsed.has(column.key);
      handle.toggle.hidden = false;
      handle.toggle.textContent = collapsed ? "Show lane" : "Hide lane";
      handle.toggle.title = `${collapsed ? "Show" : "Hide"} ${column.label} lane`;
      handle.toggle.setAttribute("aria-label", handle.toggle.title);
      handle.toggle.setAttribute("aria-expanded", String(!collapsed));

      if (list.length === 0) {
        const emptyHint = column.terminal
          ? "Finished work will collect here as issues complete."
          : ATTENTION_LANE_KEYS.has(column.key)
            ? "If work needs a retry, unblock, or decision, it will surface here first."
            : LIVE_LANE_KEYS.has(column.key)
              ? "Active work appears here while agents are running."
              : "Issues will appear here as Linear syncs new work.";
        const emptyVariant = column.terminal ? "terminal" : ATTENTION_LANE_KEYS.has(column.key) ? "attention" : "queue";
        const hasFilters =
          options.filters.search.trim().length > 0 ||
          options.filters.stages.size > 0 ||
          options.filters.priority !== "all" ||
          !options.filters.showCompleted;
        handle.body.replaceChildren(
          createEmptyState(
            `No issues in ${column.label}`,
            hasFilters ? `${emptyHint} Try clearing filters to see the full board.` : emptyHint,
            hasFilters ? "Clear filters" : "Open overview",
            hasFilters ? options.clearFilters : () => router.navigate("/"),
            emptyVariant,
            { headingLevel: "h2" },
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
            recentEvents: [],
            selected: false,
            focused: false,
            onOpen: () => undefined,
            onFullPage: () => undefined,
            onFocus: () => undefined,
          });
        card.update({
          issue,
          recentEvents: options.getRecentEvents(),
          selected: options.getRouteId() === issue.identifier,
          focused: ui.focusedColumn === columnIndex && ui.focusedCard === cardIndex,
          onOpen: () => options.onOpenIssue(issue.identifier, false),
          onFullPage: () => options.onOpenIssue(issue.identifier, true),
          onMove: options.dragManager
            ? makeMoveHandler(options, issue.identifier, column.key, () => currentColumns)
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
