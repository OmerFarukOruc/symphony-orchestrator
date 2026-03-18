import { describe, expect, it } from "vitest";

import {
  appendReasoningText,
  createTurnState,
  recordCompletedTurn,
  waitForTurnCompletion,
} from "../../src/agent-runner/turn-state.js";

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
});
