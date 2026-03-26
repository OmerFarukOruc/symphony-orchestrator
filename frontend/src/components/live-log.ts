import type { AgentEventPayload } from "../state/event-source.js";

export interface LiveLog {
  el: HTMLElement;
  append(entry: AgentEventPayload): void;
  clear(): void;
}

export function createLiveLog(): LiveLog {
  const el = document.createElement("div");
  el.className = "live-log";

  const empty = document.createElement("div");
  empty.className = "live-log__empty text-secondary";
  empty.textContent = "Waiting for agent events\u2026";
  el.appendChild(empty);

  let hasEntries = false;

  function append(entry: AgentEventPayload): void {
    if (!hasEntries) {
      el.removeChild(empty);
      hasEntries = true;
    }
    const row = document.createElement("div");
    row.className = "live-log__row";

    const ts = document.createElement("span");
    ts.className = "live-log__ts text-mono";
    ts.textContent = new Date().toLocaleTimeString("en-US", { hour12: false });

    const chip = document.createElement("span");
    chip.className = "live-log__type";
    chip.textContent = entry.type;

    const msg = document.createElement("span");
    msg.className = "live-log__msg";
    msg.textContent = entry.message;

    row.append(ts, " ", chip, " ", msg);
    el.appendChild(row);

    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    if (atBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }

  function clear(): void {
    el.innerHTML = "";
    el.appendChild(empty);
    hasEntries = false;
  }

  return { el, append, clear };
}
