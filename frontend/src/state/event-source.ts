/**
 * SSE client for receiving real-time orchestrator events.
 *
 * When connected, lifecycle events trigger an immediate poll via the
 * existing polling module and the polling interval is slowed to 30 s.
 * On disconnect the interval reverts to 5 s with automatic reconnect.
 */

import { pollOnce, setPollingInterval } from "./polling";

const SSE_URL = "/api/v1/events";
const RECONNECT_DELAY_MS = 5_000;
const CONNECTED_POLL_MS = 30_000;
const DISCONNECTED_POLL_MS = 5_000;

const LIFECYCLE_EVENTS = new Set(["issue.started", "issue.completed", "issue.stalled", "issue.queued"]);

/** Maps backend event types to their corresponding CustomEvent names for simple dispatch. */
const EVENT_DISPATCH_MAP = new Map<string, string>([
  ["agent.event", "symphony:agent-event"],
  ["worker.failed", "symphony:worker-failed"],
  ["model.updated", "symphony:model-updated"],
  ["workspace.event", "symphony:workspace-event"],
  ["poll.complete", "symphony:poll-complete"],
  ["system.error", "symphony:system-error"],
]);

let source: EventSource | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

export function connectEventSource(): void {
  if (source) return;
  openConnection();
}

function openConnection(): void {
  const eventSource = new EventSource(SSE_URL);

  eventSource.onopen = () => {
    setPollingInterval(CONNECTED_POLL_MS);
  };

  eventSource.onmessage = (event: MessageEvent) => {
    const data = JSON.parse(String(event.data)) as { type: string; payload?: unknown };
    if (LIFECYCLE_EVENTS.has(data.type)) {
      pollOnce().catch(() => {});
      const payload = data.payload as { identifier?: string } | undefined;
      if (typeof payload?.identifier === "string") {
        window.dispatchEvent(
          new CustomEvent("symphony:issue-lifecycle", {
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
      new CustomEvent("symphony:any-event", {
        detail: { type: data.type, payload: data.payload },
      }),
    );
  };

  eventSource.onerror = () => {
    setPollingInterval(DISCONNECTED_POLL_MS);
    cleanup();
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      openConnection();
    }, RECONNECT_DELAY_MS);
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
  window.addEventListener("symphony:agent-event", listener);
  return () => window.removeEventListener("symphony:agent-event", listener);
}

export function subscribeIssueLifecycle(identifier: string, handler: () => void): () => void {
  const listener = (e: Event) => {
    const detail = (e as CustomEvent<{ type: string; identifier: string }>).detail;
    if (detail.identifier === identifier) {
      handler();
    }
  };
  window.addEventListener("symphony:issue-lifecycle", listener);
  return () => window.removeEventListener("symphony:issue-lifecycle", listener);
}

/** Subscribe to a CustomEvent by name, forwarding the detail to the handler. */
function subscribeEvent(eventName: string, handler: (payload: unknown) => void): () => void {
  const listener = (e: Event) => {
    handler((e as CustomEvent).detail);
  };
  window.addEventListener(eventName, listener);
  return () => window.removeEventListener(eventName, listener);
}

export function subscribeWorkerFailed(handler: (payload: unknown) => void): () => void {
  return subscribeEvent("symphony:worker-failed", handler);
}

export function subscribeModelUpdated(handler: (payload: unknown) => void): () => void {
  return subscribeEvent("symphony:model-updated", handler);
}

export function subscribeWorkspaceEvent(handler: (payload: unknown) => void): () => void {
  return subscribeEvent("symphony:workspace-event", handler);
}

export function subscribePollComplete(handler: () => void): () => void {
  return subscribeEvent("symphony:poll-complete", handler as (payload: unknown) => void);
}

export function subscribeSystemError(handler: (payload: unknown) => void): () => void {
  return subscribeEvent("symphony:system-error", handler);
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
  window.addEventListener("symphony:any-event", listener);
  return () => window.removeEventListener("symphony:any-event", listener);
}
