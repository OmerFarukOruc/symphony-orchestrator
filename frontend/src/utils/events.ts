import type { RecentEvent } from "../types";

export function classifyEvent(event: RecentEvent): string {
  const type = event.event.toLowerCase();
  const message = event.message.toLowerCase();
  if (type.includes("error") || message.includes("error")) {
    return "error";
  }
  if (type.startsWith("tool_") || type.includes("exec") || type.includes("patch")) {
    return "tool";
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

const EVENT_LABEL_MAP: Record<string, string> = {
  turn_started: "Turn started",
  turn_completed: "Turn completed",
  token_usage_updated: "Token usage",
  item_started: "Step started",
  item_completed: "Step completed",
  agent_started: "Agent started",
  agent_complete: "Agent complete",
  agent_message: "Agent message",
  agent_streaming: "Streaming",
  agent_output: "Agent output",
  step_started: "Step started",
  step_completed: "Step completed",
  token_usage: "Token usage",
  turn_diff: "Turn diff",
  tool_exec: "Shell command",
  tool_output: "Command output",
  tool_edit: "File edit",
  system: "System",
  session: "Session",
  issue_queued: "Queued",
  workspace_preparing: "Workspace prep",
  workspace_ready: "Workspace ready",
  workspace_failed: "Workspace failed",
  container_starting: "Container start",
  container_running: "Container ready",
  container_failed: "Container failed",
  codex_initializing: "Codex init",
  codex_failed: "Codex failed",
  thread_started: "Thread started",
  thread_status: "Thread status",
  auth_failed: "Auth failed",
  rate_limits: "Rate limits",
  other: "Other",
  container_stats: "Container stats",
  error: "Error",
  state_change: "State change",
  agent: "Agent",
};

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
