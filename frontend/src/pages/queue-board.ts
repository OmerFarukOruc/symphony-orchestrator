import { createEmptyState } from "../components/empty-state";
import { createIssueCard, type IssueCardHandle } from "../components/issue-card";
import type { WorkflowColumn } from "../types";
import { skeletonColumn } from "../ui/skeleton";
import { filterColumn, type QueueFilters, type QueueUiState } from "./queue-state";

interface QueueBoardRendererOptions {
  board: HTMLElement;
  filters: QueueFilters;
  getUi: () => QueueUiState;
  getRouteId: () => string;
  clearFilters: () => void;
  requestRender: () => void;
  onOpenIssue: (issueId: string, fullPage: boolean) => void;
}

interface QueueColumnHandle {
  section: HTMLElement;
  label: HTMLElement;
  count: HTMLElement;
  toggle: HTMLButtonElement;
  body: HTMLElement;
}

function createColumnHandle(onToggle: () => void): QueueColumnHandle {
  const section = document.createElement("section");
  section.className = "queue-column stagger-item";
  const header = document.createElement("div");
  header.className = "queue-column-header";
  const label = document.createElement("strong");
  const count = document.createElement("span");
  count.className = "mc-badge";
  const actions = document.createElement("div");
  actions.className = "queue-column-actions";
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "mc-chip";
  toggle.addEventListener("click", onToggle);
  actions.append(toggle);
  header.append(label, count, actions);
  const body = document.createElement("div");
  body.className = "queue-column-list";
  section.append(header, body);
  return { section, label, count, toggle, body };
}

export function createQueueBoardRenderer(options: QueueBoardRendererOptions): {
  renderLoading: () => void;
  render: (columns: WorkflowColumn[]) => void;
} {
  const columnHandles = new Map<string, QueueColumnHandle>();
  const cardHandles = new Map<string, IssueCardHandle>();

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

  function getColumnHandle(key: string): QueueColumnHandle {
    const existing = columnHandles.get(key);
    if (existing) {
      return existing;
    }
    const handle = createColumnHandle(() => {
      const ui = options.getUi();
      if (ui.collapsed.has(key)) ui.collapsed.delete(key);
      else ui.collapsed.add(key);
      options.requestRender();
    });
    columnHandles.set(key, handle);
    return handle;
  }

  function render(columns: WorkflowColumn[]): void {
    const eligible = columns.flatMap((column) => filterColumn(column, options.filters));
    if (columns.length === 0) {
      renderLoading();
      return;
    }
    if (eligible.length === 0) {
      options.board.replaceChildren(
        createEmptyState(
          "No eligible issues in current filters",
          "Broaden search, clear stage filters, or show completed columns.",
          "Clear filters",
          options.clearFilters,
        ),
      );
      return;
    }

    const nextIssueIds = new Set<string>();
    const ui = options.getUi();
    const sections = columns.map((column, columnIndex) => {
      const list = filterColumn(column, options.filters);
      const handle = getColumnHandle(column.key);
      handle.section.classList.toggle("is-collapsed", ui.collapsed.has(column.key));
      handle.section.classList.toggle("is-focused", ui.focusedColumn === columnIndex);
      handle.section.style.setProperty("--stagger-index", String(columnIndex));
      handle.label.textContent = column.label;
      handle.count.textContent = String(list.length);
      handle.toggle.hidden = !column.terminal;
      handle.toggle.textContent = ui.collapsed.has(column.key) ? "Expand" : "Collapse";

      if (list.length === 0) {
        handle.body.replaceChildren(
          createEmptyState(
            `No ${column.label.toLowerCase()} issues`,
            column.terminal ? "Terminal work is tucked away here." : "No active issues yet.",
          ),
        );
        return handle.section;
      }

      const cards = list.map((issue, cardIndex) => {
        nextIssueIds.add(issue.identifier);
        const existing = cardHandles.get(issue.identifier);
        const card =
          existing ??
          createIssueCard({
            issue,
            density: options.filters.density,
            selected: false,
            focused: false,
            onOpen: () => undefined,
            onFullPage: () => undefined,
            onFocus: () => undefined,
          });
        card.update({
          issue,
          density: options.filters.density,
          selected: options.getRouteId() === issue.identifier,
          focused: ui.focusedColumn === columnIndex && ui.focusedCard === cardIndex,
          onOpen: () => options.onOpenIssue(issue.identifier, false),
          onFullPage: () => options.onOpenIssue(issue.identifier, true),
          onFocus: () => {
            ui.focusedColumn = columnIndex;
            ui.focusedCard = cardIndex;
          },
        });
        if (!existing) {
          card.element.classList.add("stagger-item");
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
