import { describe, expect, it, vi } from "vitest";

import { TypedEventBus } from "../../src/core/event-bus.js";

interface TestMap {
  "task.started": { id: string };
  "task.finished": { id: string; result: string };
  "system.tick": { ms: number };
}

// ── on + emit ─────────────────────────────────────────────────────────────────

describe("TypedEventBus — on/emit — integration", () => {
  it("calls handler with correct payload", () => {
    const bus = new TypedEventBus<TestMap>();
    const handler = vi.fn();

    bus.on("task.started", handler);
    bus.emit("task.started", { id: "abc" });

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith({ id: "abc" });
  });

  it("calls all handlers registered on the same channel", () => {
    const bus = new TypedEventBus<TestMap>();
    const first = vi.fn();
    const second = vi.fn();
    const third = vi.fn();

    bus.on("system.tick", first);
    bus.on("system.tick", second);
    bus.on("system.tick", third);

    bus.emit("system.tick", { ms: 1000 });

    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
    expect(third).toHaveBeenCalledOnce();
  });

  it("does not call handlers on other channels", () => {
    const bus = new TypedEventBus<TestMap>();
    const handler = vi.fn();

    bus.on("task.started", handler);
    bus.emit("task.finished", { id: "x", result: "ok" });

    expect(handler).not.toHaveBeenCalled();
  });
});

// ── off ───────────────────────────────────────────────────────────────────────

