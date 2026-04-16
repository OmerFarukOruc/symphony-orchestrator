import { api } from "../../api.js";
import { router, type RouterNavigateDetail } from "../../router.js";
import { getRuntimeClient, type RuntimeClient } from "../../state/runtime-client.js";
import type { AppState } from "../../state/store.js";
import type { RecentEvent, WorkflowColumn } from "../../types/runtime.js";
import { handleQueueKeyboard } from "../../pages/queue-keyboard.js";
import { createFilters, createUiState, type QueueFilters, type QueueUiState } from "../../pages/queue-state.js";

type QueueApi = Pick<typeof api, "postRefresh">;
type QueueRouter = Pick<typeof router, "navigate" | "subscribe">;
type QueueRuntimeClient = Pick<RuntimeClient, "getAppState" | "subscribeState">;

interface QueueWorkbenchDeps {
  api: QueueApi;
  router: QueueRouter;
  runtimeClient: QueueRuntimeClient;
  setTimeout: typeof globalThis.setTimeout;
  clearTimeout: typeof globalThis.clearTimeout;
}

export interface QueueWorkbenchState {
  filters: QueueFilters;
  ui: QueueUiState;
  routeId: string;
  columns: WorkflowColumn[];
  recentEvents: RecentEvent[];
  hasSnapshot: boolean;
}

interface CreateQueueWorkbenchOptions {
  routeId?: string;
  state?: QueueWorkbenchState;
  deps?: Partial<QueueWorkbenchDeps>;
}

interface QueueKeyboardBindings {
  search: HTMLInputElement;
  filterButton?: HTMLButtonElement;
}

export interface QueueWorkbench {
  readonly state: QueueWorkbenchState;
  subscribe(listener: () => void): () => void;
  initialize(): void;
  dispose(): void;
  refresh(): Promise<void>;
  clearFilters(): void;
  setSearchText(value: string): void;
  toggleStage(stageKey: string): void;
  setPriority(priority: string): void;
  setSort(sort: string): void;
  toggleDensity(): void;
  toggleCompleted(): void;
  focusCard(columnIndex: number, cardIndex: number): void;
  toggleColumnCollapse(columnKey: string): void;
  openIssue(issueId: string, fullPage?: boolean): void;
  handleKeyboard(event: KeyboardEvent, bindings: QueueKeyboardBindings): void;
  getToolbarKey(): string;
}

function issueFingerprint(issue: { identifier: string; status: string; priority: string | number | null }): string {
  return `${issue.identifier}:${issue.status}:${String(issue.priority)}`;
}

function getColumnsFingerprint(columns: WorkflowColumn[]): string {
  return columns
    .map((column) => `${column.key}:${column.count ?? 0}:${(column.issues ?? []).map(issueFingerprint).join(",")}`)
    .join("|");
}

function createQueueWorkbenchState(routeId = ""): QueueWorkbenchState {
  return {
    filters: createFilters(),
    ui: createUiState([]),
    routeId,
    columns: [],
    recentEvents: [],
    hasSnapshot: false,
  };
}

