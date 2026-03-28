import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  subscribeIssueEvents,
  subscribeAllEvents,
  type AgentEventPayload,
} from "../../frontend/src/state/event-source";

// Provide a minimal window stub so subscribeIssueEvents can run in Node.
const fakeTarget = new EventTarget();
const originalWindow = global.window;
beforeEach(() => {
  // @ts-expect-error -- intentional stub for tests
  global.window = {
    addEventListener: fakeTarget.addEventListener.bind(fakeTarget),
    removeEventListener: fakeTarget.removeEventListener.bind(fakeTarget),
    dispatchEvent: fakeTarget.dispatchEvent.bind(fakeTarget),
  };
});
afterEach(() => {
  global.window = originalWindow;
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
  fakeTarget.dispatchEvent(new CustomEvent("symphony:agent-event", { detail: payload }));
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
    fakeTarget.dispatchEvent(new CustomEvent("symphony:any-event", { detail: { type, payload } }));
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
    fakeTarget.dispatchEvent(new CustomEvent("symphony:any-event", { detail: { type: "agent.event" } }));
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
