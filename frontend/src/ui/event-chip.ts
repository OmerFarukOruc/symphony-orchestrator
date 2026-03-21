import type { RecentEvent } from "../types";
import { classifyEvent, eventTypeLabel } from "../utils/events";

export function eventChip(event: RecentEvent): HTMLElement {
  const chip = document.createElement("span");
  chip.className = `mc-event-chip mc-event-chip-${classifyEvent(event)}`;
  chip.textContent = eventTypeLabel(event.event);
  return chip;
}
