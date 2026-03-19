import type { RecentEvent } from "../types";

export function classifyEvent(event: RecentEvent): string {
  const type = event.event.toLowerCase();
  const message = event.message.toLowerCase();
  if (type.includes("error") || message.includes("error")) {
    return "error";
  }
  if (type.includes("tool") || message.includes("tool")) {
    return "system";
  }
  if (type.includes("state") || type.includes("status") || message.includes("retry") || message.includes("queued")) {
    return "state-change";
  }
  if (type.includes("agent") || message.includes("agent") || type.includes("turn")) {
    return "agent";
  }
  return "system";
}

export function eventTypeLabel(value: string): string {
  return value.replace(/[_/]+/g, " ").trim();
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
