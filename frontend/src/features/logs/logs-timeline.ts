import { eventMatchesSearch, stringifyPayload } from "../../utils/events.js";
import type { RecentEvent, RuntimeIssueView } from "../../types/runtime.js";
import { createLogBuffer, type SortDirection } from "../../state/log-buffer.js";
import { getRuntimeClient, type AgentEventPayload, type RuntimeClient } from "../../state/runtime-client.js";
import { loadArchiveLogs, loadLiveLogs, shouldDisplayLogsEvent } from "../../pages/logs-data.js";
import { reduceEvents, type RenderedTimeline } from "./logs-reducer.js";

export type LogsMode = "live" | "archive";
export type LogsDensity = "compact" | "comfortable";

export interface LogsAppendEvent {
  event: RecentEvent;
  index: number;
}

export interface LogsRenderOptions {
  animate?: boolean;
  appendEvent?: LogsAppendEvent;
}

export interface LogsTimelineState {
  mode: LogsMode;
  density: LogsDensity;
  autoScroll: boolean;
  searchText: string;
  issueTitle: string;
  activeKinds: Set<string>;
  newEventCount: number;
  loading: boolean;
  error: string | null;
  issueView: RuntimeIssueView | null;
  /**
   * Section keys the user has manually collapsed. Persisted across re-renders
   * so SSE events don't flip collapsed blocks back open. Keys: "preamble" or
   * "turn:${turnId}".
   */
  collapsedSections: Set<string>;
}

type IntervalHandle = number;

interface LogsTimelineDeps {
  runtimeClient: Pick<RuntimeClient, "subscribeAllEvents" | "subscribeIssueLifecycle">;
  loadLiveLogs: typeof loadLiveLogs;
  loadArchiveLogs: typeof loadArchiveLogs;
  shouldDisplayLogsEvent: typeof shouldDisplayLogsEvent;
  setInterval: (handler: TimerHandler, timeout?: number, ...arguments_: unknown[]) => IntervalHandle;
  clearInterval: (id: IntervalHandle | undefined) => void;
}

interface LogsTimelineOptions {
  id: string;
  rerender: (options?: LogsRenderOptions) => void;
  initialMode?: LogsMode;
  deps?: Partial<LogsTimelineDeps>;
}

export interface LogsTimeline {
  state: LogsTimelineState;
  initialize: () => void;
  dispose: () => void;
  getAllEvents: () => RecentEvent[];
  getVisibleEvents: () => RecentEvent[];
  getTimeline: () => RenderedTimeline;
  getSortDirection: () => SortDirection;
  getExpandedCount: () => number;
  getHeaderSummary: () => string;
  getIndicatorLabel: () => string;
  getCopyText: () => string;
  hasVisibleEvents: () => boolean;
  isExpanded: (event: RecentEvent) => boolean;
  toggleExpanded: (event: RecentEvent) => void;
  clearAllFilters: () => void;
  toggleCategoryKinds: (kinds: Iterable<string>) => void;
  toggleKind: (kind: string) => void;
  setSearchText: (value: string) => void;
  setSortDirection: (direction: SortDirection) => void;
  toggleDensity: () => void;
  toggleAutoScroll: () => void;
  setAutoScroll: (value: boolean) => void;
  toggleExpandAll: () => void;
  toggleCollapsedSection: (key: string) => void;
  isSectionCollapsed: (key: string) => boolean;
  acknowledgeNewEvents: () => void;
  switchMode: (mode: LogsMode) => void;
  refresh: () => Promise<void>;
}

