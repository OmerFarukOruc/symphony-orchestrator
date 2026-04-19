import type { RecentEvent } from "../types/runtime.js";
import type { StepNode, StepKind } from "../features/logs/logs-reducer.js";
import { stringifyPayload } from "../utils/events.js";
import { formatShortTime } from "../utils/format.js";

interface StepSigil {
  char: string;
  tone: "info" | "warning" | "action" | "edit" | "search" | "message" | "error" | "muted" | "user";
}

const SIGIL_MAP: Record<StepKind, StepSigil> = {
  reasoning: { char: "✻", tone: "warning" },
  agent_message: { char: "→", tone: "message" },
  agent_message_partial: { char: "→", tone: "message" },
  tool_exec: { char: "⚡", tone: "action" },
  tool_edit: { char: "✎", tone: "edit" },
  tool_call: { char: "⬡", tone: "info" },
  mcp_tool_call: { char: "⬡", tone: "info" },
  web_search: { char: "⌕", tone: "search" },
  image_view: { char: "⊡", tone: "muted" },
  user_message: { char: "↩", tone: "user" },
  user_input_requested: { char: "?", tone: "warning" },
  tool_approval_granted: { char: "✓", tone: "muted" },
  agent_plan: { char: "≡", tone: "info" },
  error: { char: "✕", tone: "error" },
  context_compaction: { char: "⊜", tone: "muted" },
  telemetry: { char: "·", tone: "muted" },
  other: { char: "◌", tone: "muted" },
};

