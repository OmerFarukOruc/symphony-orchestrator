import { createLogRow } from "../components/log-row";
import { createEmptyState } from "../components/empty-state";
import { registerPageCleanup } from "../utils/page";
import { buildLogFilterBar } from "./logs-filter-bar.js";
import { buildDetailFiltersPanel } from "./logs-detail-panel.js";
import { createLogsTimeline, type LogsAppendEvent, type LogsRenderOptions } from "../features/logs/logs-timeline.js";
import { resolveInitialLogsMode } from "./logs-route.js";
import { createLogsTopBar } from "../components/logs-top-bar.js";
import { createLogsTurnBlock } from "../components/logs-turn-block.js";
import { createLogsPreambleBlock } from "../components/logs-preamble-block.js";
import type { RenderedTimeline } from "../features/logs/logs-reducer.js";
import type { RecentEvent } from "../types/runtime.js";

const SKELETON_ROW_COUNT = 4;
const SCROLL_EDGE_THRESHOLD_PX = 24;

export function createLogsPage(id: string): HTMLElement {
  const page = document.createElement("div");
  page.className = "page logs-page fade-in";

  const topBar = createLogsTopBar();

  const layout = document.createElement("div");
  layout.className = "logs-layout";

  const main = document.createElement("div");
  main.className = "logs-main";

  const scroll = document.createElement("section");
  scroll.className = "logs-scroll";
  main.append(scroll);

  layout.append(main);

  // Indicator: the arrow glyph is decorative and must be hidden from screen
  // readers; only the textual label (e.g. "5 new", "New events") should be
  // announced. aria-live lets users following logs via AT hear that new events
  // arrived without having to leave the content area.
  const indicator = document.createElement("button");
  indicator.type = "button";
  indicator.className = "mc-button is-ghost logs-new-indicator";
  indicator.hidden = true;
  indicator.setAttribute("aria-live", "polite");
  const indicatorArrow = document.createElement("span");
  indicatorArrow.className = "logs-indicator-arrow";
  indicatorArrow.setAttribute("aria-hidden", "true");
  const indicatorText = document.createElement("span");
  indicatorText.className = "logs-indicator-text";
  indicator.append(indicatorArrow, indicatorText);

  const resumeFollow = document.createElement("button");
  resumeFollow.type = "button";
  resumeFollow.className = "mc-button is-ghost logs-resume-follow";
  resumeFollow.hidden = true;
  resumeFollow.setAttribute("aria-label", "Resume follow");
  const resumeFollowArrow = document.createElement("span");
  resumeFollowArrow.className = "logs-indicator-arrow";
  resumeFollowArrow.setAttribute("aria-hidden", "true");
  resumeFollowArrow.textContent = "\u2193";
  const resumeFollowText = document.createElement("span");
  resumeFollowText.textContent = "Resume follow";
  resumeFollow.append(resumeFollowArrow, resumeFollowText);

  function renderRow(event: RecentEvent): HTMLElement {
    return createLogRow({
      event,
      expanded: timeline.isExpanded(event),
      highlightedText: timeline.state.searchText,
      onToggle: () => timeline.toggleExpanded(event),
    });
  }

  function syncChrome(rendered: RenderedTimeline): void {
    const state = timeline.state;
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

    // getIndicatorLabel() returns "<arrow> <text>" — split so the arrow glyph
    // can be marked aria-hidden and only the text portion is announced.
    const rawLabel = timeline.getIndicatorLabel();
    const spaceIndex = rawLabel.indexOf(" ");
    if (spaceIndex > 0) {
      indicatorArrow.textContent = rawLabel.slice(0, spaceIndex);
      indicatorText.textContent = rawLabel.slice(spaceIndex + 1);
    } else {
      indicatorArrow.textContent = "";
      indicatorText.textContent = rawLabel;
    }
    indicator.setAttribute("aria-label", indicatorText.textContent ?? "New events");
    indicator.hidden = state.autoScroll || state.newEventCount === 0;
    resumeFollow.hidden = state.autoScroll || state.mode !== "live";

    topBar.update({
      issueId: id,
      issueView: state.issueView,
      title: state.issueTitle,
      timeline: rendered,
      mode: state.mode,
    });
  }

  function renderSkeleton(): void {
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < SKELETON_ROW_COUNT; i += 1) {
      const row = document.createElement("div");
      row.className = "mc-logs-skeleton-row";
      row.style.setProperty("--stagger-index", String(i));
      for (let j = 0; j < 3; j += 1) {
        const block = document.createElement("span");
        block.className = "mc-logs-skeleton-block";
        row.append(block);
      }
      fragment.append(row);
    }
    scroll.replaceChildren(fragment);
  }

  function renderError(error: string): void {
    const alert = document.createElement("div");
    alert.className = "mc-logs-error";
    alert.setAttribute("role", "alert");

    const heading = document.createElement("h2");
    heading.className = "mc-logs-error-title";
    heading.textContent = "Couldn't load logs";

    const body = document.createElement("p");
    body.className = "mc-logs-error-body";
    body.textContent = error;

    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "mc-button is-sm";
    retry.textContent = "Retry";
    retry.addEventListener("click", () => {
      void timeline.refresh();
    });

    alert.append(heading, body, retry);
    scroll.replaceChildren(alert);
  }

  function appendEventRow(appendEvent: LogsAppendEvent): void {
    // When filters are active we keep the legacy flat append path; otherwise a
    // lightweight rerender is cheaper than reconstructing the hierarchy per event.
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

  function renderHierarchical(rendered: RenderedTimeline, animate: boolean): void {
    const fragment = document.createDocumentFragment();

    if (rendered.preamble.events.length > 0) {
      // Expanded by default; a user click collapses it and that choice persists
      // across re-renders so SSE events don't re-open the block.
      const preambleExpanded = !timeline.isSectionCollapsed("preamble");
      fragment.append(
        createLogsPreambleBlock(rendered.preamble, {
          expanded: preambleExpanded,
          onToggle: () => timeline.toggleCollapsedSection("preamble"),
        }).element,
      );
    }

    const orderedTurns = [...rendered.turns];
    if (timeline.getSortDirection() === "desc") {
      orderedTurns.reverse();
    }

    const latestTurnId = rendered.turns.at(-1)?.turnId ?? null;
    const sortDir = timeline.getSortDirection();
    for (const turn of orderedTurns) {
      const isActive = turn.turnId === latestTurnId && turn.completedAt === null;
      // Active turn defaults to expanded; completed turns default to collapsed.
      // User clicks toggle `collapsedSections` to override that default, and the
      // override persists across re-renders.
      const turnKey = `turn:${turn.turnId ?? turn.sessionId ?? turn.startedAt}`;
      const userToggled = timeline.isSectionCollapsed(turnKey);
      const defaultCollapsed = !isActive;
      // XOR: user toggle inverts the default state.
      const collapsed = defaultCollapsed !== userToggled;
      const block = createLogsTurnBlock(turn, {
        active: isActive,
        collapsed,
        sortDirection: sortDir,
        onToggle: () => timeline.toggleCollapsedSection(turnKey),
      }).element;
      if (animate) {
        block.classList.add("timeline-enter");
      }
      fragment.append(block);
    }

    if (rendered.preamble.events.length === 0 && rendered.turns.length === 0) {
      const isLive = timeline.state.mode === "live";
      fragment.append(
        createEmptyState(
          isLive ? "No activity yet" : "No archived events found",
          isLive
            ? "Log entries will stream in once the worker starts processing this issue."
            : "This issue has no completed attempts on record.",
          isLive ? "Refresh logs" : "Switch to live logs",
          () => {
            if (isLive) {
              void timeline.refresh();
              return;
            }
            timeline.switchMode("live");
          },
          "events",
        ),
      );
    }

    scroll.replaceChildren(fragment);

    if (timeline.state.autoScroll) {
      scroll.scrollTop = timeline.getSortDirection() === "desc" ? 0 : scroll.scrollHeight;
    }
  }

  function renderFlat(animate: boolean): void {
    const events = timeline.getVisibleEvents();
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
    if (timeline.state.autoScroll) {
      scroll.scrollTop = timeline.getSortDirection() === "desc" ? 0 : scroll.scrollHeight;
    }
  }

  function render(renderOptions: LogsRenderOptions = {}): void {
    const animate = renderOptions.animate ?? false;
    const appendEvent = renderOptions.appendEvent;
    const state = timeline.state;

    // Compute the reduced timeline once per render pass; syncChrome (topBar) and
    // renderHierarchical both need it.
    const rendered = timeline.getTimeline();
    syncChrome(rendered);

    if (state.loading) {
      renderSkeleton();
      return;
    }

    if (state.error) {
      renderError(state.error);
      return;
    }

    const filtersActive = state.activeKinds.size > 0 || state.searchText.trim().length > 0;
    if (filtersActive) {
      if (appendEvent) {
        appendEventRow(appendEvent);
        return;
      }
      renderFlat(animate);
      return;
    }

    renderHierarchical(rendered, animate);
  }

  const initialMode = resolveInitialLogsMode(globalThis.location?.pathname ?? "");
  const timeline = createLogsTimeline({ id, rerender: render, initialMode });

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

  page.append(topBar.element, filterBar.element, layout, indicator, resumeFollow);

  indicator.addEventListener("click", () => {
    scroll.scrollTop = timeline.getSortDirection() === "desc" ? 0 : scroll.scrollHeight;
    timeline.acknowledgeNewEvents();
  });

  resumeFollow.addEventListener("click", () => {
    timeline.setAutoScroll(true);
    scroll.scrollTop = timeline.getSortDirection() === "desc" ? 0 : scroll.scrollHeight;
  });

  scroll.addEventListener("scroll", () => {
    const state = timeline.state;
    const isDesc = timeline.getSortDirection() === "desc";
    const nearEdge = isDesc
      ? scroll.scrollTop <= SCROLL_EDGE_THRESHOLD_PX
      : scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - SCROLL_EDGE_THRESHOLD_PX;
    if (nearEdge) {
      timeline.acknowledgeNewEvents();
      if (state.mode === "live" && !state.autoScroll) {
        timeline.setAutoScroll(true);
      }
      return;
    }
    if (state.mode === "live" && state.autoScroll) {
      timeline.setAutoScroll(false);
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
    topBar.dispose();
    filterBar.closeDetailPanel();
    detailPanel.close();
    syncEscapeListener();
  });
  return page;
}
