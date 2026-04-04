/**
 * SSE client for receiving real-time orchestrator events.
 *
 * When connected, lifecycle events trigger an immediate poll via the
 * existing polling module and the polling interval is slowed to 30 s.
 * On disconnect the interval reverts to 5 s with automatic reconnect.
 */

import { buildReadTokenQueryParam } from "../access-token";
import { exponentialBackoff } from "../utils/backoff.js";
import { pollOnce, setPollingInterval } from "./polling";

const SSE_URL = "/api/v1/events";
const BASE_RECONNECT_MS = 5_000;
const MAX_RECONNECT_MS = 60_000;
const CONNECTED_POLL_MS = 30_000;
const DISCONNECTED_POLL_MS = 5_000;

const LIFECYCLE_EVENTS = new Set(["issue.started", "issue.completed", "issue.stalled", "issue.queued"]);

/** Maps backend event types to their corresponding CustomEvent names for simple dispatch. */
const EVENT_DISPATCH_MAP = new Map<string, string>([
  ["agent.event", "risoluto:agent-event"],
  ["worker.failed", "risoluto:worker-failed"],
  ["model.updated", "risoluto:model-updated"],
  ["notification.created", "risoluto:notification-created"],
  ["notification.updated", "risoluto:notification-updated"],
  ["workspace.event", "risoluto:workspace-event"],
  ["poll.complete", "risoluto:poll-complete"],
  ["system.error", "risoluto:system-error"],
  ["audit.mutation", "risoluto:audit-mutation"],
  ["webhook.received", "risoluto:webhook-received"],
  ["webhook.health_changed", "risoluto:webhook-health-changed"],
]);

let source: EventSource | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let consecutiveFailures = 0;

function buildEventSourceUrl(): string {
  const tokenQuery = buildReadTokenQueryParam();
  return tokenQuery ? `${SSE_URL}?${tokenQuery}` : SSE_URL;
}

export function connectEventSource(): void {
  if (source) return;
  openConnection();
}

function openConnection(): void {
  const eventSource = new EventSource(buildEventSourceUrl());

  eventSource.onopen = () => {
    consecutiveFailures = 0;
    setPollingInterval(CONNECTED_POLL_MS);
  };

  eventSource.onmessage = (event: MessageEvent) => {
    let data: { type: string; payload?: unknown };
    try {
      data = JSON.parse(String(event.data)) as { type: string; payload?: unknown };
    } catch {
      return;
    }
    if (LIFECYCLE_EVENTS.has(data.type)) {
      pollOnce().catch(() => {});
      const payload = data.payload as { identifier?: string } | undefined;
      if (typeof payload?.identifier === "string") {
        window.dispatchEvent(
          new CustomEvent("risoluto:issue-lifecycle", {
            detail: { type: data.type, identifier: payload.identifier },
          }),
        );
      }
    }
    const customEventName = EVENT_DISPATCH_MAP.get(data.type);
    if (customEventName) {
      window.dispatchEvent(new CustomEvent(customEventName, { detail: data.payload }));
    }
    window.dispatchEvent(
      new CustomEvent("risoluto:any-event", {
        detail: { type: data.type, payload: data.payload },
      }),
    );
  };

  eventSource.onerror = () => {
    setPollingInterval(DISCONNECTED_POLL_MS);
    cleanup();
    consecutiveFailures += 1;
    const delay = exponentialBackoff(consecutiveFailures, BASE_RECONNECT_MS, MAX_RECONNECT_MS);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      openConnection();
    }, delay);
  };

  source = eventSource;
}

function cleanup(): void {
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (source) {
    source.close();
    source = null;
  }
}

export interface AgentEventPayload {
  issueId: string;
  identifier: string;
  type: string;
  message: string;
  sessionId: string | null;
  timestamp?: string;
  content?: string | null;
}

export function subscribeIssueEvents(identifier: string, handler: (event: AgentEventPayload) => void): () => void {
  const listener = (e: Event) => {
    const payload = (e as CustomEvent<AgentEventPayload>).detail;
    if (payload.identifier === identifier) {
      handler(payload);
    }
  };
  window.addEventListener("risoluto:agent-event", listener);
  return () => window.removeEventListener("risoluto:agent-event", listener);
}

export function subscribeIssueLifecycle(identifier: string, handler: () => void): () => void {
  const listener = (e: Event) => {
    const detail = (e as CustomEvent<{ type: string; identifier: string }>).detail;
    if (detail.identifier === identifier) {
      handler();
    }
  };
  window.addEventListener("risoluto:issue-lifecycle", listener);
  return () => window.removeEventListener("risoluto:issue-lifecycle", listener);
}

export function subscribeAllEvents(
  identifier: string,
  handler: (event: { type: string; payload: Record<string, unknown> }) => void,
): () => void {
  const listener = (e: Event) => {
    const detail = (e as CustomEvent).detail as { type: string; payload?: Record<string, unknown> };
    const payload = detail.payload;
    if (payload && typeof payload.identifier === "string" && payload.identifier === identifier) {
      handler({ type: detail.type, payload });
    }
  };
  window.addEventListener("risoluto:any-event", listener);
  return () => window.removeEventListener("risoluto:any-event", listener);
}

export function subscribeNotificationUpdates(handler: () => void): () => void {
  const listener = (): void => {
    handler();
  };
  window.addEventListener("risoluto:notification-created", listener);
  window.addEventListener("risoluto:notification-updated", listener);
  return () => {
    window.removeEventListener("risoluto:notification-created", listener);
    window.removeEventListener("risoluto:notification-updated", listener);
  };
}