function buildSigil(step: StepNode): HTMLElement {
  const sigilSpec = SIGIL_MAP[step.kind] ?? SIGIL_MAP["other"];
  const sigil = document.createElement("span");
  sigil.className = "mc-logs-step-sigil";
  sigil.dataset["tone"] = sigilSpec.tone;
  if (step.active) {
    sigil.classList.add("is-live");
  }
  sigil.textContent = sigilSpec.char;
  sigil.setAttribute("aria-hidden", "true");
  return sigil;
}

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const seconds = ms / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}m${remainder ? ` ${remainder}s` : ""}`;
}

function summarizeStepMessage(step: StepNode): string {
  const event = step.event;
  switch (step.kind) {
    case "tool_exec":
      return extractCommand(event) ?? event.message;
    case "tool_edit":
      return extractFilePath(event) ?? event.message;
    case "web_search":
      return event.content ?? event.message;
    case "agent_plan":
      return "Plan updated";
    case "reasoning":
      return "Thinking";
    // For agent messages the full text renders in the prose body below; the
    // header only shows a compact label so the content isn't duplicated.
    case "agent_message":
      return "Reply";
    case "agent_message_partial":
      return "Typing…";
    case "user_input_requested":
      return event.content ?? event.message;
    case "tool_approval_granted":
      return event.message;
    default:
      return event.message;
  }
}

function extractCommand(event: RecentEvent): string | null {
  const metadata = event.metadata;
  if (metadata) {
    const command = metadata["command"];
    if (typeof command === "string" && command.trim()) {
      return command;
    }
    if (Array.isArray(command) && command.every((part) => typeof part === "string")) {
      return command.join(" ");
    }
  }
  if (event.content) {
    const firstLine = event.content.split("\n")[0];
    if (firstLine && firstLine.length <= 160) {
      return firstLine;
    }
  }
  return null;
}

function extractFilePath(event: RecentEvent): string | null {
  const metadata = event.metadata;
  if (metadata && typeof metadata["path"] === "string") {
    return metadata["path"];
  }
  if (event.content) {
    const match = /(?:^|\n)(?:diff --git a\/|---\s+a\/|\+\+\+\s+b\/)([^\s\n]+)/.exec(event.content);
    if (match?.[1]) {
      return match[1];
    }
  }
  return null;
}

function extractDiffSummary(event: RecentEvent): { added: number; removed: number } | null {
  if (!event.content) {
    return null;
  }
  if (!event.content.startsWith("diff --git") && !/^---\s+a\//m.test(event.content)) {
    return null;
  }
  let added = 0;
  let removed = 0;
  for (const line of event.content.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) {
      added += 1;
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      removed += 1;
    }
  }
  return { added, removed };
}

function buildBody(step: StepNode): HTMLElement | null {
  const payload = stringifyPayload(step.event.content);
  if (step.kind === "reasoning" && payload) {
    const body = document.createElement("pre");
    body.className = "mc-logs-step-thinking";
    body.textContent = payload;
    return body;
  }
  if ((step.kind === "agent_message" || step.kind === "agent_message_partial") && payload) {
    const body = document.createElement("div");
    body.className = "mc-logs-step-prose";
    if (step.kind === "agent_message_partial") {
      body.classList.add("is-streaming");
    }
    body.textContent = payload;
    return body;
  }
  if (step.outputDeltas.length > 0) {
    const body = document.createElement("pre");
    body.className = "mc-logs-step-output";
    body.textContent = step.outputDeltas
      .map((delta) => delta.content ?? delta.message)
      .join("")
      .trim();
    return body;
  }
  return null;
}

export interface LogsStepRowHandle {
  element: HTMLElement;
}

export function createLogsStepRow(step: StepNode): LogsStepRowHandle {
  const article = document.createElement("article");
  article.className = "mc-logs-step";
  article.dataset["kind"] = step.kind;
  if (step.active) {
    article.classList.add("is-active");
  }
  if (step.timeGap) {
    article.classList.add("has-time-gap");
  }

  const sigil = buildSigil(step);

  const header = document.createElement("div");
  header.className = "mc-logs-step-header";

  const time = document.createElement("time");
  time.className = "mc-logs-step-time";
  time.dateTime = step.event.at;
  time.textContent = formatShortTime(step.event.at);

  // Steps with their own expanded body panel (reasoning/prose/output) keep
  // a plain 3-line-clamped header summary. Every other step wraps the message
  // in a checkbox+label pattern so the user can expand in place when the
  // summary is clipped — no re-render, no persistent state.
  const hasOwnBody =
    step.kind === "reasoning" || step.kind === "agent_message" || step.kind === "agent_message_partial";
  let messageNode: HTMLElement;
  if (hasOwnBody) {
    const message = document.createElement("p");
    message.className = "mc-logs-step-message";
    message.textContent = summarizeStepMessage(step);
    messageNode = message;
  } else {
    const label = document.createElement("label");
    label.className = "mc-logs-step-message-label";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "mc-logs-step-expand";
    const message = document.createElement("p");
    message.className = "mc-logs-step-message";
    const summary = summarizeStepMessage(step);
    message.textContent = summary;
    // Scope the accessible name to this specific step so screen-reader users
    // hearing a long list of expandable rows can tell them apart. The label
    // wraps the checkbox + message, so the visible text is already the
    // accessible name — no redundant aria-label needed.
    label.append(checkbox, message);
    messageNode = label;
  }

  header.append(time, messageNode);

  const meta = document.createElement("div");
  meta.className = "mc-logs-step-meta";

  if (step.kind === "tool_edit") {
    const diff = extractDiffSummary(step.completedEvent ?? step.event);
    if (diff) {
      const summary = document.createElement("span");
      summary.className = "mc-logs-step-diff-summary";
      const added = document.createElement("span");
      added.className = "mc-logs-step-diff-added";
      added.textContent = `+${diff.added}`;
      const removed = document.createElement("span");
      removed.className = "mc-logs-step-diff-removed";
      removed.textContent = `−${diff.removed}`;
      summary.append(added, removed);
      meta.append(summary);
    }
  }

  if (step.durationMs !== null) {
    const duration = document.createElement("span");
    duration.className = "mc-logs-step-duration";
    duration.textContent = formatDuration(step.durationMs);
    meta.append(duration);
  } else if (step.active) {
    const pending = document.createElement("span");
    pending.className = "mc-logs-step-pending";
    pending.textContent = "…";
    meta.append(pending);
  }

  article.append(sigil, header);
  if (meta.childElementCount > 0) {
    article.append(meta);
  }

  const body = buildBody(step);
  if (body) {
    article.append(body);
  }

  return { element: article };
}
