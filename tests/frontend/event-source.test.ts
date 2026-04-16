import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  connectEventSource,
  subscribeNotificationUpdates,
  subscribeIssueEvents,
  subscribeAllEvents,
  type AgentEventPayload,
} from "../../frontend/src/state/event-source";
import { resetRuntimeClientForTesting } from "../../frontend/src/state/runtime-client";

const fakeTarget = new EventTarget();
const originalWindow = global.window;
const originalEventSource = global.EventSource;

function createSessionStorageMock() {
  const store = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
    clear: vi.fn(() => store.clear()),
  };
}

beforeEach(() => {
  const sessionStorage = createSessionStorageMock();
  // @ts-expect-error -- intentional stub for tests
  global.window = {
    addEventListener: fakeTarget.addEventListener.bind(fakeTarget),
    removeEventListener: fakeTarget.removeEventListener.bind(fakeTarget),
    dispatchEvent: fakeTarget.dispatchEvent.bind(fakeTarget),
    sessionStorage,
    location: { href: "http://127.0.0.1:4000/" },
    history: { replaceState: vi.fn() },
  };
});

afterEach(() => {
  resetRuntimeClientForTesting();
  global.window = originalWindow;
  global.EventSource = originalEventSource;
  vi.restoreAllMocks();
});

function makePayload(overrides: Partial<AgentEventPayload> = {}): AgentEventPayload {
  return {
    issueId: "id-1",
    identifier: "ENG-1",
    type: "tool_use",
    message: "Running tests",
    sessionId: null,
    ...overrides,
  };
}

function dispatch(payload: AgentEventPayload): void {
  fakeTarget.dispatchEvent(new CustomEvent("risoluto:agent-event", { detail: payload }));
}

describe("subscribeIssueEvents", () => {
  let handler: ReturnType<typeof vi.fn>;
  let unsubscribe: () => void;

  beforeEach(() => {
    handler = vi.fn();
  });

  afterEach(() => {
    unsubscribe?.();
  });

  it("calls the handler when the identifier matches", () => {
    unsubscribe = subscribeIssueEvents("ENG-1", handler);
    dispatch(makePayload({ identifier: "ENG-1" }));
    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(makePayload({ identifier: "ENG-1" }));
  });

  it("ignores events for a different identifier", () => {
    unsubscribe = subscribeIssueEvents("ENG-1", handler);
    dispatch(makePayload({ identifier: "ENG-2" }));
    expect(handler).not.toHaveBeenCalled();
  });

  it("returns an unsubscribe function that stops further calls", () => {
    unsubscribe = subscribeIssueEvents("ENG-1", handler);
    unsubscribe();
    dispatch(makePayload({ identifier: "ENG-1" }));
    expect(handler).not.toHaveBeenCalled();
  });

  it("supports multiple independent subscriptions for the same identifier", () => {
    const handler2 = vi.fn();
    unsubscribe = subscribeIssueEvents("ENG-1", handler);
    const unsub2 = subscribeIssueEvents("ENG-1", handler2);
    dispatch(makePayload({ identifier: "ENG-1" }));
    expect(handler).toHaveBeenCalledOnce();
    expect(handler2).toHaveBeenCalledOnce();
    unsub2();
  });
});

describe("subscribeAllEvents", () => {
  let handler: ReturnType<typeof vi.fn>;
  let unsubscribe: () => void;

  function dispatchAnyEvent(type: string, payload: Record<string, unknown>): void {
    fakeTarget.dispatchEvent(new CustomEvent("risoluto:any-event", { detail: { type, payload } }));
  }

  beforeEach(() => {
    handler = vi.fn();
  });

  afterEach(() => {
    unsubscribe?.();
  });

  it("calls handler when identifier matches", () => {
    unsubscribe = subscribeAllEvents("ENG-1", handler);
    dispatchAnyEvent("agent.event", { identifier: "ENG-1", message: "hello" });
    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith({
      type: "agent.event",
      payload: { identifier: "ENG-1", message: "hello" },
    });
  });

  it("ignores events for a different identifier", () => {
    unsubscribe = subscribeAllEvents("ENG-1", handler);
    dispatchAnyEvent("agent.event", { identifier: "ENG-2", message: "hello" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("ignores events without a payload", () => {
    unsubscribe = subscribeAllEvents("ENG-1", handler);
    fakeTarget.dispatchEvent(new CustomEvent("risoluto:any-event", { detail: { type: "agent.event" } }));
    expect(handler).not.toHaveBeenCalled();
  });

  it("returns an unsubscribe function that stops further calls", () => {
    unsubscribe = subscribeAllEvents("ENG-1", handler);
    unsubscribe();
    dispatchAnyEvent("agent.event", { identifier: "ENG-1", message: "hello" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("forwards the event type along with the payload", () => {
    unsubscribe = subscribeAllEvents("ENG-1", handler);
    dispatchAnyEvent("issue.started", { identifier: "ENG-1", status: "running" });
    dispatchAnyEvent("worker.failed", { identifier: "ENG-1", error: "timeout" });
    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenNthCalledWith(1, {
      type: "issue.started",
      payload: { identifier: "ENG-1", status: "running" },
    });
    expect(handler).toHaveBeenNthCalledWith(2, {
      type: "worker.failed",
      payload: { identifier: "ENG-1", error: "timeout" },
    });
  });
});

describe("subscribeNotificationUpdates", () => {
  it("calls the handler for both created and updated notification events", () => {
    const handler = vi.fn();
    const unsubscribe = subscribeNotificationUpdates(handler);

    fakeTarget.dispatchEvent(new CustomEvent("risoluto:notification-created"));
    fakeTarget.dispatchEvent(new CustomEvent("risoluto:notification-updated"));

    expect(handler).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it("returns an unsubscribe function that removes both listeners", () => {
    const handler = vi.fn();
    const unsubscribe = subscribeNotificationUpdates(handler);

    unsubscribe();
    fakeTarget.dispatchEvent(new CustomEvent("risoluto:notification-created"));
    fakeTarget.dispatchEvent(new CustomEvent("risoluto:notification-updated"));

    expect(handler).not.toHaveBeenCalled();
  });
});

describe("connectEventSource", () => {
  it("appends the stored read token to the SSE URL", () => {
    const eventSourceSpy = vi.fn();
    class EventSourceMock {
      close = vi.fn();
      onopen: ((this: EventSource, ev: Event) => unknown) | null = null;
      onmessage: ((this: EventSource, ev: MessageEvent) => unknown) | null = null;
      onerror: ((this: EventSource, ev: Event) => unknown) | null = null;

      constructor(url: string) {
        eventSourceSpy(url);
      }
    }
    global.EventSource = EventSourceMock as unknown as typeof EventSource;
    // @ts-expect-error test override
    global.window.location.href = "http://127.0.0.1:4000/?read_token=read-secret";

    connectEventSource();

    expect(eventSourceSpy).toHaveBeenCalledWith("/api/v1/events?read_token=read-secret");
    expect(global.window.history.replaceState).toHaveBeenCalled();
  });
});
