import type { RecentEvent } from "../types";
import { createIcon, type IconName } from "../ui/icons";
import { eventChip } from "../ui/event-chip";
import { classifyEvent } from "../utils/events";
import { formatCompactTimestamp, formatRelativeTime } from "../utils/format";

const EVENT_CLASS_ICONS: Record<string, IconName> = {
  error: "eventAlert",
  "state-change": "eventConfig",
  agent: "eventPlay",
  tool: "eventPlay",
  system: "eventConfig",
};

export function createEventRow(event: RecentEvent, compact = false): HTMLElement {
  const eventClass = classifyEvent(event);
  const row = document.createElement("article");
  row.className = `event-row${compact ? " is-compact" : ""}`;
  row.dataset.eventClass = eventClass;

  const meta = document.createElement("div");
  meta.className = "event-row-meta";

  const iconName = EVENT_CLASS_ICONS[eventClass];
  if (iconName) {
    const iconEl = document.createElement("span");
    iconEl.className = "event-row-icon";
    iconEl.setAttribute("aria-hidden", "true");
    iconEl.append(createIcon(iconName, { size: 14 }));
    meta.append(iconEl);
  }

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
