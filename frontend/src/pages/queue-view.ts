import { createIssueInspector } from "../components/issue-inspector.js";
import { router } from "../router.js";
import { registerPageCleanup } from "../utils/page.js";
import { createQueueWorkbench } from "../features/queue/queue-workbench.js";
import { createQueueBoardRenderer } from "./queue-board.js";
import { createDragStateManager } from "./drag-state.js";
import { buildQueueToolbar } from "./queue-toolbar.js";

export function createQueuePage(params?: Record<string, string>): HTMLElement {
  const workbench = createQueueWorkbench({ routeId: params?.id });
  const { state } = workbench;
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
  const pageHeading = document.createElement("h1");
  pageHeading.className = "sr-only";
  pageHeading.textContent = "Board";

  boardWrap.append(board);
  mainPane.append(toolbar, boardWrap);
  layout.append(mainPane, inspector.element);
  page.append(pageHeading, layout);

  let searchInput: HTMLInputElement = document.createElement("input");
  let filterButton: HTMLButtonElement | null = null;
  let lastToolbarKey = "";
  let lastToolbarSearch = state.filters.search;
  let lastInspectorId = "";

  const dragManager = createDragStateManager();
  const boardRenderer = createQueueBoardRenderer({
    board,
    filters: state.filters,
    getUi: () => state.ui,
    getRouteId: () => state.routeId,
    getRecentEvents: () => state.recentEvents,
    clearFilters: () => workbench.clearFilters(),
    requestRender: renderBoard,
    onOpenIssue: (issueId, fullPage) => workbench.openIssue(issueId, fullPage),
    onToggleColumnCollapse: (columnKey) => workbench.toggleColumnCollapse(columnKey),
    onFocusCard: (columnIndex, cardIndex) => workbench.focusCard(columnIndex, cardIndex),
    dragManager,
  });

  function renderToolbar(force = false): void {
    const nextToolbarKey = workbench.getToolbarKey();
    const nextSearch = state.filters.search;
    const searchIsFocused = document.activeElement === searchInput;
    const shouldRebuild =
      force || nextToolbarKey !== lastToolbarKey || (!searchIsFocused && nextSearch !== lastToolbarSearch);
    if (!shouldRebuild) {
      lastToolbarKey = nextToolbarKey;
      lastToolbarSearch = nextSearch;
      return;
    }
    lastToolbarKey = nextToolbarKey;
    lastToolbarSearch = nextSearch;
    const built = buildQueueToolbar({
      toolbar,
      filters: state.filters,
      columns: state.columns,
      onRefresh: () => {
        void workbench.refresh();
      },
      onReset: () => workbench.clearFilters(),
      onSearchChange: (value) => workbench.setSearchText(value),
      onToggleStage: (stageKey) => workbench.toggleStage(stageKey),
      onSetPriority: (priority) => workbench.setPriority(priority),
      onSetSort: (sort) => workbench.setSort(sort),
      onToggleDensity: () => workbench.toggleDensity(),
      onToggleCompleted: () => workbench.toggleCompleted(),
    });
    searchInput = built.search;
    filterButton = built.firstStageChip();
  }

  function syncInspector(): void {
    const open = Boolean(state.routeId);
    inspector.element.hidden = !open;
    layout.classList.toggle("has-panel", open);
    if (open && state.routeId !== lastInspectorId) {
      inspector.load(state.routeId).catch(() => {});
    }
    lastInspectorId = state.routeId;
  }

  function renderBoard(): void {
    if (!state.hasSnapshot) {
      boardRenderer.renderLoading();
      return;
    }
    boardRenderer.render(state.columns);
  }

  function render(): void {
    renderToolbar();
    renderBoard();
    syncInspector();
  }

  function onKey(event: KeyboardEvent): void {
    workbench.handleKeyboard(event, {
      search: searchInput,
      filterButton: filterButton ?? undefined,
    });
  }

  const unsubscribe = workbench.subscribe(render);
  globalThis.addEventListener("keydown", onKey);
  workbench.initialize();
  renderToolbar(true);
  render();
  registerPageCleanup(page, () => {
    inspector.destroy();
    unsubscribe();
    workbench.dispose();
    globalThis.removeEventListener("keydown", onKey);
  });
  return page;
}
