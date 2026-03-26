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

const LIFECYCLE_EVENTS = new Set(["issue.started", "issue.completed", "issue.stalled"]);

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
    const data = JSON.parse(String(event.data)) as { type: string };
    if (LIFECYCLE_EVENTS.has(data.type)) {
      pollOnce().catch(() => {});
    }
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
