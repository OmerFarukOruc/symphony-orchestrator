import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { subscribeIssueEvents, type AgentEventPayload } from "../../frontend/src/state/event-source";

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
