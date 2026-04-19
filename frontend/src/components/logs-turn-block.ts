import type { TurnBlock } from "../features/logs/logs-reducer.js";
import { createLogsStepRow } from "./logs-step-row.js";

export interface LogsTurnBlockHandle {
  element: HTMLElement;
}

function formatDuration(startIso: string, endIso: string | null): string {
  const startMs = Date.parse(startIso);
  const endMs = endIso ? Date.parse(endIso) : Date.now();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return "";
  }
  const deltaMs = endMs - startMs;
  if (deltaMs < 1000) {
    return `${deltaMs}ms`;
  }
  const seconds = deltaMs / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}m${remainder ? ` ${remainder}s` : ""}`;
}

function formatNumber(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}k`;
  }
  return String(value);
}

function summarizeSteps(turn: TurnBlock): string {
  const counts: Record<string, number> = {};
  for (const step of turn.steps) {
    if (step.kind === "tool_exec" || step.kind === "tool_call" || step.kind === "mcp_tool_call") {
      counts["commands"] = (counts["commands"] ?? 0) + 1;
    } else if (step.kind === "tool_edit") {
      counts["edits"] = (counts["edits"] ?? 0) + 1;
    } else if (step.kind === "web_search") {
      counts["searches"] = (counts["searches"] ?? 0) + 1;
    } else if (step.kind === "agent_message") {
      counts["replies"] = (counts["replies"] ?? 0) + 1;
    }
  }
  const parts: string[] = [];
  if (counts["commands"]) {
    parts.push(`${counts["commands"]} command${counts["commands"] === 1 ? "" : "s"}`);
  }
  if (counts["edits"]) {
    parts.push(`${counts["edits"]} edit${counts["edits"] === 1 ? "" : "s"}`);
  }
  if (counts["searches"]) {
    parts.push(`${counts["searches"]} search${counts["searches"] === 1 ? "" : "es"}`);
  }
  if (counts["replies"]) {
    parts.push(`${counts["replies"]} repl${counts["replies"] === 1 ? "y" : "ies"}`);
  }
  if (parts.length === 0) {
    return "No activity";
  }
  return parts.join(" · ");
}

export interface LogsTurnBlockOptions {
  active: boolean;
  collapsed: boolean;
  sortDirection?: "asc" | "desc";
  onToggle?: () => void;
}

export function createLogsTurnBlock(turn: TurnBlock, options: LogsTurnBlockOptions): LogsTurnBlockHandle {
  const { active, collapsed, sortDirection = "asc", onToggle } = options;
  const section = document.createElement("section");
  section.className = "mc-logs-turn";
  if (active) {
    section.classList.add("is-active");
  }
  if (collapsed) {
    section.classList.add("is-collapsed");
  }
  if (turn.completedAt) {
    section.classList.add("is-complete");
  }

  const header = document.createElement("header");
  header.className = "mc-logs-turn-header";

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "mc-logs-turn-toggle";
  toggle.setAttribute("aria-expanded", String(!collapsed));

  const chevron = document.createElement("span");
  chevron.className = "mc-logs-turn-chevron";
  chevron.setAttribute("aria-hidden", "true");
  chevron.textContent = "›";

  const turnLabel = document.createElement("span");
  turnLabel.className = "mc-logs-turn-label";
  turnLabel.textContent = turn.turnId ? `Turn ${turn.turnId}` : "Turn";

  const durationLabel = document.createElement("span");
  durationLabel.className = "mc-logs-turn-duration";
  const durationText = formatDuration(turn.startedAt, turn.completedAt);
  if (durationText) {
    durationLabel.textContent = `· ${durationText}`;
  }

  const usageLabel = document.createElement("span");
  usageLabel.className = "mc-logs-turn-usage";
  if (turn.tokenIn || turn.tokenOut) {
    usageLabel.textContent = `· ${formatNumber(turn.tokenIn)} in / ${formatNumber(turn.tokenOut)} out`;
  }

  toggle.append(chevron, turnLabel, durationLabel, usageLabel);

  const summary = document.createElement("p");
  summary.className = "mc-logs-turn-summary";
  summary.textContent = summarizeSteps(turn);

  header.append(toggle, summary);

  const body = document.createElement("div");
  body.className = "mc-logs-turn-body";

  const orderedSteps = sortDirection === "desc" ? [...turn.steps].reverse() : turn.steps;
  for (const step of orderedSteps) {
    body.append(createLogsStepRow(step).element);
  }

  if (turn.steps.length === 0) {
    const empty = document.createElement("p");
    empty.className = "mc-logs-turn-empty";
    empty.textContent = "No steps recorded for this turn yet.";
    body.append(empty);
  }

  toggle.addEventListener("click", (event) => {
    event.stopPropagation();
    onToggle?.();
  });

  section.append(header, body);
  return { element: section };
}
