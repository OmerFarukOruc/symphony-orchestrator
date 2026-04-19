import type { PreambleBlock, StepNode } from "../features/logs/logs-reducer.js";
import { createLogsStepRow } from "./logs-step-row.js";

function formatDuration(startIso: string | null, endIso: string | null): string {
  if (!startIso) {
    return "";
  }
  const startMs = Date.parse(startIso);
  const endMs = endIso ? Date.parse(endIso) : Date.now();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return "";
  }
  const seconds = (endMs - startMs) / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}m${remainder ? ` ${remainder}s` : ""}`;
}

/**
 * Wrap a preamble event in the same `StepNode` shape the reducer produces for
 * turn steps. This lets us reuse `createLogsStepRow` and keep a single visual
 * vocabulary across the whole log.
 */
function preambleEventAsStep(event: PreambleBlock["events"][number]): StepNode {
  return {
    kind: "telemetry",
    event,
    completedEvent: null,
    correlationId: null,
    durationMs: null,
    active: false,
    outputDeltas: [],
    timeGap: false,
  };
}

export interface LogsPreambleHandle {
  element: HTMLElement;
}

export interface LogsPreambleOptions {
  expanded: boolean;
  onToggle?: () => void;
}

export function createLogsPreambleBlock(preamble: PreambleBlock, options: LogsPreambleOptions): LogsPreambleHandle {
  const { expanded, onToggle } = options;
  const section = document.createElement("section");
  section.className = expanded ? "mc-logs-turn is-preamble" : "mc-logs-turn is-preamble is-collapsed";

  const header = document.createElement("header");
  header.className = "mc-logs-turn-header";

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "mc-logs-turn-toggle";
  toggle.setAttribute("aria-expanded", String(expanded));

  const chevron = document.createElement("span");
  chevron.className = "mc-logs-turn-chevron";
  chevron.setAttribute("aria-hidden", "true");
  chevron.textContent = "›";

  const turnLabel = document.createElement("span");
  turnLabel.className = "mc-logs-turn-label";
  turnLabel.textContent = preamble.endedAt ? "Session boot" : "Booting session";

  const durationLabel = document.createElement("span");
  durationLabel.className = "mc-logs-turn-duration";
  const durationText = formatDuration(preamble.startedAt, preamble.endedAt);
  if (durationText) {
    durationLabel.textContent = `· ${durationText}`;
  }

  toggle.append(chevron, turnLabel, durationLabel);

  const summary = document.createElement("p");
  summary.className = "mc-logs-turn-summary";
  const count = preamble.events.length;
  summary.textContent = count === 0 ? "No lifecycle events" : `${count} lifecycle event${count === 1 ? "" : "s"}`;

  header.append(toggle, summary);

  const body = document.createElement("div");
  body.className = "mc-logs-turn-body";

  for (const event of preamble.events) {
    body.append(createLogsStepRow(preambleEventAsStep(event)).element);
  }

  toggle.addEventListener("click", (event) => {
    event.stopPropagation();
    onToggle?.();
  });

  section.append(header, body);
  return { element: section };
}
