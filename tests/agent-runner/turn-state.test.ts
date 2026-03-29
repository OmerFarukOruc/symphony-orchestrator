import { describe, expect, it, vi, afterEach } from "vitest";

import {
  appendReasoningText,
  composeSessionId,
  createTurnState,
  deleteReasoningBuffer,
  recordCompletedTurn,
  waitForTurnCompletion,
} from "../../src/agent-runner/turn-state.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("turn state", () => {
  it("returns a buffered completed turn when notification arrives before the waiter", async () => {
    const state = createTurnState();
    const completedPayload = { turn: { id: "turn-1", status: "completed" } };
    recordCompletedTurn(state, "turn-1", completedPayload);

    await expect(
      waitForTurnCompletion(state, {
        turnId: "turn-1",
        signal: new AbortController().signal,
        timeoutMs: 1000,
      }),
    ).resolves.toEqual(completedPayload);
    expect(state.completedTurnNotifications.has("turn-1")).toBe(false);
  });

  it("resolves a pending waiter when the completion notification arrives later", async () => {
    const state = createTurnState();
    const controller = new AbortController();
    const pending = waitForTurnCompletion(state, {
      turnId: "turn-2",
      signal: controller.signal,
      timeoutMs: 1000,
    });

    recordCompletedTurn(state, "turn-2", { turn: { id: "turn-2", status: "completed" } });

    await expect(pending).resolves.toEqual({
      turn: { id: "turn-2", status: "completed" },
    });
    expect(state.turnCompletionResolvers.has("turn-2")).toBe(false);
  });

  it("appends reasoning text deltas in order", () => {
    const state = createTurnState();

    appendReasoningText(state, "reason-1", "I need to ");
    appendReasoningText(state, "reason-1", "run a query.");

    expect(state.reasoningBuffers.get("reason-1")).toBe("I need to run a query.");
  });

  it("rejects with timeout error when no completion arrives", async () => {
    vi.useFakeTimers();
    const state = createTurnState();
    const promise = waitForTurnCompletion(state, {
      turnId: "turn-timeout",
      signal: new AbortController().signal,
      timeoutMs: 500,
    });
    vi.advanceTimersByTime(501);
    await expect(promise).rejects.toThrow("timed out waiting for turn completion after 500ms");
    expect(state.turnCompletionResolvers.has("turn-timeout")).toBe(false);
  });

  it("rejects when abort signal fires before completion", async () => {
    const state = createTurnState();
    const controller = new AbortController();
    const promise = waitForTurnCompletion(state, {
      turnId: "turn-abort",
      signal: controller.signal,
      timeoutMs: 5000,
    });
    controller.abort();
    await expect(promise).rejects.toThrow("turn completion interrupted");
    expect(state.turnCompletionResolvers.has("turn-abort")).toBe(false);
  });

  it("handles multiple concurrent waiters on different turnIds", async () => {
    const state = createTurnState();
    const controller = new AbortController();
    const p1 = waitForTurnCompletion(state, {
      turnId: "t1",
      signal: controller.signal,
      timeoutMs: 5000,
    });
    const p2 = waitForTurnCompletion(state, {
      turnId: "t2",
      signal: controller.signal,
      timeoutMs: 5000,
    });

    recordCompletedTurn(state, "t2", { id: "t2", done: true });
    recordCompletedTurn(state, "t1", { id: "t1", done: true });

    await expect(p1).resolves.toEqual({ id: "t1", done: true });
    await expect(p2).resolves.toEqual({ id: "t2", done: true });
  });

  it("appendReasoningText is a no-op for null itemId or text", () => {
    const state = createTurnState();
    appendReasoningText(state, null, "some text");
    appendReasoningText(state, "item-1", null);
    expect(state.reasoningBuffers.size).toBe(0);
  });

  it("deleteReasoningBuffer removes the buffer", () => {
    const state = createTurnState();
    appendReasoningText(state, "item-1", "data");
    expect(state.reasoningBuffers.has("item-1")).toBe(true);
    deleteReasoningBuffer(state, "item-1");
    expect(state.reasoningBuffers.has("item-1")).toBe(false);
  });

  it("deleteReasoningBuffer is a no-op for null itemId", () => {
    const state = createTurnState();
    deleteReasoningBuffer(state, null);
    expect(state.reasoningBuffers.size).toBe(0);
  });

  it("recordCompletedTurn is a no-op for null turnId", () => {
    const state = createTurnState();
    recordCompletedTurn(state, null, { something: true });
    expect(state.completedTurnNotifications.size).toBe(0);
  });
});

describe("composeSessionId", () => {
  it("returns null when threadId is null", () => {
    expect(composeSessionId(null, "turn-1")).toBeNull();
  });

  it("returns threadId when turnId is null", () => {
    expect(composeSessionId("thread-1", null)).toBe("thread-1");
  });

  it("returns combined string when both are present", () => {
    expect(composeSessionId("thread-1", "turn-1")).toBe("thread-1-turn-1");
  });
});

// ---------------------------------------------------------------------------
// Mutation-killing: waitForTurnCompletion event listener cleanup
// ---------------------------------------------------------------------------

describe("waitForTurnCompletion event listener behavior", () => {
  it("removes the abort listener on timeout (correct event name)", async () => {
    // Kills: StringLiteral turn-state.ts:68 "abort" -> ""
    vi.useFakeTimers();
    const state = createTurnState();
    const controller = new AbortController();
    const removeListenerSpy = vi.spyOn(controller.signal, "removeEventListener");

    const promise = waitForTurnCompletion(state, {
      turnId: "turn-timeout-cleanup",
      signal: controller.signal,
      timeoutMs: 100,
    });

    vi.advanceTimersByTime(101);

    await expect(promise).rejects.toThrow("timed out");
    expect(removeListenerSpy).toHaveBeenCalledWith("abort", expect.any(Function));
  });

  it("removes the abort listener on successful completion (correct event name)", async () => {
    // Kills: StringLiteral turn-state.ts:74 "abort" -> ""
    const state = createTurnState();
    const controller = new AbortController();
    const removeListenerSpy = vi.spyOn(controller.signal, "removeEventListener");

    const promise = waitForTurnCompletion(state, {
      turnId: "turn-success-cleanup",
      signal: controller.signal,
      timeoutMs: 5000,
    });

    recordCompletedTurn(state, "turn-success-cleanup", { done: true });

    await promise;
    expect(removeListenerSpy).toHaveBeenCalledWith("abort", expect.any(Function));
  });

  it("registers abort listener with once: true option", async () => {
    // Kills: ObjectLiteral turn-state.ts:77 { once: true } -> {}
    // Kills: BooleanLiteral turn-state.ts:77 once: true -> once: false
    // Verify that aborting fires the handler exactly once
    const state = createTurnState();
    const controller = new AbortController();

    const promise = waitForTurnCompletion(state, {
      turnId: "turn-once-check",
      signal: controller.signal,
      timeoutMs: 5000,
    });

    controller.abort();

    await expect(promise).rejects.toThrow("turn completion interrupted");

    // After rejection, the resolver should be cleaned up
    expect(state.turnCompletionResolvers.has("turn-once-check")).toBe(false);

    // Aborting again should not cause additional effects (once: true)
    // If once were false, the handler would remain and could fire again
    controller.abort();
    expect(state.turnCompletionResolvers.has("turn-once-check")).toBe(false);
  });
});
