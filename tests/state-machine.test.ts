import { describe, expect, it } from "vitest";

import { StateMachine, createDefaultStateMachine } from "../src/state-machine.js";

describe("StateMachine", () => {
  it("builds a default machine with known states", () => {
    const machine = createDefaultStateMachine();
    expect(machine.isKnownState("todo")).toBe(true);
    expect(machine.isKnownState("in progress")).toBe(true);
    expect(machine.isTerminalState("done")).toBe(true);
  });

  it("accepts transitions from non-terminal stages by default", () => {
    const machine = new StateMachine({
      stages: ["todo", "in progress", "done"],
      terminalStates: ["done"],
    });
    expect(machine.canTransition("todo", "in progress")).toBe(true);
    expect(machine.canTransition("in progress", "done")).toBe(true);
  });

  it("blocks terminal-to-active transitions by default", () => {
    const machine = new StateMachine({
      stages: ["todo", "in progress", "done"],
      terminalStates: ["done"],
    });
    expect(machine.canTransition("done", "in progress")).toBe(false);
    expect(machine.canTransition("done", "done")).toBe(true);
  });

  it("supports explicit transition maps", () => {
    const machine = new StateMachine({
      stages: ["todo", "in progress", "review", "done"],
      terminalStates: ["done"],
      transitions: {
        todo: ["in progress"],
        "in progress": ["review"],
        review: ["done", "in progress"],
      },
    });

    expect(machine.canTransition("todo", "review")).toBe(false);
    expect(machine.canTransition("in progress", "review")).toBe(true);
    expect(machine.canTransition("review", "done")).toBe(true);
  });

  it("returns a readable assertion error for invalid moves", () => {
    const machine = new StateMachine({
      stages: ["todo", "done"],
      terminalStates: ["done"],
      transitions: { todo: ["done"] },
    });

    expect(machine.assertTransition("todo", "done")).toEqual({ ok: true });
    expect(machine.assertTransition("done", "todo")).toEqual({
      ok: false,
      reason: "invalid transition: done -> todo",
    });
  });
});
