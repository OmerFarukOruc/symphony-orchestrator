import { createLogRow } from "../components/log-row";
import { createEmptyState } from "../components/empty-state";
import { registerPageCleanup } from "../utils/page";
import { eventMatchesSearch, stringifyPayload } from "../utils/events";
import type { RecentEvent } from "../types";
import { loadArchiveLogs, loadLiveLogs, shouldDisplayLogsEvent } from "./logs-data";
import { subscribeIssueLifecycle, subscribeAllEvents, type AgentEventPayload } from "../state/event-source.js";
import { createLogBuffer, type SortDirection } from "../state/log-buffer.js";
import { buildLogFilterBar } from "./logs-filter-bar.js";
import { buildDetailFiltersPanel } from "./logs-detail-panel.js";

type Mode = "live" | "archive";
type Density = "compact" | "comfortable";

function rowKey(event: RecentEvent): string {
  return `${event.at}:${event.event}:${event.message}`;
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

export function createLogsPage(id: string): HTMLElement {
  const page = document.createElement("div");
  page.className = "page logs-page fade-in";

  // ── Header: breadcrumb + mode tabs ───────────────────────────────────────
  const header = document.createElement("section");
  header.className = "mc-strip logs-header";

  const headerCopy = document.createElement("div");
  headerCopy.className = "logs-header-copy";

  const breadcrumb = document.createElement("p");
  breadcrumb.className = "logs-breadcrumb issue-identifier";

  const title = document.createElement("h1");
  title.className = "page-title logs-title";

  const subtitle = document.createElement("p");
  subtitle.className = "page-subtitle logs-subtitle";

  const modeSegment = document.createElement("div");
  modeSegment.className = "mc-button-segment";
  const liveBtn = document.createElement("button");
  liveBtn.type = "button";
  liveBtn.className = "mc-button is-sm logs-live-btn";
  liveBtn.textContent = "Live";
  const archiveBtn = document.createElement("button");
  archiveBtn.type = "button";
  archiveBtn.className = "mc-button is-sm";
  archiveBtn.textContent = "History";
  modeSegment.append(liveBtn, archiveBtn);

  const headerActions = document.createElement("div");
  headerActions.className = "logs-header-actions";
  headerActions.append(modeSegment);

  headerCopy.append(breadcrumb, title, subtitle);
  header.append(headerCopy, headerActions);

  // ── Log scroll area ───────────────────────────────────────────────────────
  const scroll = document.createElement("section");
  scroll.className = "logs-scroll";

  const indicator = document.createElement("button");
  indicator.type = "button";
  indicator.className = "mc-button is-ghost logs-new-indicator";
  indicator.hidden = true;
  indicator.textContent = "↓ New events";

  // ── State ─────────────────────────────────────────────────────────────────
  let mode: Mode = "live";
  const activeKinds = new Set<string>();
  let searchText = "";
  let autoScroll = false;
  let density: Density = "compact";
  let issueTitle = id;
  let timer = 0;
  let unsubscribeLifecycle: (() => void) | null = null;
  const expandedEvents = new Set<string>();
  let newEventCount = 0;
  const buffer = createLogBuffer("desc");
  let unsubscribeStream: (() => void) | null = null;

  function eventPassesFilters(event: RecentEvent): boolean {
    const matchesKind = activeKinds.size === 0 || activeKinds.has(event.event);
    return matchesKind && eventMatchesSearch(event, searchText);
  }

  function filtered(): RecentEvent[] {
    return buffer.events().filter((event) => eventPassesFilters(event));
  }

  // ── Detail panel ──────────────────────────────────────────────────────────
  const detailPanel = buildDetailFiltersPanel({
    activeKinds,
    getEvents: () => buffer.events(),
    onClearAll: () => {
      activeKinds.clear();
      render();
    },
    onToggleKind: (kind) => {
      if (activeKinds.has(kind)) activeKinds.delete(kind);
      else activeKinds.add(kind);
      render();
    },
  });

  // ── Filter bar ────────────────────────────────────────────────────────────
  const filterBar = buildLogFilterBar({
    activeKinds,
    onFilterChange: () => render(),
    onSortToggle: (newDir: SortDirection) => {
      buffer.setDirection(newDir);
      render();
    },
    onDensityToggle: () => {
      density = density === "compact" ? "comfortable" : "compact";
      render();
    },
    onAutoScrollToggle: () => {
      autoScroll = !autoScroll;
      render();
    },
    onExpandToggle: () => {
      if (expandedEvents.size > 0) {
        expandedEvents.clear();
      } else {
        for (const event of filtered()) {
          if (stringifyPayload(event.content)) {
            expandedEvents.add(rowKey(event));
          }
        }
      }
      render();
    },
    onCopyAll: () => {
      const events = filtered();
      if (events.length === 0) return;
      const lines = events.map((event) => {
        const payload = stringifyPayload(event.content);
        const header = `[${event.at}] [${event.event}] ${event.message}`;
        return payload ? `${header}\n${payload}` : header;
      });
      const text = lines.join("\n\n");
      navigator.clipboard?.writeText(text).then(
        () => {
          const label = filterBar.copyAllBtn.querySelector(".logs-view-action-label");
          if (label) label.textContent = "Copied";
          setTimeout(() => {
            if (label) label.textContent = "Copy";
          }, 1200);
        },
        () => undefined,
      );
    },
    onOpenDetailPanel: () => {
      detailPanel.open();
      syncEscapeListener();
    },
    onCloseDetailPanel: () => {
      detailPanel.close();
      syncEscapeListener();
    },
    getSortDirection: () => buffer.direction(),
    getEvents: () => buffer.events(),
  });

  filterBar.detailPanelSlot.append(detailPanel.element);

  filterBar.search.addEventListener("input", () => {
    searchText = filterBar.search.value;
  });

  function syncEscapeListener(): void {
    const shouldListen = filterBar.isDetailPanelOpen();
    document.removeEventListener("keydown", handleEscape);
    if (shouldListen) {
      document.addEventListener("keydown", handleEscape);
    }
  }

  function handleEscape(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      if (filterBar.isDetailPanelOpen()) {
        filterBar.closeDetailPanel();
        syncEscapeListener();
        filterBar.detailFiltersBtn.focus();
      }
    }
  }

  page.append(header, filterBar.element, scroll, indicator);

  function buildHeaderSummary(visibleCount: number, totalCount: number): string {
    const summary: string[] = [mode === "live" ? "Live stream" : "History"];
    if (totalCount === 0) {
      summary.push(mode === "live" ? "Waiting for activity" : "No archived events");
    } else if (visibleCount === totalCount) {
      summary.push(`${totalCount} ${pluralize(totalCount, "event")}`);
    } else {
      summary.push(`${visibleCount} of ${totalCount} ${pluralize(totalCount, "event")}`);
    }
    if (activeKinds.size > 0) {
      summary.push(`${activeKinds.size} ${pluralize(activeKinds.size, "kind")} filtered`);
    }
    if (searchText.trim()) {
      summary.push(`Search: "${searchText.trim()}"`);
    }
    if (buffer.direction() === "asc") {
      summary.push("Oldest first");
    }
    if (autoScroll) {
      summary.push("Following");
    }
    return summary.join(" · ");
  }

  // ── Row building ──────────────────────────────────────────────────────────
  function buildRow(event: RecentEvent): HTMLElement {
    const key = rowKey(event);
    return createLogRow({
      event,
      expanded: expandedEvents.has(key),
      highlightedText: searchText,
      onToggle: () => {
        if (expandedEvents.has(key)) expandedEvents.delete(key);
        else expandedEvents.add(key);
        render();
      },
    });
  }

  // ── Render ────────────────────────────────────────────────────────────────
  function render(options: { animate?: boolean } = {}): void {
    const animate = options.animate ?? false;
    const events = filtered();
    const totalEvents = buffer.events().length;
    breadcrumb.textContent = `Queue · ${id}`;
    title.textContent = issueTitle && issueTitle !== id ? issueTitle : `${id} logs`;
    subtitle.textContent = buildHeaderSummary(events.length, totalEvents);
    liveBtn.classList.toggle("is-active", mode === "live");
    archiveBtn.classList.toggle("is-active", mode === "archive");
    liveBtn.setAttribute("aria-pressed", String(mode === "live"));
    archiveBtn.setAttribute("aria-pressed", String(mode === "archive"));
    scroll.classList.toggle("is-compact", density === "compact");
    scroll.classList.toggle("is-comfortable", density === "comfortable");
    filterBar.renderCategoryChips();
    filterBar.updateDetailFiltersBadge();
    filterBar.syncViewActions({
      autoScroll,
      density,
      expandedCount: expandedEvents.size,
      sortDirection: buffer.direction(),
    });
    if (!detailPanel.element.hidden) detailPanel.render();

    if (events.length === 0) {
      scroll.replaceChildren(
        createEmptyState(
          mode === "live" ? "No activity yet" : "No archived events found",
          mode === "live"
            ? "Log entries will stream in once the worker starts processing this issue."
            : "No events match the current view. Switch to live mode to follow the active stream.",
          mode === "live" ? "Refresh logs" : "Switch to live logs",
          () => {
            if (mode === "live") {
              void refresh();
              return;
            }
            mode = "live";
            render();
            restartPolling();
            void refresh();
          },
        ),
      );
      return;
    }

    const total = events.length;
    const isDesc = buffer.direction() === "desc";
    scroll.replaceChildren(
      ...events.map((event, index) => {
        const row = buildRow(event);
        if (animate) {
          const staggerPos = isDesc ? index : index - (total - 30);
          if (staggerPos >= 0 && staggerPos < 30) {
            row.classList.add("timeline-enter");
            row.style.setProperty("--stagger-index", String(staggerPos));
          }
        }
        return row;
      }),
    );
    if (autoScroll) {
      scroll.scrollTop = buffer.direction() === "desc" ? 0 : scroll.scrollHeight;
    }
  }

  // ── Data loading ──────────────────────────────────────────────────────────
  async function refresh(): Promise<void> {
    const fresh = mode === "live" ? await loadLiveLogs(id) : await loadArchiveLogs(id);
    issueTitle = fresh.title.trim() || id;
    buffer.clear();
    buffer.load(fresh.events);
    render({ animate: true });
  }

  /** Count how many visible (filtered) events precede `target` in the buffer. */
  function domInsertIndex(target: RecentEvent): number {
    let index = 0;
    for (const e of buffer.events()) {
      if (e === target) break;
      if (eventPassesFilters(e)) index++;
    }
    return index;
  }

  function appendSingleEvent(event: RecentEvent): void {
    if (!eventPassesFilters(event)) return;
    scroll.querySelector(".mc-empty-state")?.remove();
    const row = buildRow(event);
    row.classList.add("timeline-enter");
    const refNode = scroll.children[domInsertIndex(event)] as Element | undefined;
    if (refNode) refNode.before(row);
    else scroll.appendChild(row);
    if (autoScroll) {
      scroll.scrollTop = buffer.direction() === "desc" ? 0 : scroll.scrollHeight;
    } else {
      newEventCount++;
      const arrow = buffer.direction() === "desc" ? "\u2191" : "\u2193";
      indicator.textContent = `${arrow} ${newEventCount} new`;
      indicator.hidden = false;
    }
  }

  async function reconcile(): Promise<void> {
    const fresh = mode === "live" ? await loadLiveLogs(id) : await loadArchiveLogs(id);
    issueTitle = fresh.title.trim() || id;
    const beforeSize = buffer.size();
    buffer.load(fresh.events);
    if (buffer.size() !== beforeSize) {
      render();
    }
  }

  // ── SSE / polling ─────────────────────────────────────────────────────────
  function restartPolling(): void {
    window.clearInterval(timer);
    unsubscribeLifecycle?.();
    unsubscribeStream?.();
    unsubscribeLifecycle = null;
    unsubscribeStream = null;
    if (mode === "live") {
      unsubscribeStream = subscribeAllEvents(id, (sseEvent) => {
        if (sseEvent.type === "agent.event") {
          const p = sseEvent.payload as unknown as AgentEventPayload;
          const recentEvent: RecentEvent = {
            at: p.timestamp ?? new Date().toISOString(),
            issue_id: p.issueId ?? "",
            issue_identifier: p.identifier ?? "",
            session_id: p.sessionId ?? null,
            event: p.type ?? "",
            message: p.message ?? "",
            content: p.content ?? null,
          };
          if (!shouldDisplayLogsEvent(recentEvent)) {
            return;
          }
          if (buffer.insert(recentEvent)) {
            appendSingleEvent(recentEvent);
          }
        }
      });
      unsubscribeLifecycle = subscribeIssueLifecycle(id, () => void reconcile());
      timer = window.setInterval(() => void reconcile(), 30_000);
    }
  }

  // ── Mode button wiring ────────────────────────────────────────────────────
  liveBtn.addEventListener("click", () => {
    if (mode === "live") return;
    mode = "live";
    render();
    restartPolling();
    void refresh();
  });
  archiveBtn.addEventListener("click", () => {
    if (mode === "archive") return;
    mode = "archive";
    render();
    restartPolling();
    void refresh();
  });

  // ── Scroll / indicator wiring ─────────────────────────────────────────────
  indicator.addEventListener("click", () => {
    scroll.scrollTop = buffer.direction() === "desc" ? 0 : scroll.scrollHeight;
    newEventCount = 0;
    indicator.hidden = true;
  });

  scroll.addEventListener("scroll", () => {
    const isDesc = buffer.direction() === "desc";
    const nearEdge = isDesc
      ? scroll.scrollTop <= 24
      : scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 24;
    indicator.hidden = nearEdge || autoScroll;
    if (nearEdge) {
      newEventCount = 0;
      const arrow = isDesc ? "\u2191" : "\u2193";
      indicator.textContent = `${arrow} New events`;
    }
  });

  // Make the shell outlet non-scrolling so logs-scroll is the true scroll boundary
  const outlet = document.querySelector(".shell-outlet") as HTMLElement | null;
  if (outlet) {
    const prev = outlet.style.overflowY;
    outlet.style.overflowY = "hidden";
    registerPageCleanup(page, () => {
      outlet.style.overflowY = prev;
    });
  }

  void refresh();
  restartPolling();
  registerPageCleanup(page, () => {
    window.clearInterval(timer);
    unsubscribeLifecycle?.();
    unsubscribeStream?.();
    filterBar.closeDetailPanel();
    detailPanel.close();
    syncEscapeListener();
  });
  return page;
}
