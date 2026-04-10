import { api } from "../api.js";
import { createIssueInspector } from "../components/issue-inspector.js";
import { router } from "../router.js";
import { store } from "../state/store.js";
import type { AppState } from "../state/store.js";
import type { RecentEvent, WorkflowColumn } from "../types.js";
import { registerPageCleanup } from "../utils/page.js";
import { createQueueBoardRenderer } from "./queue-board.js";
import { createDragStateManager } from "./drag-state.js";
import { handleQueueKeyboard } from "./queue-keyboard.js";
import { createFilters, createUiState } from "./queue-state.js";
import { buildQueueToolbar } from "./queue-toolbar.js";

function issueFingerprint(i: { identifier: string; status: string; priority: string | number | null }): string {
  return `${i.identifier}:${i.status}:${String(i.priority)}`;
}

function createRefreshHandler(): () => void {
  let refreshing = false;
  return () => {
    if (refreshing) return;
    refreshing = true;
    api.postRefresh().finally(() => {
      setTimeout(() => {
        refreshing = false;
      }, 3000);
    });
  };
}

export function createQueuePage(params?: Record<string, string>): HTMLElement {
  const page = document.createElement("div");
  page.className = "page queue-page fade-in";
  const mainPane = document.createElement("div");
  mainPane.className = "queue-main-pane";
  const toolbar = document.createElement("section");
  toolbar.className = "mc-toolbar queue-toolbar";
  toolbar.setAttribute("aria-label", "Queue filters");
  const layout = document.createElement("section");
  layout.className = "queue-layout";
  const boardWrap = document.createElement("div");
  boardWrap.className = "kanban-board-wrap";
  const board = document.createElement("div");
  board.className = "kanban-board";
  const inspector = createIssueInspector({
    mode: "drawer",
    initialId: params?.id,
    onClose: () => router.navigate("/queue"),
  });
  inspector.element.hidden = !params?.id;
  if (params?.id) layout.classList.add("has-panel");
  const pageHeading = document.createElement("h1");
  pageHeading.className = "sr-only";
  pageHeading.textContent = "Board";

  boardWrap.append(board);
  mainPane.append(toolbar, boardWrap);
  layout.append(mainPane, inspector.element);
  page.append(pageHeading, layout);

  const filters = createFilters();
  let ui = createUiState(store.getState().snapshot?.workflow_columns ?? []);
  let routeId = params?.id ?? "";
  let columns: WorkflowColumn[] = store.getState().snapshot?.workflow_columns ?? [];
  let recentEvents: RecentEvent[] = store.getState().snapshot?.recent_events ?? [];
  let searchInput: HTMLInputElement = document.createElement("input");
  let filterButton: HTMLButtonElement | null = null;
  let lastColumnFingerprint = "";

  function getColumnFingerprint(cols: WorkflowColumn[]): string {
    return cols.map((c) => `${c.key}:${c.count ?? 0}:${(c.issues ?? []).map(issueFingerprint).join(",")}`).join("|");
  }

  const dragManager = createDragStateManager();
  const boardRenderer = createQueueBoardRenderer({
    board,
    filters,
    getUi: () => ui,
    getRouteId: () => routeId,
    getRecentEvents: () => recentEvents,
    clearFilters,
    requestRender: renderBoard,
    onOpenIssue: (issueId, fullPage) => router.navigate(fullPage ? `/issues/${issueId}` : `/queue/${issueId}`),
    dragManager,
  });

  const onRefresh = createRefreshHandler();

  function renderToolbar(): void {
    const built = buildQueueToolbar({
      toolbar,
      filters,
      columns,
      onRefresh,
      onReset: clearFilters,
      onChange: renderBoard,
    });
    searchInput = built.search;
    filterButton = built.firstStageChip();
  }

  function setRoute(id = ""): void {
    routeId = id;
    const open = Boolean(id);
    inspector.element.hidden = !open;
    layout.classList.toggle("has-panel", open);
    if (open) {
      inspector.load(id).catch(() => {});
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
    recentEvents = state.snapshot?.recent_events ?? [];
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
      onClearFilters: clearFilters,
      onRender: renderBoard,
    });
  }

  const navHandler = (event: Event): void => {
    const detail = (event as CustomEvent<{ path: string; params: Record<string, string> }>).detail;
    setRoute(detail.path.startsWith("/queue/") ? (detail.params.id ?? "") : "");
  };
  const stateHandler = (event: Event): void => sync((event as CustomEvent<AppState>).detail);
  globalThis.addEventListener("router:navigate", navHandler);
  globalThis.addEventListener("state:update", stateHandler);
  globalThis.addEventListener("keydown", onKey);
  sync(store.getState());
  setRoute(routeId);
  registerPageCleanup(page, () => {
    inspector.destroy();
    globalThis.removeEventListener("router:navigate", navHandler);
    globalThis.removeEventListener("state:update", stateHandler);
    globalThis.removeEventListener("keydown", onKey);
  });
  return page;
}
