import { describe, it, expect, vi, beforeEach } from "vitest";
import { TypedEventBus } from "../../src/core/event-bus.js";

/** Minimal event map for testing. */
interface TestEventMap {
  "user.created": { id: string; name: string };
  "user.deleted": { id: string };
  "system.ping": { ts: number };
}

describe("TypedEventBus", () => {
  let bus: TypedEventBus<TestEventMap>;

  beforeEach(() => {
    bus = new TypedEventBus<TestEventMap>();
  });

  // ── on / emit ────────────────────────────────────────────────────

  it("delivers a payload to a registered handler", () => {
    const handler = vi.fn();
    bus.on("user.created", handler);

    bus.emit("user.created", { id: "1", name: "Alice" });

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith({ id: "1", name: "Alice" });
  });

  it("calls multiple handlers on the same channel in registration order", () => {
    const order: number[] = [];
    bus.on("system.ping", () => order.push(1));
    bus.on("system.ping", () => order.push(2));
    bus.on("system.ping", () => order.push(3));

    bus.emit("system.ping", { ts: Date.now() });

    expect(order).toEqual([1, 2, 3]);
  });

  it("does not deliver events to handlers on other channels", () => {
    const handler = vi.fn();
    bus.on("user.created", handler);

    bus.emit("user.deleted", { id: "1" });

    expect(handler).not.toHaveBeenCalled();
  });

  it("handles emit on a channel with no listeners without throwing", () => {
    expect(() => bus.emit("system.ping", { ts: 0 })).not.toThrow();
  });

  // ── off ──────────────────────────────────────────────────────────

  it("removes a handler so it stops receiving events", () => {
    const handler = vi.fn();
    bus.on("user.deleted", handler);

    bus.off("user.deleted", handler);
    bus.emit("user.deleted", { id: "1" });

    expect(handler).not.toHaveBeenCalled();
  });

  it("only removes the specified handler, leaving others intact", () => {
    const kept = vi.fn();
    const removed = vi.fn();
    bus.on("system.ping", kept);
    bus.on("system.ping", removed);

    bus.off("system.ping", removed);
    bus.emit("system.ping", { ts: 0 });

    expect(kept).toHaveBeenCalledOnce();
    expect(removed).not.toHaveBeenCalled();
  });

  // ── once ─────────────────────────────────────────────────────────

  it("fires a once-handler exactly once", () => {
    const handler = vi.fn();
    bus.once("user.created", handler);

    bus.emit("user.created", { id: "1", name: "Bob" });
    bus.emit("user.created", { id: "2", name: "Carol" });

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith({ id: "1", name: "Bob" });
  });

  // ── onAny / offAny ──────────────────────────────────────────────

  it("delivers all events to a wildcard handler", () => {
    const handler = vi.fn();
    bus.onAny(handler);

    bus.emit("user.created", { id: "1", name: "Dave" });
    bus.emit("system.ping", { ts: 42 });

    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenCalledWith("user.created", { id: "1", name: "Dave" });
    expect(handler).toHaveBeenCalledWith("system.ping", { ts: 42 });
  });

  it("removes a wildcard handler via offAny", () => {
    const handler = vi.fn();
    bus.onAny(handler);

    bus.offAny(handler);
    bus.emit("system.ping", { ts: 0 });

    expect(handler).not.toHaveBeenCalled();
  });

  // ── destroy ──────────────────────────────────────────────────────

  it("clears all listeners on destroy", () => {
    const channelHandler = vi.fn();
    const wildcardHandler = vi.fn();
    bus.on("user.created", channelHandler);
    bus.onAny(wildcardHandler);

    bus.destroy();
    bus.emit("user.created", { id: "1", name: "Eve" });

    expect(channelHandler).not.toHaveBeenCalled();
    expect(wildcardHandler).not.toHaveBeenCalled();
  });

  // ── type safety (compile-time) ───────────────────────────────────

  it("enforces payload types at compile time (structural check)", () => {
    const handler = vi.fn<[{ id: string; name: string }]>();
    bus.on("user.created", handler);

    bus.emit("user.created", { id: "x", name: "Typed" });

    const received = handler.mock.calls[0]?.[0];
    expect(received).toHaveProperty("id");
    expect(received).toHaveProperty("name");
  });
});
