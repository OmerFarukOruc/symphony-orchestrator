import { api } from "../api";
import { buildReadTokenQueryParam } from "../access-token";
import type { WebhookHealth } from "../types";
import { exponentialBackoff } from "../utils/backoff.js";
import { APP_STATE_HEARTBEAT_EVENT, APP_STATE_UPDATE_EVENT, StateStore, store, type AppState } from "./store";

const STALE_THRESHOLD = 3;
const MAX_BACKOFF_MS = 60_000;
const BASE_POLL_MS = 5_000;
const CONNECTED_POLL_MS = 30_000;
const DISCONNECTED_POLL_MS = 5_000;
const BASE_RECONNECT_MS = 5_000;
const LIFECYCLE_POLL_DEBOUNCE_MS = 2_000;
const SSE_URL = "/api/v1/events";

const LIFECYCLE_EVENTS = new Set(["issue.started", "issue.completed", "issue.stalled", "issue.queued"]);

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

interface EventSourceLike {
  close(): void;
  onopen: ((this: EventSource, ev: Event) => unknown) | null;
  onmessage: ((this: EventSource, ev: MessageEvent) => unknown) | null;
  onerror: ((this: EventSource, ev: Event) => unknown) | null;
}

interface RuntimeClientDeps {
  api: Pick<typeof api, "getState">;
  buildReadTokenQueryParam: () => string;
  eventSourceFactory: (url: string) => EventSourceLike;
  store: StateStore;
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

interface SubscribeStateOptions {
  includeHeartbeat?: boolean;
}

type IntervalHandle = number;
type TimeoutHandle = number;

export class RuntimeClient {
  private intervalId: IntervalHandle | null = null;
  private inFlight = false;
  private bannerDismissed = false;
  private source: EventSourceLike | null = null;
  private reconnectTimer: TimeoutHandle | null = null;
  private lifecyclePollTimer: TimeoutHandle | null = null;
  private consecutiveFailures = 0;

  constructor(private readonly deps: RuntimeClientDeps) {}

  start(): void {
    this.startPolling();
    this.connectEventSource();
  }

  stop(): void {
    this.stopPolling();
    this.disconnectEventSource();
    if (this.lifecyclePollTimer !== null) {
      clearTimeout(this.lifecyclePollTimer);
      this.lifecyclePollTimer = null;
    }
  }

  getStateStore(): StateStore {
    return this.deps.store;
  }

  getAppState(): AppState {
    return this.deps.store.getState();
  }

  mergeSnapshot(
    snapshot: Parameters<StateStore["mergeSnapshot"]>[0],
    options?: Parameters<StateStore["mergeSnapshot"]>[1],
  ): void {
    this.deps.store.mergeSnapshot(snapshot, options);
  }

  dismissStaleBanner(): void {
    this.bannerDismissed = true;
    const banner = this.getDocument()?.getElementById("stale-banner");
    if (!banner) {
      return;
    }
    banner.hidden = true;
    banner.classList.remove("is-visible");
  }

  async pollOnce(): Promise<void> {
    if (this.inFlight || this.isDocumentHidden()) {
      this.updateBanner();
      return;
    }
    this.inFlight = true;
    const wasStale = this.deps.store.getState().staleCount >= STALE_THRESHOLD;
    try {
      const data = await this.deps.api.getState();
      await this.yieldToMainThread();
      this.deps.store.mergeSnapshot(data, { resetStale: true });
      if (wasStale && this.intervalId !== null) {
        this.schedulePolling(BASE_POLL_MS);
      }
    } catch {
      this.deps.store.incrementStale();
      if (this.intervalId !== null) {
        this.schedulePolling(this.backoffInterval());
      }
    } finally {
      this.inFlight = false;
      this.updateBanner();
    }
  }

  startPolling(): void {
    if (this.intervalId !== null) {
      return;
    }
    this.getDocument()?.addEventListener("visibilitychange", this.handleVisibilityChange);
    void this.pollOnce();
    this.schedulePolling(BASE_POLL_MS);
  }

  stopPolling(): void {
    if (this.intervalId === null) {
      return;
    }
    this.getClearInterval()(this.intervalId);
    this.intervalId = null;
    this.getDocument()?.removeEventListener("visibilitychange", this.handleVisibilityChange);
  }

  setPollingInterval(ms: number): void {
    if (this.intervalId === null) {
      return;
    }
    this.schedulePolling(ms);
  }

  connectEventSource(): void {
    if (this.source) {
      return;
    }
    this.openEventSource();
  }

  subscribeIssueEvents(identifier: string, handler: (event: AgentEventPayload) => void): () => void {
    const listener = (event: Event) => {
      const payload = (event as CustomEvent<AgentEventPayload>).detail;
      if (payload.identifier === identifier) {
        handler(payload);
      }
    };
    this.getWindow()?.addEventListener("risoluto:agent-event", listener);
    return () => this.getWindow()?.removeEventListener("risoluto:agent-event", listener);
  }

