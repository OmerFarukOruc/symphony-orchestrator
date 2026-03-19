import type { RecentEvent } from "../types";
import { classifyEvent, eventTypeLabel } from "../utils/events";
import { formatRelativeTime, formatShortTime } from "../utils/format";

export function createEventRow(event: RecentEvent, compact = false): HTMLElement {
  const row = document.createElement("article");
  row.className = `event-row${compact ? " is-compact" : ""}`;

  const meta = document.createElement("div");
  meta.className = "event-row-meta";

  const time = document.createElement("time");
  time.className = "event-row-time text-mono";
  time.dateTime = event.at;
  time.textContent = compact ? formatShortTime(event.at) : formatRelativeTime(event.at);

  const chip = document.createElement("span");
  chip.className = `event-chip event-chip-${classifyEvent(event)}`;
  chip.textContent = eventTypeLabel(event.event);

  meta.append(time, chip);

  const message = document.createElement("p");
  message.className = "event-row-message";
  message.textContent = event.message;

  row.append(meta, message);
  return row;
}