describe("TypedEventBus — off — integration", () => {
  it("stops calling a handler after it is removed", () => {
    const bus = new TypedEventBus<TestMap>();
    const handler = vi.fn();

    bus.on("task.started", handler);
    bus.off("task.started", handler);
    bus.emit("task.started", { id: "1" });

    expect(handler).not.toHaveBeenCalled();
  });

  it("only removes the specified handler, leaving others intact", () => {
    const bus = new TypedEventBus<TestMap>();
    const kept = vi.fn();
    const removed = vi.fn();

    bus.on("system.tick", kept);
    bus.on("system.tick", removed);

    bus.off("system.tick", removed);
    bus.emit("system.tick", { ms: 0 });

    expect(kept).toHaveBeenCalledOnce();
    expect(removed).not.toHaveBeenCalled();
  });

  it("is a no-op when called for a handler that was never registered", () => {
    const bus = new TypedEventBus<TestMap>();
    const handler = vi.fn();

    expect(() => bus.off("task.started", handler)).not.toThrow();
    bus.emit("task.started", { id: "2" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("is a no-op when called for a channel with no listeners at all", () => {
    const bus = new TypedEventBus<TestMap>();
    const handler = vi.fn();

    expect(() => bus.off("system.tick", handler)).not.toThrow();
  });
});

// ── once ──────────────────────────────────────────────────────────────────────

describe("TypedEventBus — once — integration", () => {
  it("fires the handler exactly once on the first emit", () => {
    const bus = new TypedEventBus<TestMap>();
    const handler = vi.fn();

    bus.once("task.started", handler);
    bus.emit("task.started", { id: "first" });
    bus.emit("task.started", { id: "second" });

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith({ id: "first" });
  });

  it("receives the correct payload on that single call", () => {
    const bus = new TypedEventBus<TestMap>();
    const received: Array<{ id: string }> = [];

    bus.once("task.started", (payload) => received.push(payload));
    bus.emit("task.started", { id: "only-one" });
    bus.emit("task.started", { id: "ignored" });

    expect(received).toEqual([{ id: "only-one" }]);
  });

  it("auto-unsubscribes even when the handler throws", () => {
    const bus = new TypedEventBus<TestMap>();
    let callCount = 0;

    bus.once("task.started", () => {
      callCount++;
      throw new Error("boom");
    });

    expect(() => bus.emit("task.started", { id: "err" })).toThrow("boom");
    // handler was already removed before the throw, so second emit is silent
    expect(() => bus.emit("task.started", { id: "safe" })).not.toThrow();
    expect(callCount).toBe(1);
  });

  it("coexists with a permanent on() handler on the same channel", () => {
    const bus = new TypedEventBus<TestMap>();
    const permanent = vi.fn();
    const disposable = vi.fn();

    bus.on("system.tick", permanent);
    bus.once("system.tick", disposable);

    bus.emit("system.tick", { ms: 1 });
    bus.emit("system.tick", { ms: 2 });

    expect(permanent).toHaveBeenCalledTimes(2);
    expect(disposable).toHaveBeenCalledOnce();
  });
});

// ── onAny / offAny ────────────────────────────────────────────────────────────

describe("TypedEventBus — onAny/offAny — integration", () => {
  it("wildcard handler receives channel name and payload for every emit", () => {
    const bus = new TypedEventBus<TestMap>();
    const calls: Array<[keyof TestMap, unknown]> = [];

    bus.onAny((channel, payload) => calls.push([channel, payload]));

    bus.emit("task.started", { id: "t1" });
    bus.emit("task.finished", { id: "t1", result: "done" });
    bus.emit("system.tick", { ms: 100 });

    expect(calls).toEqual([
      ["task.started", { id: "t1" }],
      ["task.finished", { id: "t1", result: "done" }],
      ["system.tick", { ms: 100 }],
    ]);
  });

  it("wildcard handler and channel-specific handler both fire on the same emit", () => {
    const bus = new TypedEventBus<TestMap>();
    const specific = vi.fn();
    const wildcard = vi.fn();

    bus.on("task.started", specific);
    bus.onAny(wildcard);

    bus.emit("task.started", { id: "both" });

    expect(specific).toHaveBeenCalledOnce();
    expect(wildcard).toHaveBeenCalledOnce();
    expect(wildcard).toHaveBeenCalledWith("task.started", { id: "both" });
  });

  it("offAny stops the wildcard handler from receiving further events", () => {
    const bus = new TypedEventBus<TestMap>();
    const handler = vi.fn();

    bus.onAny(handler);
    bus.offAny(handler);

    bus.emit("task.started", { id: "x" });

    expect(handler).not.toHaveBeenCalled();
  });

  it("offAny only removes the specified wildcard handler", () => {
    const bus = new TypedEventBus<TestMap>();
    const kept = vi.fn();
    const removed = vi.fn();

    bus.onAny(kept);
    bus.onAny(removed);

    bus.offAny(removed);
    bus.emit("system.tick", { ms: 0 });

    expect(kept).toHaveBeenCalledOnce();
    expect(removed).not.toHaveBeenCalled();
  });

  it("offAny is a no-op when the handler was never registered", () => {
    const bus = new TypedEventBus<TestMap>();
    const handler = vi.fn();

    expect(() => bus.offAny(handler)).not.toThrow();
  });

  it("multiple wildcard handlers all receive the event", () => {
    const bus = new TypedEventBus<TestMap>();
    const first = vi.fn();
    const second = vi.fn();

    bus.onAny(first);
    bus.onAny(second);

    bus.emit("system.tick", { ms: 5 });

    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
  });
});

// ── emit edge cases ───────────────────────────────────────────────────────────

describe("TypedEventBus — emit edge cases — integration", () => {
  it("does not throw when emitting to a channel with no listeners", () => {
    const bus = new TypedEventBus<TestMap>();

    expect(() => bus.emit("task.started", { id: "nobody" })).not.toThrow();
  });

  it("does not throw when emitting to a channel after all listeners are removed", () => {
    const bus = new TypedEventBus<TestMap>();
    const handler = vi.fn();

    bus.on("system.tick", handler);
    bus.off("system.tick", handler);

    expect(() => bus.emit("system.tick", { ms: 0 })).not.toThrow();
    expect(handler).not.toHaveBeenCalled();
  });
});

// ── destroy ───────────────────────────────────────────────────────────────────

describe("TypedEventBus — destroy — integration", () => {
  it("clears all channel-specific handlers", () => {
    const bus = new TypedEventBus<TestMap>();
    const handler = vi.fn();

    bus.on("task.started", handler);
    bus.destroy();
    bus.emit("task.started", { id: "post-destroy" });

    expect(handler).not.toHaveBeenCalled();
  });

  it("clears all wildcard handlers", () => {
    const bus = new TypedEventBus<TestMap>();
    const wildcard = vi.fn();

    bus.onAny(wildcard);
    bus.destroy();
    bus.emit("task.started", { id: "post-destroy" });

    expect(wildcard).not.toHaveBeenCalled();
  });

  it("clears both channel and wildcard handlers in one call", () => {
    const bus = new TypedEventBus<TestMap>();
    const channelHandler = vi.fn();
    const wildcardHandler = vi.fn();

    bus.on("system.tick", channelHandler);
    bus.onAny(wildcardHandler);

    bus.destroy();

    bus.emit("system.tick", { ms: 99 });
    expect(channelHandler).not.toHaveBeenCalled();
    expect(wildcardHandler).not.toHaveBeenCalled();
  });

  it("allows re-registration after destroy", () => {
    const bus = new TypedEventBus<TestMap>();
    const handler = vi.fn();

    bus.on("task.started", handler);
    bus.destroy();

    bus.on("task.started", handler);
    bus.emit("task.started", { id: "re-registered" });

    expect(handler).toHaveBeenCalledOnce();
  });

  it("does not throw when called on an already-destroyed bus", () => {
    const bus = new TypedEventBus<TestMap>();
    bus.destroy();

    expect(() => bus.destroy()).not.toThrow();
  });
});