  subscribeIssueLifecycle(identifier: string, handler: () => void): () => void {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<{ type: string; identifier: string }>).detail;
      if (detail.identifier === identifier) {
        handler();
      }
    };
    this.getWindow()?.addEventListener("risoluto:issue-lifecycle", listener);
    return () => this.getWindow()?.removeEventListener("risoluto:issue-lifecycle", listener);
  }

  subscribeAllEvents(
    identifier: string,
    handler: (event: { type: string; payload: Record<string, unknown> }) => void,
  ): () => void {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent).detail as { type: string; payload?: Record<string, unknown> };
      const payload = detail.payload;
      if (payload && typeof payload.identifier === "string" && payload.identifier === identifier) {
        handler({ type: detail.type, payload });
      }
    };
    this.getWindow()?.addEventListener("risoluto:any-event", listener);
    return () => this.getWindow()?.removeEventListener("risoluto:any-event", listener);
  }

  subscribeNotificationUpdates(handler: () => void): () => void {
    const listener = (): void => {
      handler();
    };
    const currentWindow = this.getWindow();
    currentWindow?.addEventListener("risoluto:notification-created", listener);
    currentWindow?.addEventListener("risoluto:notification-updated", listener);
    return () => {
      currentWindow?.removeEventListener("risoluto:notification-created", listener);
      currentWindow?.removeEventListener("risoluto:notification-updated", listener);
    };
  }

  subscribeWebhookHealth(handler: (health: WebhookHealth) => void): () => void {
    const listener = (event: Event) => {
      handler((event as CustomEvent<WebhookHealth>).detail);
    };
    this.getWindow()?.addEventListener("risoluto:webhook-health-changed", listener);
    return () => this.getWindow()?.removeEventListener("risoluto:webhook-health-changed", listener);
  }

  subscribeWebhookReceived(handler: () => void): () => void {
    const listener = (): void => {
      handler();
    };
    this.getWindow()?.addEventListener("risoluto:webhook-received", listener);
    return () => this.getWindow()?.removeEventListener("risoluto:webhook-received", listener);
  }

  subscribeWorkspaceEvents(handler: () => void): () => void {
    const listener = (): void => {
      handler();
    };
    this.getWindow()?.addEventListener("risoluto:workspace-event", listener);
    return () => this.getWindow()?.removeEventListener("risoluto:workspace-event", listener);
  }

  subscribeRuntimeEvents(handler: (event: { type: string; payload?: Record<string, unknown> }) => void): () => void {
    const listener = (event: Event) => {
      handler((event as CustomEvent<{ type: string; payload?: Record<string, unknown> }>).detail);
    };
    this.getWindow()?.addEventListener("risoluto:any-event", listener);
    return () => this.getWindow()?.removeEventListener("risoluto:any-event", listener);
  }

  subscribeState(handler: (state: AppState) => void, options: SubscribeStateOptions = {}): () => void {
    const listener = (event: Event) => {
      handler((event as CustomEvent<AppState>).detail);
    };
    const currentWindow = this.getWindow();
    currentWindow?.addEventListener(APP_STATE_UPDATE_EVENT, listener);
    if (options.includeHeartbeat) {
      currentWindow?.addEventListener(APP_STATE_HEARTBEAT_EVENT, listener);
    }
    return () => {
      currentWindow?.removeEventListener(APP_STATE_UPDATE_EVENT, listener);
      if (options.includeHeartbeat) {
        currentWindow?.removeEventListener(APP_STATE_HEARTBEAT_EVENT, listener);
      }
    };
  }

  subscribePollComplete(handler: () => void): () => void {
    const listener = (): void => {
      handler();
    };
    this.getWindow()?.addEventListener("risoluto:poll-complete", listener);
    return () => this.getWindow()?.removeEventListener("risoluto:poll-complete", listener);
  }

  private readonly handleVisibilityChange = (): void => {
    if (!this.isDocumentHidden()) {
      void this.pollOnce();
    }
  };

  private backoffInterval(): number {
    const staleCount = this.deps.store.getState().staleCount;
    if (staleCount <= STALE_THRESHOLD) {
      return BASE_POLL_MS;
    }
    return exponentialBackoff(staleCount - STALE_THRESHOLD, BASE_POLL_MS, MAX_BACKOFF_MS);
  }

  private schedulePolling(ms: number): void {
    if (this.intervalId !== null) {
      this.getClearInterval()(this.intervalId);
    }
    this.intervalId = this.getSetInterval()(() => {
      void this.pollOnce();
    }, ms);
  }

  private updateBanner(): void {
    const banner = this.getDocument()?.getElementById("stale-banner");
    if (!banner) {
      return;
    }
    const staleCount = this.deps.store.getState().staleCount;
    const isVisible = staleCount >= STALE_THRESHOLD && !this.bannerDismissed;
    banner.hidden = !isVisible;
    banner.classList.toggle("is-visible", isVisible);

    if (isVisible) {
      const intervalSec = Math.round(this.backoffInterval() / 1000);
      const message = banner.querySelector(".stale-banner-message");
      if (message) {
        message.textContent = `State feed is stale \u2014 retrying every ${intervalSec}s.`;
      }
    }

    if (staleCount === 0) {
      this.bannerDismissed = false;
    }
  }

  private isDocumentHidden(): boolean {
    const currentDocument = this.getDocument();
    return Boolean(typeof currentDocument?.hidden === "boolean" && currentDocument.hidden);
  }

  private async yieldToMainThread(): Promise<void> {
    await new Promise<void>((resolve) => {
      const scheduleFrame = globalThis.requestAnimationFrame?.bind(globalThis);
      if (!scheduleFrame) {
        resolve();
        return;
      }
      scheduleFrame(() => resolve());
    });
  }

  private openEventSource(): void {
    const eventSource = this.deps.eventSourceFactory(this.buildEventSourceUrl());
    eventSource.onopen = () => {
      this.consecutiveFailures = 0;
      this.setPollingInterval(CONNECTED_POLL_MS);
    };
    eventSource.onmessage = (event: MessageEvent) => {
      this.handleEventMessage(event);
    };
    eventSource.onerror = () => {
      this.setPollingInterval(DISCONNECTED_POLL_MS);
      this.cleanupEventSource();
      this.consecutiveFailures += 1;
      const delay = exponentialBackoff(this.consecutiveFailures, BASE_RECONNECT_MS, MAX_BACKOFF_MS);
      this.reconnectTimer = globalThis.setTimeout(() => {
        this.reconnectTimer = null;
        this.openEventSource();
      }, delay) as unknown as TimeoutHandle;
    };
    this.source = eventSource;
  }

  private disconnectEventSource(): void {
    this.cleanupEventSource();
    this.consecutiveFailures = 0;
  }

  private cleanupEventSource(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.source) {
      this.source.close();
      this.source = null;
    }
  }

  private handleEventMessage(event: MessageEvent): void {
    let data: { type: string; payload?: unknown };
    try {
      data = JSON.parse(String(event.data)) as { type: string; payload?: unknown };
    } catch {
      return;
    }

    if (LIFECYCLE_EVENTS.has(data.type)) {
      this.debouncedLifecyclePoll();
      const payload = data.payload as { identifier?: string } | undefined;
      if (typeof payload?.identifier === "string") {
        this.dispatchWindowEvent("risoluto:issue-lifecycle", {
          type: data.type,
          identifier: payload.identifier,
        });
      }
    }

    const customEventName = EVENT_DISPATCH_MAP.get(data.type);
    if (customEventName) {
      this.dispatchWindowEvent(customEventName, data.payload);
    }
    this.dispatchWindowEvent("risoluto:any-event", { type: data.type, payload: data.payload });
  }

  private debouncedLifecyclePoll(): void {
    if (this.lifecyclePollTimer !== null) {
      return;
    }
    this.lifecyclePollTimer = globalThis.setTimeout(() => {
      this.lifecyclePollTimer = null;
      void this.pollOnce();
    }, LIFECYCLE_POLL_DEBOUNCE_MS) as unknown as TimeoutHandle;
  }

  private dispatchWindowEvent(name: string, detail: unknown): void {
    this.getWindow()?.dispatchEvent(new CustomEvent(name, { detail }));
  }

  private buildEventSourceUrl(): string {
    const tokenQuery = this.deps.buildReadTokenQueryParam();
    return tokenQuery ? `${SSE_URL}?${tokenQuery}` : SSE_URL;
  }

  private getWindow(): Window | undefined {
    return typeof window === "undefined" ? undefined : window;
  }

  private getDocument(): Document | undefined {
    return typeof document === "undefined" ? undefined : document;
  }

  private getSetInterval(): (handler: TimerHandler, timeout?: number, ...arguments_: unknown[]) => IntervalHandle {
    const currentWindow = this.getWindow();
    return currentWindow
      ? (handler: TimerHandler, timeout?: number, ...arguments_: unknown[]) =>
          currentWindow.setInterval(handler, timeout, ...arguments_)
      : (handler: TimerHandler, timeout?: number, ...arguments_: unknown[]) =>
          globalThis.setInterval(handler, timeout, ...arguments_) as unknown as IntervalHandle;
  }

  private getClearInterval(): (id: IntervalHandle | undefined) => void {
    const currentWindow = this.getWindow();
    return currentWindow
      ? (id: IntervalHandle | undefined) => {
          if (id !== undefined) {
            currentWindow.clearInterval(id);
          }
        }
      : (id: IntervalHandle | undefined) => {
          if (id !== undefined) {
            globalThis.clearInterval(id as unknown as ReturnType<typeof globalThis.setInterval>);
          }
        };
  }
}

export function createRuntimeClient(overrides: Partial<RuntimeClientDeps> = {}): RuntimeClient {
  return new RuntimeClient({
    api,
    buildReadTokenQueryParam,
    eventSourceFactory: (url: string) => new EventSource(url),
    store,
    ...overrides,
  });
}

let singleton: RuntimeClient | null = null;

export function getRuntimeClient(): RuntimeClient {
  singleton ??= createRuntimeClient();
  return singleton;
}

export function resetRuntimeClientForTesting(): void {
  singleton?.stop();
  singleton = null;
}
