import { createLogRow } from "../components/log-row";
import { createEmptyState } from "../components/empty-state";
import { registerPageCleanup } from "../utils/page";
import { buildLogFilterBar } from "./logs-filter-bar.js";
import { buildDetailFiltersPanel } from "./logs-detail-panel.js";
import { createLogsTimeline, type LogsAppendEvent, type LogsRenderOptions } from "../features/logs/logs-timeline.js";
import type { RecentEvent } from "../types/runtime.js";

export function createLogsPage(id: string): HTMLElement {
  const page = document.createElement("div");
  page.className = "page logs-page fade-in";

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

  const scroll = document.createElement("section");
  scroll.className = "logs-scroll";

  const indicator = document.createElement("button");
  indicator.type = "button";
  indicator.className = "mc-button is-ghost logs-new-indicator";
  indicator.hidden = true;
  indicator.textContent = "↓ New events";

  function renderRow(event: RecentEvent): HTMLElement {
    return createLogRow({
      event,
      expanded: timeline.isExpanded(event),
      highlightedText: timeline.state.searchText,
      onToggle: () => timeline.toggleExpanded(event),
    });
  }

  function syncChrome(): void {
    const state = timeline.state;
    breadcrumb.textContent = `Queue · ${id}`;
    title.textContent = state.issueTitle && state.issueTitle !== id ? state.issueTitle : `${id} logs`;
    subtitle.textContent = timeline.getHeaderSummary();
    liveBtn.classList.toggle("is-active", state.mode === "live");
    archiveBtn.classList.toggle("is-active", state.mode === "archive");
    liveBtn.setAttribute("aria-pressed", String(state.mode === "live"));
    archiveBtn.setAttribute("aria-pressed", String(state.mode === "archive"));
    scroll.classList.toggle("is-compact", state.density === "compact");
    scroll.classList.toggle("is-comfortable", state.density === "comfortable");
    filterBar.renderCategoryChips();
    filterBar.updateDetailFiltersBadge();
    filterBar.syncViewActions({
      autoScroll: state.autoScroll,
      density: state.density,
      expandedCount: timeline.getExpandedCount(),
      sortDirection: timeline.getSortDirection(),
    });
    if (!detailPanel.element.hidden) {
      detailPanel.render();
    }

    indicator.textContent = timeline.getIndicatorLabel();
    indicator.hidden = state.autoScroll || state.newEventCount === 0;
  }

  function appendEventRow(appendEvent: LogsAppendEvent): void {
    const row = renderRow(appendEvent.event);
    row.classList.add("timeline-enter");
    const refNode = scroll.children[appendEvent.index] as Element | undefined;
    scroll.querySelector(".mc-empty-state")?.remove();
    if (refNode) {
      refNode.before(row);
    } else {
      scroll.appendChild(row);
    }
    if (timeline.state.autoScroll) {
      scroll.scrollTop = timeline.getSortDirection() === "desc" ? 0 : scroll.scrollHeight;
    }
  }

  function render(renderOptions: LogsRenderOptions = {}): void {
    const animate = renderOptions.animate ?? false;
    const appendEvent = renderOptions.appendEvent;
    const events = timeline.getVisibleEvents();
    const state = timeline.state;

    syncChrome();

    if (events.length === 0) {
      scroll.replaceChildren(
        createEmptyState(
          state.mode === "live" ? "No activity yet" : "No archived events found",
          state.mode === "live"
            ? "Log entries will stream in once the worker starts processing this issue."
            : "No events match the current view. Switch to live mode to follow the active stream.",
          state.mode === "live" ? "Refresh logs" : "Switch to live logs",
          () => {
            if (state.mode === "live") {
              void timeline.refresh();
              return;
            }
            timeline.switchMode("live");
          },
        ),
      );
      return;
    }

    if (appendEvent) {
      appendEventRow(appendEvent);
      return;
    }

    const total = events.length;
    const isDesc = timeline.getSortDirection() === "desc";
    scroll.replaceChildren(
      ...events.map((event, index) => {
        const row = renderRow(event);
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
    if (state.autoScroll) {
      scroll.scrollTop = timeline.getSortDirection() === "desc" ? 0 : scroll.scrollHeight;
    }
  }

  const timeline = createLogsTimeline({ id, rerender: render });

  const detailPanel = buildDetailFiltersPanel({
    activeKinds: timeline.state.activeKinds,
    getEvents: () => timeline.getAllEvents(),
    onClearAll: () => timeline.clearAllFilters(),
    onToggleKind: (kind) => timeline.toggleKind(kind),
  });

  const filterBar = buildLogFilterBar({
    activeKinds: timeline.state.activeKinds,
    onClearCategories: () => timeline.clearAllFilters(),
    onToggleCategoryKinds: (kinds) => timeline.toggleCategoryKinds(kinds),
    onSearchChange: (value) => timeline.setSearchText(value),
    onSortToggle: (newDir) => timeline.setSortDirection(newDir),
    onDensityToggle: () => timeline.toggleDensity(),
    onAutoScrollToggle: () => timeline.toggleAutoScroll(),
    onExpandToggle: () => timeline.toggleExpandAll(),
    onCopyAll: () => {
      const text = timeline.getCopyText();
      if (!text) {
        return;
      }
      navigator.clipboard?.writeText(text).then(
        () => {
          const label = filterBar.copyAllBtn.querySelector(".logs-view-action-label");
          if (label) {
            label.textContent = "Copied";
          }
          setTimeout(() => {
            if (label) {
              label.textContent = "Copy";
            }
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
    getSortDirection: () => timeline.getSortDirection(),
    getEvents: () => timeline.getAllEvents(),
  });

  filterBar.detailPanelSlot.append(detailPanel.element);

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

  liveBtn.addEventListener("click", () => timeline.switchMode("live"));
  archiveBtn.addEventListener("click", () => timeline.switchMode("archive"));

  indicator.addEventListener("click", () => {
    scroll.scrollTop = timeline.getSortDirection() === "desc" ? 0 : scroll.scrollHeight;
    timeline.acknowledgeNewEvents();
  });

  scroll.addEventListener("scroll", () => {
    const isDesc = timeline.getSortDirection() === "desc";
    const nearEdge = isDesc
      ? scroll.scrollTop <= 24
      : scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 24;
    if (nearEdge) {
      timeline.acknowledgeNewEvents();
    }
  });

  const outlet = document.querySelector(".shell-outlet") as HTMLElement | null;
  if (outlet) {
    const prev = outlet.style.overflowY;
    outlet.style.overflowY = "hidden";
    registerPageCleanup(page, () => {
      outlet.style.overflowY = prev;
    });
  }

  timeline.initialize();
  registerPageCleanup(page, () => {
    timeline.dispose();
    filterBar.closeDetailPanel();
    detailPanel.close();
    syncEscapeListener();
  });
  return page;
}
