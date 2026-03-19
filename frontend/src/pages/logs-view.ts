import { createLogRow } from "../components/log-row";
import { createEmptyState } from "../components/empty-state";
import { registerPageCleanup } from "../utils/page";
import { eventMatchesSearch, eventTypeLabel } from "../utils/events";
import type { RecentEvent } from "../types";
import { loadArchiveLogs, loadLiveLogs } from "./logs-data";

type Mode = "live" | "archive";

function copyEvents(events: RecentEvent[]): Promise<void> {
  return navigator.clipboard.writeText(events.map((event) => `${event.at} ${event.event} ${event.message}`).join("\n"));
}

export function createLogsPage(id: string): HTMLElement {
  const page = document.createElement("div");
  page.className = "page logs-page fade-in";
  const breadcrumb = document.createElement("div");
  breadcrumb.className = "logs-breadcrumb text-secondary";
  const controls = document.createElement("section");
  controls.className = "mc-toolbar logs-control";
  const scroll = document.createElement("section");
  scroll.className = "logs-scroll";
  const indicator = document.createElement("button");
  indicator.type = "button";
  indicator.className = "mc-button mc-button-ghost logs-new-indicator";
  indicator.hidden = true;
  indicator.textContent = "↓ New events";
  indicator.addEventListener("click", () => {
    scroll.scrollTop = scroll.scrollHeight;
    indicator.hidden = true;
  });
  page.append(breadcrumb, controls, scroll, indicator);

  let mode: Mode = "live";
  let typeFilter = "all";
  let searchText = "";
  let expanded = false;
  let autoScroll = true;
  let data: { title: string; issueId: string; events: RecentEvent[] } = { title: "Loading…", issueId: id, events: [] };
  let timer = 0;
  let loading = false;
  const expandedEvents = new Set<string>();
  const typeBar = document.createElement("div");
  typeBar.className = "logs-toolbar-group";
  const loadingBadge = document.createElement("span");
  loadingBadge.className = "mc-badge";

  const search = Object.assign(document.createElement("input"), { className: "mc-input", placeholder: "Search logs" });
  const modeToggle = document.createElement("button");
  modeToggle.type = "button";
  modeToggle.className = "mc-button mc-button-ghost";
  const autoToggle = document.createElement("button");
  autoToggle.type = "button";
  autoToggle.className = "mc-button mc-button-ghost";
  const expandToggle = document.createElement("button");
  expandToggle.type = "button";
  expandToggle.className = "mc-button mc-button-ghost";
  const copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.className = "mc-button mc-button-ghost";
  copyButton.textContent = "Copy visible logs";
  copyButton.addEventListener("click", () => void copyEvents(filtered()));
  controls.append(typeBar, search, modeToggle, autoToggle, expandToggle, copyButton, loadingBadge);

  function filtered(): RecentEvent[] {
    return data.events.filter((event) => {
      const matchesType = typeFilter === "all" || event.event === typeFilter;
      return matchesType && eventMatchesSearch(event, searchText);
    });
  }

  function renderTypeFilters(): void {
    const types = ["all", ...new Set(data.events.map((event) => event.event))];
    typeBar.replaceChildren(
      ...types.map((value) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `mc-chip${typeFilter === value ? " is-active" : ""}`;
        button.textContent = value === "all" ? "All events" : eventTypeLabel(value);
        button.addEventListener("click", () => {
          typeFilter = value;
          renderTypeFilters();
          render();
        });
        return button;
      }),
    );
  }

  function render(): void {
    breadcrumb.textContent = `Queue → ${data.issueId} → Logs`;
    modeToggle.textContent = mode === "live" ? "Live" : "Archive";
    autoToggle.textContent = autoScroll ? "Auto-scroll on" : "Auto-scroll off";
    expandToggle.textContent = expanded ? "Collapse payloads" : "Expand payloads";
    loadingBadge.textContent = loading ? "Refreshing…" : mode === "live" ? "Live" : "Archive";
    renderTypeFilters();
    const events = filtered();
    if (events.length === 0) {
      scroll.replaceChildren(
        createEmptyState(
          mode === "live" ? "Waiting for agent activity" : "No archived events recorded",
          mode === "live"
            ? "Live issue detail has not emitted timeline events yet."
            : "Archived attempt data does not include any event rows.",
        ),
      );
      return;
    }
    scroll.replaceChildren(
      ...events.map((event, index) => {
        const key = `${event.at}:${event.event}:${event.message}`;
        const row = createLogRow({
          event,
          expanded: expanded || expandedEvents.has(key),
          highlightedText: searchText,
          onToggle: () => {
            if (expandedEvents.has(key)) expandedEvents.delete(key);
            else expandedEvents.add(key);
            render();
          },
        });
        row.classList.add("timeline-enter");
        row.style.setProperty("--stagger-index", String(index));
        return row;
      }),
    );
    if (autoScroll) {
      scroll.scrollTop = scroll.scrollHeight;
    }
  }

  async function refresh(): Promise<void> {
    loading = true;
    render();
    data = mode === "live" ? await loadLiveLogs(id) : await loadArchiveLogs(id);
    loading = false;
    render();
  }

  function restartPolling(): void {
    window.clearInterval(timer);
    if (mode === "live") {
      timer = window.setInterval(() => {
        void refresh();
      }, 10_000);
    }
  }

  modeToggle.addEventListener("click", () => {
    mode = mode === "live" ? "archive" : "live";
    restartPolling();
    void refresh();
  });
  autoToggle.addEventListener("click", () => {
    autoScroll = !autoScroll;
    render();
  });
  expandToggle.addEventListener("click", () => {
    expanded = !expanded;
    render();
  });
  search.addEventListener("input", () => {
    searchText = search.value;
    render();
  });
  scroll.addEventListener("scroll", () => {
    const nearBottom = scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 24;
    indicator.hidden = nearBottom || autoScroll;
  });
  void refresh();
  restartPolling();
  registerPageCleanup(page, () => window.clearInterval(timer));
  return page;
}
