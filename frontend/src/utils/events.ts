import type { RecentEvent } from "../types";

export type EventCategory = "error" | "reasoning" | "tool" | "agent" | "state-change" | "usage" | "system";

/**
 * Classify by raw kind + optional message text. The message check is only used
 * for the `error` heuristic; pass an empty string when classifying a bare kind.
 */
export function classifyEventKind(kind: string, message = ""): EventCategory {
  const type = kind.toLowerCase();
  const text = message.toLowerCase();
  if (type.includes("error") || text.includes("error")) {
    return "error";
  }
  if (type === "reasoning") {
    return "reasoning";
  }
  if (
    type.startsWith("tool_") ||
    type === "web_search" ||
    type === "mcp_tool_call" ||
    type.includes("exec") ||
    type.includes("patch")
  ) {
    return "tool";
  }
  if (type === "agent_plan") {
    return "agent";
  }
  if (type.includes("state") || type.includes("status") || type.includes("session") || type.includes("rate_limit")) {
    return "state-change";
  }
  if (type.includes("workspace") || type.includes("container") || type.includes("thread")) {
    return "state-change";
  }
  if (
    type.includes("agent") ||
    type.includes("step") ||
    type.includes("streaming") ||
    type.includes("turn") ||
    type.includes("message")
  ) {
    return "agent";
  }
  if (type.includes("token") || type.includes("usage")) {
    return "usage";
  }
  return "system";
}

export function classifyEvent(event: RecentEvent): EventCategory {
  return classifyEventKind(event.event, event.message);
}

/**
 * Display labels for event kinds, rewritten in user language.
 * Several Codex protocol kinds collapse to the same user-facing label on purpose
 * (e.g. `token_usage` and `token_usage_updated` → "Tokens used") so the filter UI
 * does not show apparent duplicates.
 */
const EVENT_LABEL_MAP: Record<string, string> = {
  turn_started: "Task step",
  turn_completed: "Step done",
  turn_diff: "File changes",
  token_usage: "Tokens used",
  token_usage_updated: "Tokens used",
  item_started: "Action started",
  item_completed: "Action done",
  step_started: "Action started",
  step_completed: "Action done",
  agent_started: "Assistant ready",
  agent_complete: "Assistant done",
  agent_message: "Assistant reply",
  agent_streaming: "Streaming reply",
  agent_output: "Assistant output",
  agent_plan: "Plan draft",
  tool_exec: "Shell command",
  tool_output: "Command output",
  tool_edit: "File edit",
  tool_call: "Tool used",
  mcp_tool_call: "MCP tool",
  web_search: "Web search",
  reasoning: "Thinking",
  user_message: "User input",
  context_compaction: "Context compressed",
  image_view: "Image view",
  system: "System",
  session: "Session",
  issue_queued: "Queued",
  workspace_preparing: "Preparing workspace",
  workspace_ready: "Workspace ready",
  workspace_failed: "Workspace failed",
  container_starting: "Starting container",
  container_running: "Container ready",
  container_failed: "Container failed",
  codex_initializing: "Codex starting",
  codex_failed: "Codex failed",
  thread_started: "Session started",
  thread_status: "Session update",
  auth_failed: "Auth failed",
  rate_limits: "Rate limited",
  other: "Other",
  container_stats: "Container stats",
  error: "Error",
  state_change: "State change",
  agent: "Agent",
};

/**
 * One-sentence descriptions for each event kind, used as chip tooltips.
 * Kinds not listed fall back to the kind id itself.
 */
const EVENT_TOOLTIP_MAP: Record<string, string> = {
  turn_started: "A new step in the assistant's task.",
  turn_completed: "The assistant finished the current step.",
  turn_diff: "File edits made in this step.",
  token_usage: "LLM token consumption for this step.",
  token_usage_updated: "LLM token consumption for this step.",
  item_started: "The assistant started a sub-action.",
  item_completed: "The assistant finished a sub-action.",
  step_started: "The assistant started a sub-action.",
  step_completed: "The assistant finished a sub-action.",
  agent_started: "The assistant worker is ready.",
  agent_complete: "The assistant worker finished.",
  agent_message: "The assistant replied with text.",
  agent_streaming: "The assistant is typing a reply.",
  agent_output: "The assistant wrote structured output.",
  agent_plan: "The assistant proposed a plan.",
  tool_exec: "A shell command was run.",
  tool_output: "Output from a shell command.",
  tool_edit: "The assistant edited a file.",
  tool_call: "The assistant called a tool.",
  mcp_tool_call: "An MCP server tool was called.",
  web_search: "A web search was run.",
  reasoning: "The assistant's internal thinking.",
  user_message: "A message you sent to the assistant.",
  context_compaction: "The assistant compacted its context to save tokens.",
  image_view: "The assistant viewed an image.",
  system: "A low-level system event.",
  session: "A session lifecycle event.",
  issue_queued: "The issue is waiting to run.",
  workspace_preparing: "The workspace is being set up.",
  workspace_ready: "The workspace is ready.",
  workspace_failed: "The workspace failed to set up.",
  container_starting: "A container is booting.",
  container_running: "A container is running.",
  container_failed: "A container failed to start.",
  codex_initializing: "Codex is initializing.",
  codex_failed: "Codex failed to initialize.",
  thread_started: "A new conversation session began.",
  thread_status: "The session's state has changed.",
  auth_failed: "Authentication failed.",
  rate_limits: "The LLM provider is throttling requests.",
  container_stats: "Container resource stats.",
  error: "An error occurred.",
  state_change: "A runtime state change.",
};

/**
 * Category order for the primary logs toolbar — most-important first.
 */
export const CATEGORY_ORDER: readonly EventCategory[] = [
  "error",
  "agent",
  "tool",
  "reasoning",
  "state-change",
  "usage",
  "system",
] as const;

export const CATEGORY_LABELS: Record<EventCategory, string> = {
  error: "Errors",
  agent: "Assistant",
  tool: "Tools",
  reasoning: "Thinking",
  "state-change": "State",
  usage: "Tokens",
  system: "System",
};

export const CATEGORY_TOOLTIPS: Record<EventCategory, string> = {
  error: "Failures and errors from the assistant or infrastructure.",
  agent: "What the assistant said or did at a high level.",
  tool: "Shell commands, file edits, MCP and web tools.",
  reasoning: "Internal thinking steps.",
  "state-change": "Session, workspace, and container lifecycle.",
  usage: "Token usage and rate limits.",
  system: "Other low-level events.",
};

export function getCategoryLabel(category: EventCategory): string {
  return CATEGORY_LABELS[category];
}

export function getCategoryTooltip(category: EventCategory): string {
  return CATEGORY_TOOLTIPS[category];
}

export function getEventTooltip(kind: string): string {
  return EVENT_TOOLTIP_MAP[kind] ?? "";
}

export function eventTypeLabel(value: string): string {
  return EVENT_LABEL_MAP[value] ?? value.replaceAll(/[_/]+/g, " ").trim();
}

export function stringifyPayload(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function eventMatchesSearch(event: RecentEvent, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return true;
  }
  return `${event.event} ${event.message} ${stringifyPayload(event.content)}`.toLowerCase().includes(needle);
}
