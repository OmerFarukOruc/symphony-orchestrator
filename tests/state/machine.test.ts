import { describe, expect, it } from "vitest";

import {
  DEFAULT_ACTIVE_STATES,
  DEFAULT_TERMINAL_STATES,
  StateMachine,
  createDefaultStateMachine,
} from "../../src/state/machine.js";

describe("StateMachine", () => {
  it("exports the expected default active and terminal states", () => {
    expect(DEFAULT_ACTIVE_STATES).toEqual(["Backlog", "Todo", "In Progress"]);
    expect(DEFAULT_TERMINAL_STATES).toEqual(["Done", "Canceled"]);
  });

  it("builds a default machine with known states", () => {
    const machine = createDefaultStateMachine();
    expect(machine.isKnownState("todo")).toBe(true);
    expect(machine.isKnownState("in progress")).toBe(true);
    expect(machine.isTerminalState("done")).toBe(true);
    expect(machine.isKnownState("  In Progress  ")).toBe(true);
    expect(machine.isTerminalState("  Done  ")).toBe(true);
  });

  it("builds the exact default stage list from the exported defaults", () => {
    expect(createDefaultStateMachine().getStages()).toEqual([
      { key: "backlog", terminal: false },
      { key: "todo", terminal: false },
      { key: "in progress", terminal: false },
      { key: "done", terminal: true },
      { key: "canceled", terminal: true },
    ]);
    expect(new StateMachine().getStages()).toEqual([
      { key: "backlog", terminal: false },
      { key: "todo", terminal: false },
      { key: "in progress", terminal: false },
      { key: "done", terminal: true },
      { key: "canceled", terminal: true },
    ]);
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

  it("returns readable assertion errors for unknown source and target states", () => {
    const machine = new StateMachine({
      stages: ["todo", "done"],
      terminalStates: ["done"],
      transitions: { todo: ["done"] },
    });

    expect(machine.assertTransition("ghost", "todo")).toEqual({
      ok: false,
      reason: "unknown source state: ghost",
    });
    expect(machine.assertTransition("todo", "phantom")).toEqual({
      ok: false,
      reason: "unknown target state: phantom",
    });
  });

  it("rejects transitions when either side is unknown", () => {
    const machine = new StateMachine({ stages: ["open", "done"], terminalStates: ["done"] });

    expect(machine.canTransition("ghost", "open")).toBe(false);
    expect(machine.canTransition("open", "phantom")).toBe(false);
    expect(machine.canTransition("ghost", "phantom")).toBe(false);
    expect(machine.canTransition("ghost", "ghost")).toBe(false);
  });

  it("includes gate stages in known states", () => {
    const machine = new StateMachine({
      stages: [
        { key: "todo", terminal: false },
        { key: "in progress", terminal: false },
        { key: "gate review", terminal: false },
        { key: "done", terminal: true },
      ],
    });
    expect(machine.isKnownState("gate review")).toBe(true);
    expect(machine.isTerminalState("gate review")).toBe(false);
  });

  it("allows transitions to and from gate stages", () => {
    const machine = new StateMachine({
      stages: [
        { key: "todo", terminal: false },
        { key: "in progress", terminal: false },
        { key: "gate review", terminal: false },
        { key: "done", terminal: true },
      ],
      transitions: {
        todo: ["in progress"],
        "in progress": ["gate review"],
        "gate review": ["done", "in progress"],
      },
    });
    expect(machine.canTransition("in progress", "gate review")).toBe(true);
    expect(machine.canTransition("gate review", "done")).toBe(true);
    expect(machine.canTransition("gate review", "in progress")).toBe(true);
    expect(machine.canTransition("todo", "gate review")).toBe(false);
  });

  it("gate stages do not block re-entry by default (no explicit transitions)", () => {
    const machine = new StateMachine({
      stages: [
        { key: "todo", terminal: false },
        { key: "gate review", terminal: false },
        { key: "done", terminal: true },
      ],
    });
    // Without explicit transitions, non-terminal stages can go anywhere
    expect(machine.canTransition("gate review", "todo")).toBe(true);
    expect(machine.canTransition("gate review", "done")).toBe(true);
    // Terminal stages cannot go back
    expect(machine.canTransition("done", "gate review")).toBe(false);
  });

  it("skips blank string stage entries when stages are provided directly", () => {
    const machine = new StateMachine({
      stages: ["  ", "Open", "Done"],
      terminalStates: ["done"],
    });

    expect(machine.getStages()).toEqual([
      { key: "open", terminal: false },
      { key: "done", terminal: true },
    ]);
  });

  it("skips empty-key object stage entries", () => {
    const machine = new StateMachine({
      stages: [
        { key: "  ", terminal: false },
        { key: "Open", terminal: false },
        { key: "Done", terminal: true },
      ],
    });

    expect(machine.getStages()).toEqual([
      { key: "open", terminal: false },
      { key: "done", terminal: true },
    ]);
  });

  it("falls back to self-transition only when the explicit map is non-empty but contains no known sources", () => {
    const machine = new StateMachine({
      stages: ["open", "done"],
      terminalStates: ["done"],
      transitions: {
        ghost: ["open"],
      },
    });

    expect(machine.canTransition("open", "open")).toBe(true);
    expect(machine.canTransition("open", "done")).toBe(false);
    expect(machine.canTransition("done", "done")).toBe(true);
  });

  it("ignores unknown target states even when they are listed in explicit transitions", () => {
    const machine = new StateMachine({
      stages: ["open", "done"],
      terminalStates: ["done"],
      transitions: {
        open: ["done", "phantom"],
      },
    });

    expect(machine.canTransition("open", "done")).toBe(true);
    expect(machine.canTransition("open", "phantom")).toBe(false);
  });

  it("falls back to default transitions when explicit transitions is empty", () => {
    const machine = new StateMachine({
      stages: ["open", "done"],
      terminalStates: ["done"],
      transitions: {},
    });

    expect(machine.canTransition("open", "done")).toBe(true);
    expect(machine.canTransition("done", "open")).toBe(false);
  });

  it("falls back to active and terminal states when stages is an empty array", () => {
    const machine = new StateMachine({
      stages: [],
      activeStates: ["Ready"],
      terminalStates: ["Closed"],
    });

    expect(machine.getStages()).toEqual([
      { key: "ready", terminal: false },
      { key: "closed", terminal: true },
    ]);
    expect(machine.canTransition("ready", "closed")).toBe(true);
  });
});