export function createQueueWorkbench(options: CreateQueueWorkbenchOptions = {}): QueueWorkbench {
  const state = options.state ?? createQueueWorkbenchState(options.routeId ?? "");
  const deps: QueueWorkbenchDeps = {
    api,
    router,
    runtimeClient: getRuntimeClient(),
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    ...options.deps,
  };
  const listeners = new Set<() => void>();
  let unsubscribeNavigation: (() => void) | null = null;
  let unsubscribeState: (() => void) | null = null;
  let refreshLocked = false;
  let refreshResetTimer: ReturnType<typeof setTimeout> | null = null;

  const emitChange = (): void => {
    listeners.forEach((listener) => listener());
  };

  const syncState = (appState: AppState): void => {
    const columns = appState.snapshot?.workflow_columns ?? [];
    state.columns = columns;
    state.recentEvents = appState.snapshot?.recent_events ?? [];
    state.hasSnapshot = Boolean(appState.snapshot);
    if (state.ui.collapsed.size === 0 && columns.length > 0) {
      state.ui = createUiState(columns);
    }
    emitChange();
  };

  const setRoute = (routeId = ""): void => {
    if (state.routeId === routeId) {
      return;
    }
    state.routeId = routeId;
    emitChange();
  };

  const workbench: QueueWorkbench = {
    state,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    initialize(): void {
      if (!unsubscribeNavigation) {
        unsubscribeNavigation = deps.router.subscribe((detail: RouterNavigateDetail) => {
          setRoute(detail.path.startsWith("/queue/") ? (detail.params.id ?? "") : "");
        });
      }
      if (!unsubscribeState) {
        unsubscribeState = deps.runtimeClient.subscribeState(syncState);
      }
      syncState(deps.runtimeClient.getAppState());
    },
    dispose(): void {
      unsubscribeNavigation?.();
      unsubscribeState?.();
      unsubscribeNavigation = null;
      unsubscribeState = null;
      if (refreshResetTimer !== null) {
        deps.clearTimeout(refreshResetTimer);
        refreshResetTimer = null;
      }
      refreshLocked = false;
    },
    async refresh(): Promise<void> {
      if (refreshLocked) {
        return;
      }
      refreshLocked = true;
      try {
        await deps.api.postRefresh();
      } finally {
        refreshResetTimer = deps.setTimeout(() => {
          refreshLocked = false;
          refreshResetTimer = null;
        }, 3_000);
      }
    },
    clearFilters(): void {
      state.filters.search = "";
      state.filters.priority = "all";
      state.filters.stages.clear();
      emitChange();
    },
    setSearchText(value: string): void {
      state.filters.search = value;
      emitChange();
    },
    toggleStage(stageKey: string): void {
      if (state.filters.stages.has(stageKey)) {
        state.filters.stages.delete(stageKey);
      } else {
        state.filters.stages.add(stageKey);
      }
      emitChange();
    },
    setPriority(priority: string): void {
      state.filters.priority = priority;
      emitChange();
    },
    setSort(sort: string): void {
      state.filters.sort = sort;
      emitChange();
    },
    toggleDensity(): void {
      state.filters.density = state.filters.density === "comfortable" ? "compact" : "comfortable";
      emitChange();
    },
    toggleCompleted(): void {
      state.filters.showCompleted = !state.filters.showCompleted;
      emitChange();
    },
    focusCard(columnIndex: number, cardIndex: number): void {
      state.ui.focusedColumn = columnIndex;
      state.ui.focusedCard = cardIndex;
    },
    toggleColumnCollapse(columnKey: string): void {
      if (state.ui.collapsed.has(columnKey)) {
        state.ui.collapsed.delete(columnKey);
        return;
      }
      state.ui.collapsed.add(columnKey);
    },
    openIssue(issueId: string, fullPage = false): void {
      deps.router.navigate(fullPage ? `/issues/${issueId}` : `/queue/${issueId}`);
    },
    handleKeyboard(event: KeyboardEvent, bindings: QueueKeyboardBindings): void {
      handleQueueKeyboard(event, {
        columns: state.columns,
        filters: state.filters,
        ui: state.ui,
        search: bindings.search,
        filterButton: bindings.filterButton,
        onSelect: (issueId, fullPage) => {
          workbench.openIssue(issueId, fullPage);
        },
        onClose: () => {
          if (state.routeId) {
            deps.router.navigate("/queue");
          }
        },
        onClearFilters: () => {
          workbench.clearFilters();
        },
        onRender: emitChange,
      });
    },
    getToolbarKey(): string {
      return JSON.stringify({
        columns: getColumnsFingerprint(state.columns),
        priority: state.filters.priority,
        stages: [...state.filters.stages].sort(),
        density: state.filters.density,
        sort: state.filters.sort,
        showCompleted: state.filters.showCompleted,
      });
    },
  };

  return workbench;
}
