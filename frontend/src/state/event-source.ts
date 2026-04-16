import { getRuntimeClient, type AgentEventPayload } from "./runtime-client.js";

/** Compatibility facade over the unified frontend runtime client. */
export type { AgentEventPayload } from "./runtime-client.js";

export function connectEventSource(): void {
  getRuntimeClient().connectEventSource();
}

export function subscribeIssueEvents(identifier: string, handler: (event: AgentEventPayload) => void): () => void {
  return getRuntimeClient().subscribeIssueEvents(identifier, handler);
}

export function subscribeAllEvents(
  identifier: string,
  handler: (event: { type: string; payload: Record<string, unknown> }) => void,
): () => void {
  return getRuntimeClient().subscribeAllEvents(identifier, handler);
}

export function subscribeNotificationUpdates(handler: () => void): () => void {
  return getRuntimeClient().subscribeNotificationUpdates(handler);
}