function rowKey(event: RecentEvent): string {
  return `${event.at}:${event.event}:${event.message}`;
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

function toRecentEvent(payload: AgentEventPayload): RecentEvent {
  return {
    at: payload.timestamp ?? new Date().toISOString(),
    issue_id: payload.issueId ?? "",
    issue_identifier: payload.identifier ?? "",
    session_id: payload.sessionId ?? null,
    event: payload.type ?? "",
    message: payload.message ?? "",
    content: payload.content ?? null,
  };
}

export function createLogsTimeline(options: LogsTimelineOptions): LogsTimeline {
  const currentWindow = typeof window === "undefined" ? null : window;
  const deps: LogsTimelineDeps = {
    runtimeClient: getRuntimeClient(),
    loadLiveLogs,
    loadArchiveLogs,
    shouldDisplayLogsEvent,
    setInterval: currentWindow
      ? (handler: TimerHandler, timeout?: number, ...arguments_: unknown[]) =>
          currentWindow.setInterval(handler, timeout, ...arguments_)
      : (handler: TimerHandler, timeout?: number, ...arguments_: unknown[]) =>
          globalThis.setInterval(handler, timeout, ...arguments_) as unknown as IntervalHandle,
    clearInterval: currentWindow
      ? (id: IntervalHandle | undefined) => {
          if (id !== undefined) {
            currentWindow.clearInterval(id);
          }
        }
      : (id: IntervalHandle | undefined) => {
          if (id !== undefined) {
            globalThis.clearInterval(id as unknown as ReturnType<typeof globalThis.setInterval>);
          }
        },
    ...options.deps,
  };

  const buffer = createLogBuffer("desc");
  const expandedEvents = new Set<string>();
  const initialMode: LogsMode = options.initialMode ?? "live";
  const state: LogsTimelineState = {
    mode: initialMode,
    density: "compact",
    autoScroll: initialMode === "live",
    searchText: "",
    issueTitle: options.id,
    activeKinds: new Set<string>(),
    newEventCount: 0,
    loading: false,
    error: null,
    issueView: null,
    collapsedSections: new Set<string>(),
  };

  let timer: IntervalHandle | null = null;
  let unsubscribeLifecycle: (() => void) | null = null;
  let unsubscribeStream: (() => void) | null = null;

  function rerender(renderOptions?: LogsRenderOptions): void {
    options.rerender(renderOptions);
  }

  function visibleInsertIndex(target: RecentEvent): number {
    let index = 0;
    for (const event of buffer.events()) {
      if (event === target) {
        break;
      }
      if (eventPassesFilters(event)) {
        index += 1;
      }
    }
    return index;
  }

  function eventPassesFilters(event: RecentEvent): boolean {
    const matchesKind = state.activeKinds.size === 0 || state.activeKinds.has(event.event);
    return matchesKind && eventMatchesSearch(event, state.searchText);
  }

  function getVisibleEvents(): RecentEvent[] {
    return buffer.events().filter((event) => eventPassesFilters(event));
  }

  function buildHeaderSummary(): string {
    const visibleCount = getVisibleEvents().length;
    const totalCount = buffer.events().length;
    const summary: string[] = [state.mode === "live" ? "Live stream" : "History"];
    if (totalCount === 0) {
      summary.push(state.mode === "live" ? "Waiting for activity" : "No archived events");
    } else if (visibleCount === totalCount) {
      summary.push(`${totalCount} ${pluralize(totalCount, "event")}`);
    } else {
      summary.push(`${visibleCount} of ${totalCount} ${pluralize(totalCount, "event")}`);
    }
    if (state.activeKinds.size > 0) {
      summary.push(`${state.activeKinds.size} ${pluralize(state.activeKinds.size, "kind")} filtered`);
    }
    if (state.searchText.trim()) {
      summary.push(`Search: "${state.searchText.trim()}"`);
    }
    if (buffer.direction() === "asc") {
      summary.push("Oldest first");
    }
    if (state.autoScroll) {
      summary.push("Following");
    }
    return summary.join(" · ");
  }

  function resetNewEvents(): void {
    state.newEventCount = 0;
  }

  async function refresh(): Promise<void> {
    state.loading = true;
    state.error = null;
    rerender();
    try {
      const fresh =
        state.mode === "live" ? await deps.loadLiveLogs(options.id) : await deps.loadArchiveLogs(options.id);
      state.issueTitle = fresh.title.trim() || options.id;
      state.issueView = fresh.issueView;
      buffer.clear();
      buffer.load(fresh.events);
      resetNewEvents();
      state.loading = false;
      rerender({ animate: true });
    } catch (error) {
      state.loading = false;
      state.error = error instanceof Error ? error.message : String(error);
      rerender();
    }
  }

  async function reconcile(): Promise<void> {
    try {
      const fresh =
        state.mode === "live" ? await deps.loadLiveLogs(options.id) : await deps.loadArchiveLogs(options.id);
      state.issueTitle = fresh.title.trim() || options.id;
      if (fresh.issueView) {
        state.issueView = fresh.issueView;
      }
      const beforeSize = buffer.size();
      buffer.load(fresh.events);
      if (buffer.size() !== beforeSize) {
        rerender();
      }
    } catch {
      // Reconcile failures are transient — the next tick or SSE event will recover.
      // Keeping the existing buffer preserves the operator's view.
    }
  }

  function handleIncomingEvent(payload: AgentEventPayload): void {
    const recentEvent = toRecentEvent(payload);
    if (!deps.shouldDisplayLogsEvent(recentEvent)) {
      return;
    }
    if (!buffer.insert(recentEvent) || !eventPassesFilters(recentEvent)) {
      return;
    }
    const appendEvent: LogsAppendEvent = {
      event: recentEvent,
      index: visibleInsertIndex(recentEvent),
    };
    if (!state.autoScroll) {
      state.newEventCount += 1;
    }
    rerender({ appendEvent });
  }

  function stopLiveSubscriptions(): void {
    if (timer !== null) {
      deps.clearInterval(timer);
      timer = null;
    }
    unsubscribeLifecycle?.();
    unsubscribeStream?.();
    unsubscribeLifecycle = null;
    unsubscribeStream = null;
  }

  function restartSubscriptions(): void {
    stopLiveSubscriptions();
    if (state.mode !== "live") {
      return;
    }
    unsubscribeStream = deps.runtimeClient.subscribeAllEvents(options.id, (sseEvent) => {
      if (sseEvent.type === "agent.event") {
        handleIncomingEvent(sseEvent.payload as unknown as AgentEventPayload);
      }
    });
    unsubscribeLifecycle = deps.runtimeClient.subscribeIssueLifecycle(options.id, () => void reconcile());
    timer = deps.setInterval(() => void reconcile(), 30_000);
  }

  function clearAllFilters(): void {
    state.activeKinds.clear();
    rerender();
  }

  function toggleCategoryKinds(kinds: Iterable<string>): void {
    const categoryKinds = [...kinds];
    const anyActive = categoryKinds.some((kind) => state.activeKinds.has(kind));
    for (const kind of categoryKinds) {
      if (anyActive) {
        state.activeKinds.delete(kind);
      } else {
        state.activeKinds.add(kind);
      }
    }
    rerender();
  }

  function toggleKind(kind: string): void {
    if (state.activeKinds.has(kind)) {
      state.activeKinds.delete(kind);
    } else {
      state.activeKinds.add(kind);
    }
    rerender();
  }

  function setSearchText(value: string): void {
    state.searchText = value;
    rerender();
  }

  function setSortDirection(direction: SortDirection): void {
    buffer.setDirection(direction);
    rerender();
  }

  function toggleDensity(): void {
    state.density = state.density === "compact" ? "comfortable" : "compact";
    rerender();
  }

  function toggleAutoScroll(): void {
    setAutoScroll(!state.autoScroll);
  }

  function setAutoScroll(value: boolean): void {
    if (state.autoScroll === value) {
      return;
    }
    state.autoScroll = value;
    if (value) {
      resetNewEvents();
    }
    rerender();
  }

  function toggleCollapsedSection(key: string): void {
    if (state.collapsedSections.has(key)) {
      state.collapsedSections.delete(key);
    } else {
      state.collapsedSections.add(key);
    }
    rerender();
  }

  function isSectionCollapsed(key: string): boolean {
    return state.collapsedSections.has(key);
  }

  function toggleExpandAll(): void {
    // The hierarchical renderer collapses completed turns by default. If any
    // section is currently collapsed, clear the set (expand everything). Else,
    // mark every known turn as collapsed.
    if (state.collapsedSections.size > 0) {
      state.collapsedSections.clear();
    } else {
      const timeline = reduceEvents(buffer.events());
      for (const turn of timeline.turns) {
        const key = `turn:${turn.turnId ?? turn.sessionId ?? turn.startedAt}`;
        state.collapsedSections.add(key);
      }
      state.collapsedSections.add("preamble");
    }
    rerender();
  }

  function toggleExpanded(event: RecentEvent): void {
    const key = rowKey(event);
    if (expandedEvents.has(key)) {
      expandedEvents.delete(key);
    } else {
      expandedEvents.add(key);
    }
    rerender();
  }

  function getCopyText(): string {
    return getVisibleEvents()
      .map((event) => {
        const payload = stringifyPayload(event.content);
        const header = `[${event.at}] [${event.event}] ${event.message}`;
        return payload ? `${header}\n${payload}` : header;
      })
      .join("\n\n");
  }

  function getIndicatorLabel(): string {
    const arrow = buffer.direction() === "desc" ? "\u2191" : "\u2193";
    return state.newEventCount > 0 ? `${arrow} ${state.newEventCount} new` : `${arrow} New events`;
  }

  function acknowledgeNewEvents(): void {
    if (state.newEventCount === 0) {
      return;
    }
    resetNewEvents();
    rerender();
  }

  function switchMode(mode: LogsMode): void {
    if (state.mode === mode) {
      return;
    }
    state.mode = mode;
    resetNewEvents();
    rerender();
    restartSubscriptions();
    void refresh();
  }

  function initialize(): void {
    void refresh();
    restartSubscriptions();
  }

  function dispose(): void {
    stopLiveSubscriptions();
  }

  return {
    state,
    initialize,
    dispose,
    getAllEvents: () => buffer.events(),
    getVisibleEvents,
    getTimeline: () => reduceEvents(buffer.events()),
    getSortDirection: () => buffer.direction(),
    getExpandedCount: () => expandedEvents.size,
    getHeaderSummary: buildHeaderSummary,
    getIndicatorLabel,
    getCopyText,
    hasVisibleEvents: () => getVisibleEvents().length > 0,
    isExpanded: (event) => expandedEvents.has(rowKey(event)),
    toggleExpanded,
    clearAllFilters,
    toggleCategoryKinds,
    toggleKind,
    setSearchText,
    setSortDirection,
    toggleDensity,
    toggleAutoScroll,
    setAutoScroll,
    toggleExpandAll,
    toggleCollapsedSection,
    isSectionCollapsed,
    acknowledgeNewEvents,
    switchMode,
    refresh,
  };
}
