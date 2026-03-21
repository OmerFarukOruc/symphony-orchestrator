import { api } from "../api";
import { createIssueInspector } from "../components/issue-inspector";
import { router } from "../router";
import { store } from "../state/store";
import type { AppState } from "../state/store";
import type { WorkflowColumn } from "../types";
import { registerPageCleanup } from "../utils/page";
import { createQueueBoardRenderer } from "./queue-board";
import { handleQueueKeyboard } from "./queue-keyboard";
import { createFilters, createUiState } from "./queue-state";
import { buildQueueToolbar } from "./queue-toolbar";

export function createQueuePage(params?: Record<string, string>): HTMLElement {
  const page = document.createElement("div");
  page.className = "page queue-page fade-in";
  const toolbar = document.createElement("section");
  toolbar.className = "mc-toolbar queue-toolbar";
  const layout = document.createElement("section");
  layout.className = "queue-layout";
  const boardWrap = document.createElement("div");
  boardWrap.className = "kanban-board-wrap";
  const board = document.createElement("div");
  board.className = "kanban-board";
  const backdrop = document.createElement("div");
  backdrop.className = "drawer-overlay";
  backdrop.hidden = true;
  backdrop.addEventListener("click", () => router.navigate("/queue"));
  const inspector = createIssueInspector({
    mode: "drawer",
    initialId: params?.id,
    onClose: () => router.navigate("/queue"),
  });
  inspector.element.hidden = !params?.id;
  if (params?.id) backdrop.hidden = false;
  boardWrap.append(board);
  layout.append(boardWrap);
  page.append(toolbar, layout, backdrop, inspector.element);

  const filters = createFilters();
  let ui = createUiState(store.getState().snapshot?.workflow_columns ?? []);
  let routeId = params?.id ?? "";
  let columns: WorkflowColumn[] = store.getState().snapshot?.workflow_columns ?? [];
  let searchInput: HTMLInputElement = document.createElement("input");
  let filterButton: HTMLButtonElement | null = null;
  let lastColumnFingerprint = "";

  function getColumnFingerprint(cols: WorkflowColumn[]): string {
    return cols
      .map(
        (c) => `${c.key}:${c.count ?? 0}:${c.issues.map((i) => `${i.identifier}:${i.status}:${i.priority}`).join(",")}`,
      )
      .join("|");
  }

  const boardRenderer = createQueueBoardRenderer({
    board,
    filters,
    getUi: () => ui,
    getRouteId: () => routeId,
    clearFilters,
    requestRender: renderBoard,
    onOpenIssue: (issueId, fullPage) => router.navigate(fullPage ? `/issues/${issueId}` : `/queue/${issueId}`),
  });

  function renderToolbar(): void {
    const built = buildQueueToolbar({
      toolbar,
      filters,
      columns,
      onRefresh: (() => {
        let refreshing = false;
        return () => {
          if (refreshing) return;
          refreshing = true;
          void api.postRefresh().finally(() => {
            setTimeout(() => {
              refreshing = false;
            }, 3000);
          });
        };
      })(),
      onChange: renderBoard,
    });
    searchInput = built.search;
    filterButton = built.firstStageChip();
  }

  function setRoute(id = ""): void {
    routeId = id;
    const open = Boolean(id);
    inspector.element.hidden = !open;
    backdrop.hidden = !open;
    if (open) {
      void inspector.load(id);
    }
  }

  function clearFilters(): void {
    filters.search = "";
    filters.priority = "all";
    filters.stages.clear();
    renderToolbar();
    searchInput.value = "";
    renderBoard();
  }

  function renderBoard(): void {
    boardRenderer.render(columns);
  }

  function sync(state: AppState): void {
    columns = state.snapshot?.workflow_columns ?? [];
    if (ui.collapsed.size === 0 && columns.length > 0) {
      ui = createUiState(columns);
    }
    if (!state.snapshot) {
      boardRenderer.renderLoading();
      return;
    }
    const fp = getColumnFingerprint(columns);
    if (fp !== lastColumnFingerprint) {
      lastColumnFingerprint = fp;
      renderToolbar();
      renderBoard();
    }
  }

  function onKey(event: KeyboardEvent): void {
    handleQueueKeyboard(event, {
      columns,
      filters,
      ui,
      search: searchInput,
      filterButton: filterButton ?? undefined,
      onSelect: (issueId, fullPage) => router.navigate(fullPage ? `/issues/${issueId}` : `/queue/${issueId}`),
      onClose: () => {
        if (routeId) {
          router.navigate("/queue");
        }
      },
      onRender: renderBoard,
    });
  }

  const navHandler = (event: Event): void => {
    const detail = (event as CustomEvent<{ path: string; params: Record<string, string> }>).detail;
    setRoute(detail.path.startsWith("/queue/") ? (detail.params.id ?? "") : "");
  };
  const stateHandler = (event: Event): void => sync((event as CustomEvent<AppState>).detail);
  window.addEventListener("router:navigate", navHandler);
  window.addEventListener("state:update", stateHandler);
  window.addEventListener("keydown", onKey);
  sync(store.getState());
  setRoute(routeId);
  registerPageCleanup(page, () => {
    inspector.destroy();
    window.removeEventListener("router:navigate", navHandler);
    window.removeEventListener("state:update", stateHandler);
    window.removeEventListener("keydown", onKey);
  });
  return page;
}
