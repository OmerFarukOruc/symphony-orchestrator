import { eventMatchesSearch, stringifyPayload } from "../../utils/events.js";
import type { RecentEvent } from "../../types/runtime.js";
import { createLogBuffer, type SortDirection } from "../../state/log-buffer.js";
import { getRuntimeClient, type AgentEventPayload, type RuntimeClient } from "../../state/runtime-client.js";
import { loadArchiveLogs, loadLiveLogs, shouldDisplayLogsEvent } from "../../pages/logs-data.js";

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
  deps?: Partial<LogsTimelineDeps>;
}

export interface LogsTimeline {
  state: LogsTimelineState;
  initialize: () => void;
  dispose: () => void;
  getAllEvents: () => RecentEvent[];
  getVisibleEvents: () => RecentEvent[];
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
  toggleExpandAll: () => void;
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
  const state: LogsTimelineState = {
    mode: "live",
    density: "compact",
    autoScroll: false,
    searchText: "",
    issueTitle: options.id,
    activeKinds: new Set<string>(),
    newEventCount: 0,
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
    const fresh = state.mode === "live" ? await deps.loadLiveLogs(options.id) : await deps.loadArchiveLogs(options.id);
    state.issueTitle = fresh.title.trim() || options.id;
    buffer.clear();
    buffer.load(fresh.events);
    resetNewEvents();
    rerender({ animate: true });
  }

  async function reconcile(): Promise<void> {
    const fresh = state.mode === "live" ? await deps.loadLiveLogs(options.id) : await deps.loadArchiveLogs(options.id);
    state.issueTitle = fresh.title.trim() || options.id;
    const beforeSize = buffer.size();
    buffer.load(fresh.events);
    if (buffer.size() !== beforeSize) {
      rerender();
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
    state.autoScroll = !state.autoScroll;
    if (state.autoScroll) {
      resetNewEvents();
    }
    rerender();
  }

  function toggleExpandAll(): void {
    if (expandedEvents.size > 0) {
      expandedEvents.clear();
    } else {
      for (const event of getVisibleEvents()) {
        if (stringifyPayload(event.content)) {
          expandedEvents.add(rowKey(event));
        }
      }
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
    toggleExpandAll,
    acknowledgeNewEvents,
    switchMode,
    refresh,
  };
}
