import type { RecentEvent } from "../types";
import { eventChip } from "../ui/event-chip";
import { formatCompactTimestamp, formatRelativeTime } from "../utils/format";

export function createEventRow(event: RecentEvent, compact = false): HTMLElement {
  const row = document.createElement("article");
  row.className = `event-row${compact ? " is-compact" : ""}`;

  const meta = document.createElement("div");
  meta.className = "event-row-meta";

  const time = document.createElement("time");
  time.className = "event-row-time text-mono";
  time.dateTime = event.at;
  time.textContent = compact ? formatCompactTimestamp(event.at) : formatRelativeTime(event.at);

  const chip = eventChip(event);

  meta.append(time, chip);

  const message = document.createElement("p");
  message.className = "event-row-message";
  message.textContent = event.message;

  row.append(meta, message);
  return row;
}
