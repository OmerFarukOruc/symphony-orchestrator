import type { RecentEvent } from "../types";
import { classifyEvent, eventTypeLabel, stringifyPayload } from "../utils/events";
import { formatShortTime } from "../utils/format";

interface LogRowOptions {
  event: RecentEvent;
  expanded: boolean;
  highlightedText?: string;
  onToggle?: () => void;
}

function highlightText(text: string, query: string): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const needle = query.trim();
  if (!needle) {
    fragment.append(text);
    return fragment;
  }
  const lower = text.toLowerCase();
  const target = needle.toLowerCase();
  let offset = 0;
  while (offset < text.length) {
    const nextIndex = lower.indexOf(target, offset);
    if (nextIndex === -1) {
      fragment.append(text.slice(offset));
      break;
    }
    if (nextIndex > offset) {
      fragment.append(text.slice(offset, nextIndex));
    }
    const mark = document.createElement("mark");
    mark.textContent = text.slice(nextIndex, nextIndex + needle.length);
    fragment.append(mark);
    offset = nextIndex + needle.length;
  }
  return fragment;
}

export function createLogRow(options: LogRowOptions): HTMLElement {
  const { event, expanded, highlightedText = "", onToggle } = options;
  const payload = stringifyPayload(event.content);

  const row = document.createElement("article");
  row.className = "mc-log-row";
  if (payload) row.classList.add("has-payload");
  if (expanded) row.classList.add("is-expanded");

  const header = document.createElement("div");
  header.className = "mc-log-row-header";

  // Chevron — only rendered when row has a payload
  if (payload) {
    const chevron = document.createElement("span");
    chevron.className = "mc-log-chevron";
    chevron.setAttribute("aria-hidden", "true");
    header.append(chevron);
  }

  const timestamp = document.createElement("time");
  timestamp.className = "mc-log-time";
  timestamp.dateTime = event.at;
  timestamp.textContent = formatShortTime(event.at);

  const chip = document.createElement("span");
  chip.className = `event-chip event-chip-${classifyEvent(event)}`;
  chip.textContent = eventTypeLabel(event.event);

  const message = document.createElement("p");
  message.className = "mc-log-message";
  message.append(highlightText(event.message, highlightedText));

  header.append(timestamp, chip, message);
  row.append(header);

  if (payload) {
    const panel = document.createElement("pre");
    panel.className = "mc-log-payload";
    panel.hidden = !expanded;
    panel.textContent = payload;
    row.append(panel);

    row.addEventListener("click", () => onToggle?.());
  }

  return row;
}
