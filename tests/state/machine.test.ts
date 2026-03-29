import { describe, expect, it } from "vitest";

import { StateMachine, createDefaultStateMachine } from "../../src/state/machine.js";

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

  // -------------------------------------------------------------------------
  // Mutation-killing: normalizeState trim + lowercase
  // -------------------------------------------------------------------------

  it("normalizes state names with trim and lowercase", () => {
    const machine = new StateMachine({
      stages: ["Todo", "Done"],
      terminalStates: ["Done"],
    });
    expect(machine.isKnownState("  TODO  ")).toBe(true);
    expect(machine.isKnownState("  todo  ")).toBe(true);
    expect(machine.isKnownState("DONE")).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Mutation-killing: uniqueStates deduplication and empty filtering
  // -------------------------------------------------------------------------

  it("deduplicates states in activeStates and terminalStates", () => {
    const machine = new StateMachine({
      activeStates: ["Todo", "todo", "TODO"],
      terminalStates: ["Done", "done"],
    });
    const stages = machine.getStages();
    const todoStages = stages.filter((s) => s.key === "todo");
    expect(todoStages).toHaveLength(1);
    const doneStages = stages.filter((s) => s.key === "done");
    expect(doneStages).toHaveLength(1);
  });

  it("filters empty strings from states", () => {
    const machine = new StateMachine({
      activeStates: ["", "  ", "Todo"],
      terminalStates: ["Done", ""],
    });
    const stages = machine.getStages();
    expect(stages.length).toBe(2);
    expect(stages.map((s) => s.key)).toEqual(["todo", "done"]);
  });

  // -------------------------------------------------------------------------
  // Mutation-killing: toStageRecord empty string filtering from input stages
  // -------------------------------------------------------------------------

  it("filters empty-string keys from explicit stages array", () => {
    const machine = new StateMachine({
      stages: ["", "todo", "  ", "done"],
      terminalStates: ["done"],
    });
    const stages = machine.getStages();
    expect(stages.map((s) => s.key)).toEqual(["todo", "done"]);
  });

  it("filters empty-string keys from object stages array", () => {
    const machine = new StateMachine({
      stages: [
        { key: "", terminal: false },
        { key: "todo", terminal: false },
        { key: "  ", terminal: false },
        { key: "done", terminal: true },
      ],
    });
    const stages = machine.getStages();
    expect(stages.map((s) => s.key)).toEqual(["todo", "done"]);
  });

  // -------------------------------------------------------------------------
  // Mutation-killing: toStageRecord terminal flag from terminalStates
  // -------------------------------------------------------------------------

  it("marks string stages as terminal when they appear in terminalStates", () => {
    const machine = new StateMachine({
      stages: ["todo", "in progress", "done"],
      terminalStates: ["done"],
    });
    const stages = machine.getStages();
    expect(stages.find((s) => s.key === "done")?.terminal).toBe(true);
    expect(stages.find((s) => s.key === "todo")?.terminal).toBe(false);
    expect(stages.find((s) => s.key === "in progress")?.terminal).toBe(false);
  });

  it("object stages use their own terminal flag, ignoring terminalStates", () => {
    const machine = new StateMachine({
      stages: [
        { key: "todo", terminal: false },
        { key: "done", terminal: true },
      ],
      terminalStates: ["todo"], // should be ignored for object stages
    });
    const stages = machine.getStages();
    expect(stages.find((s) => s.key === "todo")?.terminal).toBe(false);
    expect(stages.find((s) => s.key === "done")?.terminal).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Mutation-killing: toStageRecord deduplication of input stages
  // -------------------------------------------------------------------------

  it("deduplicates stages in explicit stages array", () => {
    const machine = new StateMachine({
      stages: ["todo", "TODO", "Todo"],
    });
    const stages = machine.getStages();
    expect(stages).toHaveLength(1);
    expect(stages[0].key).toBe("todo");
  });

  // -------------------------------------------------------------------------
  // Mutation-killing: buildExplicitTransitions normalizeState + known check
  // -------------------------------------------------------------------------

  it("ignores transitions from unknown states in explicit transitions", () => {
    const machine = new StateMachine({
      stages: ["todo", "done"],
      terminalStates: ["done"],
      transitions: {
        todo: ["done"],
        "unknown state": ["todo"],
      },
    });
    // "unknown state" is not in stages, so its transitions should be ignored
    expect(machine.canTransition("todo", "done")).toBe(true);
  });

  it("ignores transitions to unknown target states in explicit transitions", () => {
    const machine = new StateMachine({
      stages: ["todo", "done"],
      terminalStates: ["done"],
      transitions: {
        todo: ["done", "unknown target"],
      },
    });
    expect(machine.canTransition("todo", "done")).toBe(true);
    expect(machine.isKnownState("unknown target")).toBe(false);
  });

  it("explicit transitions always allow self-transition", () => {
    const machine = new StateMachine({
      stages: ["todo", "in progress", "done"],
      terminalStates: ["done"],
      transitions: {
        todo: ["in progress"], // does not list "todo" explicitly
      },
    });
    // Self-transition is always added for explicit transitions
    expect(machine.canTransition("todo", "todo")).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Mutation-killing: buildDefaultTransitions terminal behavior
  // -------------------------------------------------------------------------

  it("terminal stages can only self-transition in default transitions", () => {
    const machine = new StateMachine({
      stages: [
        { key: "todo", terminal: false },
        { key: "in progress", terminal: false },
        { key: "done", terminal: true },
        { key: "canceled", terminal: true },
      ],
    });
    // Terminal stages only allow self-transition
    expect(machine.canTransition("done", "done")).toBe(true);
    expect(machine.canTransition("done", "todo")).toBe(false);
    expect(machine.canTransition("done", "in progress")).toBe(false);
    expect(machine.canTransition("canceled", "canceled")).toBe(true);
    expect(machine.canTransition("canceled", "todo")).toBe(false);

    // Non-terminal stages can go anywhere
    expect(machine.canTransition("todo", "done")).toBe(true);
    expect(machine.canTransition("todo", "canceled")).toBe(true);
    expect(machine.canTransition("in progress", "todo")).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Mutation-killing: canTransition unknown state handling
  // -------------------------------------------------------------------------

  it("canTransition returns false when 'from' state is unknown", () => {
    const machine = new StateMachine({
      stages: ["todo", "done"],
      terminalStates: ["done"],
    });
    expect(machine.canTransition("unknown", "todo")).toBe(false);
  });

  it("canTransition returns false when 'to' state is unknown", () => {
    const machine = new StateMachine({
      stages: ["todo", "done"],
      terminalStates: ["done"],
    });
    expect(machine.canTransition("todo", "unknown")).toBe(false);
  });

  it("canTransition allows self-transition when no transition map entry exists", () => {
    // Tests the fallback: normalizedFrom === normalizedTo when allowed is undefined
    const machine = new StateMachine({
      stages: ["todo", "in progress", "done"],
      terminalStates: ["done"],
      transitions: {
        todo: ["in progress"],
        // "in progress" has no explicit entry
      },
    });
    // "in progress" has no explicit transition map entry
    // The fallback should allow self-transition
    expect(machine.canTransition("in progress", "in progress")).toBe(true);
    expect(machine.canTransition("in progress", "todo")).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Mutation-killing: assertTransition error messages
  // -------------------------------------------------------------------------

  it("assertTransition returns unknown source state error", () => {
    const machine = new StateMachine({
      stages: ["todo", "done"],
      terminalStates: ["done"],
    });
    const result = machine.assertTransition("unknown", "todo");
    expect(result).toEqual({ ok: false, reason: "unknown source state: unknown" });
  });

  it("assertTransition returns unknown target state error", () => {
    const machine = new StateMachine({
      stages: ["todo", "done"],
      terminalStates: ["done"],
    });
    const result = machine.assertTransition("todo", "unknown");
    expect(result).toEqual({ ok: false, reason: "unknown target state: unknown" });
  });

  it("assertTransition returns invalid transition error with normalized state names", () => {
    const machine = new StateMachine({
      stages: ["todo", "done"],
      terminalStates: ["done"],
      transitions: { todo: ["done"] },
    });
    const result = machine.assertTransition("Done", "Todo");
    expect(result).toEqual({ ok: false, reason: "invalid transition: done -> todo" });
  });

  // -------------------------------------------------------------------------
  // Mutation-killing: getStages returns copies
  // -------------------------------------------------------------------------

  it("getStages returns defensive copies of stage objects", () => {
    const machine = new StateMachine({
      stages: [{ key: "todo", terminal: false }],
    });
    const stages1 = machine.getStages();
    const stages2 = machine.getStages();
    expect(stages1).toEqual(stages2);
    expect(stages1[0]).not.toBe(stages2[0]); // Different object references
  });

  // -------------------------------------------------------------------------
  // Mutation-killing: isTerminalState uses .some correctly
  // -------------------------------------------------------------------------

  it("isTerminalState returns true only for terminal stages", () => {
    const machine = new StateMachine({
      stages: [
        { key: "todo", terminal: false },
        { key: "done", terminal: true },
      ],
    });
    expect(machine.isTerminalState("done")).toBe(true);
    expect(machine.isTerminalState("todo")).toBe(false);
    expect(machine.isTerminalState("unknown")).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Mutation-killing: empty config defaults
  // -------------------------------------------------------------------------

  it("uses default active and terminal states when config is empty", () => {
    const machine = new StateMachine();
    expect(machine.isKnownState("Backlog")).toBe(true);
    expect(machine.isKnownState("Todo")).toBe(true);
    expect(machine.isKnownState("In Progress")).toBe(true);
    expect(machine.isKnownState("Done")).toBe(true);
    expect(machine.isKnownState("Canceled")).toBe(true);
    expect(machine.isTerminalState("Done")).toBe(true);
    expect(machine.isTerminalState("Canceled")).toBe(true);
    expect(machine.isTerminalState("Backlog")).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Mutation-killing: buildTransitionMap chooses explicit vs default
  // -------------------------------------------------------------------------

  it("uses default transitions when explicit transitions is empty object", () => {
    const machine = new StateMachine({
      stages: ["todo", "in progress", "done"],
      terminalStates: ["done"],
      transitions: {}, // empty — should use defaults
    });
    // Non-terminal can go anywhere in default mode
    expect(machine.canTransition("todo", "done")).toBe(true);
    expect(machine.canTransition("todo", "in progress")).toBe(true);
    // Terminal can only self-transition
    expect(machine.canTransition("done", "todo")).toBe(false);
  });
});
