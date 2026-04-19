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
  // Turns — past-tense grammar, "started" / "done" pair
  turn_started: "Turn started",
  turn_completed: "Turn done",
  turn_diff: "File changes",
  // Tokens
  token_usage: "Tokens",
  token_usage_updated: "Tokens",
  // Items — past-tense "started" / "done" pair
  item_started: "Action started",
  item_completed: "Action done",
  step_started: "Step started",
  step_completed: "Step done",
  // Agent lifecycle
  agent_started: "Agent ready",
  agent_complete: "Agent done",
  agent_message: "Agent reply",
  agent_message_partial: "Agent typing",
  agent_output: "Agent output",
  agent_plan: "Plan",
  // Tools
  tool_exec: "Shell",
  tool_output: "Output",
  tool_output_live: "Output",
  tool_edit: "File edit",
  tool_call: "Tool",
  tool_approval_granted: "Approved",
  mcp_tool_call: "MCP",
  web_search: "Web search",
  // Reasoning
  reasoning: "Thinking",
  reasoning_delta: "Thinking",
  user_message: "You",
  user_input_requested: "Prompting you",
  context_compaction: "Context compacted",
  image_view: "Image",
  system: "System",
  session: "Session",
  issue_queued: "Queued",
  // Workspace
  workspace_preparing: "Workspace preparing",
  workspace_ready: "Workspace ready",
  workspace_failed: "Workspace failed",
  // Container
  container_starting: "Container starting",
  container_running: "Container ready",
  container_failed: "Container failed",
  container_stats: "Stats",
  // Codex
  codex_initializing: "Codex starting",
  codex_failed: "Codex failed",
  // Thread
  thread_started: "Thread started",
  thread_status: "Thread status",
  // Misc
  auth_failed: "Auth failed",
  rate_limits: "Rate limited",
  other: "Other",
  error: "Error",
  state_change: "State",
  agent: "Agent",
};

/**
 * One-sentence descriptions for each event kind, used as chip tooltips.
 * Kinds not listed fall back to the kind id itself.
 */
const EVENT_TOOLTIP_MAP: Record<string, string> = {
  turn_started: "A new turn in the agent's task began.",
  turn_completed: "The agent finished the current turn.",
  turn_diff: "Aggregated file edits for the turn.",
  token_usage: "LLM token consumption for this turn.",
  token_usage_updated: "LLM token consumption for this turn.",
  item_started: "The agent started a sub-action.",
  item_completed: "The agent finished a sub-action.",
  step_started: "The agent started a step.",
  step_completed: "The agent finished a step.",
  agent_started: "The agent worker is ready.",
  agent_complete: "The agent worker finished.",
  agent_message: "The agent replied with text.",
  agent_message_partial: "The agent is typing a reply.",
  agent_output: "The agent wrote structured output.",
  agent_plan: "The agent proposed a plan.",
  tool_exec: "A shell command was run.",
  tool_output: "Output from a shell command.",
  tool_output_live: "Streaming output from the active command.",
  tool_edit: "The agent edited a file.",
  tool_call: "The agent called a tool.",
  tool_approval_granted: "Auto-approved a sandboxed action.",
  mcp_tool_call: "An MCP server tool was called.",
  web_search: "A web search was run.",
  reasoning: "The agent's internal thinking.",
  reasoning_delta: "The agent's thinking, streaming.",
  user_message: "A message you sent to the agent.",
  user_input_requested: "The agent asked you a question.",
  context_compaction: "The agent compacted its context to save tokens.",
  image_view: "The agent viewed an image.",
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
