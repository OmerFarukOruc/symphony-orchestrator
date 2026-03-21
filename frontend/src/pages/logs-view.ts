import { createLogRow } from "../components/log-row";
import { createEmptyState } from "../components/empty-state";
import { registerPageCleanup } from "../utils/page";
import { eventMatchesSearch, eventTypeLabel } from "../utils/events";
import type { RecentEvent } from "../types";
import { loadArchiveLogs, loadLiveLogs } from "./logs-data";
import { createIcon } from "../ui/icons";
import { stringifyPayload } from "../utils/events";

type Mode = "live" | "archive";
type Density = "compact" | "comfortable";

function copyEvents(events: RecentEvent[]): Promise<void> {
  return navigator.clipboard.writeText(events.map((event) => `${event.at} ${event.event} ${event.message}`).join("\n"));
}

function makeIconBtn(iconName: Parameters<typeof createIcon>[0], label: string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "mc-button mc-button-ghost is-icon-only logs-icon-btn";
  btn.title = label;
  btn.setAttribute("aria-label", label);
  btn.appendChild(createIcon(iconName, { size: 15 }));
  return btn;
}

export function createLogsPage(id: string): HTMLElement {
  const page = document.createElement("div");
  page.className = "page logs-page fade-in";

  // ── Header: breadcrumb + mode tabs ───────────────────────────────────────
  const header = document.createElement("div");
  header.className = "logs-header";

  const breadcrumb = document.createElement("div");
  breadcrumb.className = "logs-breadcrumb text-secondary";

  const modeSegment = document.createElement("div");
  modeSegment.className = "mc-button-segment";
  const liveBtn = document.createElement("button");
  liveBtn.type = "button";
  liveBtn.className = "mc-button is-sm logs-live-btn";
  liveBtn.textContent = "Live";
  const archiveBtn = document.createElement("button");
  archiveBtn.type = "button";
  archiveBtn.className = "mc-button is-sm";
  archiveBtn.textContent = "Archive";
  modeSegment.append(liveBtn, archiveBtn);
  header.append(breadcrumb, modeSegment);

  // ── Filter bar: type chips + search + view icon buttons ──────────────────
  const controls = document.createElement("section");
  controls.className = "logs-control";

  const typeBar = document.createElement("div");
  typeBar.className = "logs-toolbar-group";
  const search = Object.assign(document.createElement("input"), {
    className: "mc-input logs-search",
    placeholder: "Search logs",
  });

  const autoToggle = makeIconBtn("scrollDown", "Auto-scroll to bottom");
  const expandToggle = makeIconBtn("unfold", "Expand payloads");
  const densityToggle = makeIconBtn("dense", "Compact mode");
  const copyButton = makeIconBtn("copy", "Copy visible logs");
  copyButton.addEventListener("click", () => {
    void copyEvents(filtered()).then(() => {
      copyButton.title = "Copied!";
      copyButton.setAttribute("aria-label", "Copied!");
      setTimeout(() => {
        copyButton.title = "Copy visible logs";
        copyButton.setAttribute("aria-label", "Copy visible logs");
      }, 1500);
    });
  });

  const viewActions = document.createElement("div");
  viewActions.className = "logs-view-actions";
  viewActions.append(densityToggle, autoToggle, expandToggle, copyButton);
  controls.append(typeBar, search, viewActions);

  // ── Log scroll area ───────────────────────────────────────────────────────
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

  page.append(header, controls, scroll, indicator);

  // ── State ─────────────────────────────────────────────────────────────────
  let mode: Mode = "live";
  let typeFilter = "all";
  let searchText = "";
  let autoScroll = false;
  let density: Density = "compact";
  let data: { title: string; issueId: string; events: RecentEvent[] } = { title: "Loading…", issueId: id, events: [] };
  let timer = 0;
  const expandedEvents = new Set<string>();

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
        button.className = `mc-chip is-interactive${typeFilter === value ? " is-active" : ""}`;
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
    liveBtn.classList.toggle("is-active", mode === "live");
    archiveBtn.classList.toggle("is-active", mode === "archive");
    autoToggle.classList.toggle("is-active", autoScroll);
    densityToggle.classList.toggle("is-active", density === "compact");
    expandToggle.classList.toggle("is-active", expandedEvents.size > 0);
    scroll.classList.toggle("is-compact", density === "compact");
    scroll.classList.toggle("is-comfortable", density === "comfortable");
    renderTypeFilters();
    const events = filtered();
    if (events.length === 0) {
      scroll.replaceChildren(
        createEmptyState(
          mode === "live" ? "Waiting for agent activity" : "No archived events recorded",
          mode === "live"
            ? "Live issue detail has not emitted timeline events yet. Stay here while the worker starts or refresh to check again."
            : "Archived attempt data does not include any event rows. Switch back to live mode to watch the current stream.",
          mode === "live" ? "Refresh logs" : "Switch to live logs",
          () => {
            if (mode === "live") {
              void refresh(true);
              return;
            }
            mode = "live";
            render();
            restartPolling();
            void refresh(true);
          },
        ),
      );
      return;
    }
    const total = events.length;
    scroll.replaceChildren(
      ...events.map((event, index) => {
        const key = `${event.at}:${event.event}:${event.message}`;
        const row = createLogRow({
          event,
          expanded: expandedEvents.has(key),
          highlightedText: searchText,
          onToggle: () => {
            if (expandedEvents.has(key)) expandedEvents.delete(key);
            else expandedEvents.add(key);
            render();
          },
        });
        // Only animate the last 30 rows (most recent, visible after auto-scroll).
        // With 24ms stagger a raw index on 1000+ events → multi-second delays.
        const staggerPos = index - (total - 30);
        if (staggerPos >= 0) {
          row.classList.add("timeline-enter");
          row.style.setProperty("--stagger-index", String(staggerPos));
        }
        return row;
      }),
    );
    if (autoScroll) {
      scroll.scrollTop = scroll.scrollHeight;
    }
  }

  async function refresh(force = false): Promise<void> {
    const prevLength = data.events.length;
    const prevLastAt = data.events.at(-1)?.at;
    data = mode === "live" ? await loadLiveLogs(id) : await loadArchiveLogs(id);
    if (force || data.events.length !== prevLength || data.events.at(-1)?.at !== prevLastAt) {
      render();
    }
  }

  function restartPolling(): void {
    window.clearInterval(timer);
    if (mode === "live") {
      timer = window.setInterval(() => {
        void refresh();
      }, 10_000);
    }
  }

  liveBtn.addEventListener("click", () => {
    if (mode === "live") return;
    mode = "live";
    render();
    restartPolling();
    void refresh(true);
  });
  archiveBtn.addEventListener("click", () => {
    if (mode === "archive") return;
    mode = "archive";
    render();
    restartPolling();
    void refresh(true);
  });
  autoToggle.addEventListener("click", () => {
    autoScroll = !autoScroll;
    render();
  });
  densityToggle.addEventListener("click", () => {
    density = density === "compact" ? "comfortable" : "compact";
    render();
  });
  expandToggle.addEventListener("click", () => {
    if (expandedEvents.size > 0) {
      expandedEvents.clear();
    } else {
      for (const event of filtered()) {
        if (stringifyPayload(event.content)) {
          expandedEvents.add(`${event.at}:${event.event}:${event.message}`);
        }
      }
    }
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
  registerPageCleanup(page, () => window.clearInterval(timer));
  return page;
}
