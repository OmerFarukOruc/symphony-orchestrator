import type { StallEventView } from "../types.js";
import { formatRelativeTime } from "../utils/format.js";

function formatStalledDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function createStallRow(event: StallEventView): HTMLElement {
  const row = document.createElement("article");
  row.className = "stall-event-row";

  const meta = document.createElement("div");
  meta.className = "stall-event-meta";

  const issueId = document.createElement("strong");
  issueId.className = "text-mono stall-event-issue";
  issueId.textContent = event.issue_identifier;

  const duration = document.createElement("span");
  duration.className = "stall-event-duration mc-badge mc-badge-warn";
  duration.textContent = `silent ${formatStalledDuration(event.silent_ms)}`;

  meta.append(issueId, duration);

  const detail = document.createElement("div");
  detail.className = "stall-event-detail";

  const timeoutEl = document.createElement("span");
  timeoutEl.className = "stall-event-agent text-mono";
  timeoutEl.textContent = `timeout ${formatStalledDuration(event.timeout_ms)}`;

  const killedAtEl = document.createElement("time");
  killedAtEl.className = "stall-event-killed-at";
  killedAtEl.dateTime = event.at;
  killedAtEl.textContent = formatRelativeTime(event.at);
  killedAtEl.title = event.at;

  detail.append(timeoutEl, killedAtEl);
  row.append(meta, detail);
  return row;
}

/**
 * Creates a stall events section showing recent stalled agent kills.
 * Returns an element + an update function for live re-renders.
 */
export function createStallEventsTable(): {
  root: HTMLElement;
  update: (events: StallEventView[] | undefined) => void;
} {
  const root = document.createElement("div");
  root.className = "stall-events-list";

  const empty = document.createElement("p");
  empty.className = "stall-events-empty";
  empty.textContent = "No stall events.";
  root.append(empty);

  function update(events: StallEventView[] | undefined): void {
    if (!events || events.length === 0) {
      root.replaceChildren(empty);
      return;
    }

    // Show most recent 10 stall events
    const rows = events
      .slice(-10)
      .reverse()
      .map((e) => createStallRow(e));
    root.replaceChildren(...rows);
  }

  return { root, update };
}
