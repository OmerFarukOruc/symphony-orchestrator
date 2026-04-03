import { describe, expect, it } from "vitest";

import { StateMachine, createDefaultStateMachine } from "../../src/state/machine.js";

// ── createDefaultStateMachine ─────────────────────────────────────────────────

describe("createDefaultStateMachine — integration", () => {
  it("returns a StateMachine instance", () => {
    const machine = createDefaultStateMachine();
    expect(machine).toBeInstanceOf(StateMachine);
  });

  it("knows all five default states", () => {
    const machine = createDefaultStateMachine();
    expect(machine.isKnownState("Backlog")).toBe(true);
    expect(machine.isKnownState("Todo")).toBe(true);
    expect(machine.isKnownState("In Progress")).toBe(true);
    expect(machine.isKnownState("Done")).toBe(true);
    expect(machine.isKnownState("Canceled")).toBe(true);
  });

  it("normalizes state names case-insensitively", () => {
    const machine = createDefaultStateMachine();
    expect(machine.isKnownState("in progress")).toBe(true);
    expect(machine.isKnownState("IN PROGRESS")).toBe(true);
    expect(machine.isKnownState("DONE")).toBe(true);
  });

  it("marks Done and Canceled as terminal", () => {
    const machine = createDefaultStateMachine();
    expect(machine.isTerminalState("Done")).toBe(true);
    expect(machine.isTerminalState("Canceled")).toBe(true);
  });

  it("marks active states as non-terminal", () => {
    const machine = createDefaultStateMachine();
    expect(machine.isTerminalState("Backlog")).toBe(false);
    expect(machine.isTerminalState("Todo")).toBe(false);
    expect(machine.isTerminalState("In Progress")).toBe(false);
  });
});

// ── getStages ─────────────────────────────────────────────────────────────────

describe("StateMachine.getStages — integration", () => {
  it("returns all configured stages", () => {
    const machine = new StateMachine({
      stages: ["open", "wip", "closed"],
      terminalStates: ["closed"],
    });
    const stages = machine.getStages();
    expect(stages.map((s) => s.key)).toEqual(["open", "wip", "closed"]);
  });

  it("marks terminal stages correctly in the returned copy", () => {
    const machine = new StateMachine({
      stages: ["open", "done"],
      terminalStates: ["done"],
    });
    const stages = machine.getStages();
    const open = stages.find((s) => s.key === "open");
    const done = stages.find((s) => s.key === "done");
    expect(open?.terminal).toBe(false);
    expect(done?.terminal).toBe(true);
  });

  it("returns a copy — mutating it does not affect internal state", () => {
    const machine = new StateMachine({
      stages: ["open", "done"],
      terminalStates: ["done"],
    });
    const stagesCopy = machine.getStages();
    stagesCopy[0].terminal = true;

    // Internal state is unchanged
    expect(machine.isTerminalState("open")).toBe(false);
  });

  it("supports object stage definitions with explicit terminal flag", () => {
    const machine = new StateMachine({
      stages: [
        { key: "Triage", terminal: false },
        { key: "Blocked", terminal: false },
        { key: "Resolved", terminal: true },
      ],
    });
    const stages = machine.getStages();
    expect(stages).toHaveLength(3);
    expect(stages.find((s) => s.key === "resolved")?.terminal).toBe(true);
    expect(stages.find((s) => s.key === "blocked")?.terminal).toBe(false);
  });

  it("deduplicates stage definitions", () => {
    const machine = new StateMachine({
      stages: ["open", "open", "done"],
      terminalStates: ["done"],
    });
    expect(machine.getStages()).toHaveLength(2);
  });
});

// ── isKnownState ──────────────────────────────────────────────────────────────

describe("StateMachine.isKnownState — integration", () => {
  it("returns true for a known state (exact case)", () => {
    const machine = new StateMachine({ stages: ["open", "done"], terminalStates: ["done"] });
    expect(machine.isKnownState("open")).toBe(true);
  });

  it("returns true for a known state with different casing", () => {
    const machine = new StateMachine({ stages: ["Open", "Done"], terminalStates: ["done"] });
    expect(machine.isKnownState("OPEN")).toBe(true);
    expect(machine.isKnownState("open")).toBe(true);
  });

  it("returns false for an unknown state", () => {
    const machine = new StateMachine({ stages: ["open", "done"], terminalStates: ["done"] });
    expect(machine.isKnownState("pending")).toBe(false);
  });

  it("returns false for an empty string", () => {
    const machine = new StateMachine({ stages: ["open"], terminalStates: [] });
    expect(machine.isKnownState("")).toBe(false);
  });

  it("returns false for a whitespace-only string", () => {
    const machine = new StateMachine({ stages: ["open"], terminalStates: [] });
    // normalizeState trims, resulting in "", which is not registered
    expect(machine.isKnownState("   ")).toBe(false);
  });
});

// ── canTransition — default (no explicit transitions) ────────────────────────

describe("StateMachine.canTransition — default transitions — integration", () => {
  it("non-terminal state can transition to any other state", () => {
    const machine = new StateMachine({
      stages: ["todo", "wip", "done"],
      terminalStates: ["done"],
    });
    expect(machine.canTransition("todo", "wip")).toBe(true);
    expect(machine.canTransition("todo", "done")).toBe(true);
    expect(machine.canTransition("wip", "todo")).toBe(true);
  });

  it("non-terminal state can self-transition", () => {
    const machine = new StateMachine({
      stages: ["todo", "done"],
      terminalStates: ["done"],
    });
    expect(machine.canTransition("todo", "todo")).toBe(true);
  });

  it("terminal state can only self-transition", () => {
    const machine = new StateMachine({
      stages: ["todo", "done"],
      terminalStates: ["done"],
    });
    expect(machine.canTransition("done", "done")).toBe(true);
    expect(machine.canTransition("done", "todo")).toBe(false);
  });

  it("returns false when the from state is unknown", () => {
    const machine = new StateMachine({ stages: ["open", "done"], terminalStates: ["done"] });
    expect(machine.canTransition("unknown", "open")).toBe(false);
  });

  it("returns false when the to state is unknown", () => {
    const machine = new StateMachine({ stages: ["open", "done"], terminalStates: ["done"] });
    expect(machine.canTransition("open", "unknown")).toBe(false);
  });

  it("returns false when both states are unknown", () => {
    const machine = new StateMachine({ stages: ["open", "done"], terminalStates: ["done"] });
    expect(machine.canTransition("foo", "bar")).toBe(false);
  });

  it("normalizes state names for transition check", () => {
    const machine = new StateMachine({
      stages: ["Todo", "Done"],
      terminalStates: ["done"],
    });
    expect(machine.canTransition("TODO", "DONE")).toBe(true);
  });
});

// ── canTransition — explicit transitions ──────────────────────────────────────

describe("StateMachine.canTransition — explicit transitions — integration", () => {
  it("allows only the explicitly configured forward transitions", () => {
    const machine = new StateMachine({
      stages: ["backlog", "todo", "in progress", "review", "done"],
      terminalStates: ["done"],
      transitions: {
        backlog: ["todo"],
        todo: ["in progress"],
        "in progress": ["review"],
        review: ["done", "in progress"],
      },
    });

    expect(machine.canTransition("backlog", "todo")).toBe(true);
    expect(machine.canTransition("todo", "in progress")).toBe(true);
    expect(machine.canTransition("in progress", "review")).toBe(true);
    expect(machine.canTransition("review", "done")).toBe(true);
    expect(machine.canTransition("review", "in progress")).toBe(true);
  });

  it("blocks skipped transitions not in the explicit map", () => {
    const machine = new StateMachine({
      stages: ["backlog", "todo", "done"],
      terminalStates: ["done"],
      transitions: {
        backlog: ["todo"],
        todo: ["done"],
      },
    });

    expect(machine.canTransition("backlog", "done")).toBe(false);
  });

  it("always allows self-transition for states in the explicit map", () => {
    const machine = new StateMachine({
      stages: ["open", "closed"],
      terminalStates: ["closed"],
      transitions: {
        open: ["closed"],
      },
    });

    // buildExplicitTransitions adds the from-state itself to its allowed set
    expect(machine.canTransition("open", "open")).toBe(true);
  });

  it("states not present in explicit transition keys have no allowed targets", () => {
    const machine = new StateMachine({
      stages: ["a", "b", "c"],
      terminalStates: [],
      transitions: {
        a: ["b"],
      },
    });

    // "c" has no entry in explicit map → transitionMap.get("c") is undefined
    // canTransition falls back to normalizedFrom === normalizedTo
    expect(machine.canTransition("c", "c")).toBe(true);
    expect(machine.canTransition("c", "a")).toBe(false);
  });

  it("ignores unknown states in the explicit transitions config", () => {
    const machine = new StateMachine({
      stages: ["open", "done"],
      terminalStates: ["done"],
      transitions: {
        open: ["done", "phantom"], // "phantom" is not a known stage
      },
    });

    expect(machine.canTransition("open", "done")).toBe(true);
    expect(machine.canTransition("open", "phantom")).toBe(false);
  });
});

// ── assertTransition ──────────────────────────────────────────────────────────

describe("StateMachine.assertTransition — integration", () => {
  it("returns { ok: true } for a valid transition", () => {
    const machine = new StateMachine({
      stages: ["open", "done"],
      terminalStates: ["done"],
    });
    expect(machine.assertTransition("open", "done")).toEqual({ ok: true });
  });

  it("returns failure with reason when the from state is unknown", () => {
    const machine = new StateMachine({ stages: ["open", "done"], terminalStates: ["done"] });
    const result = machine.assertTransition("ghost", "open");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/unknown source state/);
      expect(result.reason).toContain("ghost");
    }
  });

  it("returns failure with reason when the to state is unknown", () => {
    const machine = new StateMachine({ stages: ["open", "done"], terminalStates: ["done"] });
    const result = machine.assertTransition("open", "nowhere");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/unknown target state/);
      expect(result.reason).toContain("nowhere");
    }
  });

  it("returns failure with reason when transition is blocked", () => {
    const machine = new StateMachine({
      stages: ["todo", "done"],
      terminalStates: ["done"],
      transitions: { todo: ["done"] },
    });
    const result = machine.assertTransition("done", "todo");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/invalid transition/);
      expect(result.reason).toContain("done");
      expect(result.reason).toContain("todo");
    }
  });

  it("returns failure for unknown from even when to is also unknown", () => {
    const machine = new StateMachine({ stages: ["open"], terminalStates: [] });
    const result = machine.assertTransition("ghost", "phantom");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/unknown source state/);
    }
  });

  it("returns { ok: true } for self-transition on a non-terminal state", () => {
    const machine = new StateMachine({
      stages: ["wip", "done"],
      terminalStates: ["done"],
    });
    expect(machine.assertTransition("wip", "wip")).toEqual({ ok: true });
  });

  it("returns { ok: true } for self-transition on a terminal state", () => {
    const machine = new StateMachine({
      stages: ["wip", "done"],
      terminalStates: ["done"],
    });
    expect(machine.assertTransition("done", "done")).toEqual({ ok: true });
  });

  it("normalizes state name casing in the failure reason", () => {
    const machine = new StateMachine({
      stages: ["Todo", "Done"],
      terminalStates: ["done"],
      transitions: { todo: ["done"] },
    });
    const result = machine.assertTransition("Done", "Todo");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // reason uses normalized (lowercased) form
      expect(result.reason).toContain("done");
      expect(result.reason).toContain("todo");
    }
  });
});

// ── object-stage definitions ──────────────────────────────────────────────────

describe("StateMachine — object stage definitions — integration", () => {
  it("respects the terminal flag from object stage input", () => {
    const machine = new StateMachine({
      stages: [
        { key: "Triage", terminal: false },
        { key: "Active", terminal: false },
        { key: "Closed", terminal: true },
      ],
    });

    expect(machine.isTerminalState("Closed")).toBe(true);
    expect(machine.isTerminalState("Triage")).toBe(false);
    expect(machine.isTerminalState("Active")).toBe(false);
  });

  it("treats missing terminal property on object stage as false", () => {
    const machine = new StateMachine({
      // terminal is optional in the config type
      stages: [{ key: "Open" }, { key: "Done", terminal: true }],
    });

    expect(machine.isTerminalState("Open")).toBe(false);
    expect(machine.isTerminalState("Done")).toBe(true);
  });

  it("terminal object-stage cannot transition away", () => {
    const machine = new StateMachine({
      stages: [
        { key: "Open", terminal: false },
        { key: "Closed", terminal: true },
      ],
    });

    expect(machine.canTransition("Closed", "Open")).toBe(false);
    expect(machine.canTransition("Closed", "Closed")).toBe(true);
  });

  it("skips empty-key object stage entries", () => {
    const machine = new StateMachine({
      stages: [
        { key: "  ", terminal: false }, // whitespace-only → normalized to ""
        { key: "Open", terminal: false },
        { key: "Done", terminal: true },
      ],
    });

    expect(machine.getStages()).toHaveLength(2);
    expect(machine.isKnownState("Open")).toBe(true);
  });
});

// ── empty / degenerate configs ────────────────────────────────────────────────

describe("StateMachine — degenerate configs — integration", () => {
  it("constructs with no arguments (uses all defaults)", () => {
    const machine = new StateMachine();
    expect(machine.isKnownState("backlog")).toBe(true);
    expect(machine.isKnownState("done")).toBe(true);
  });

  it("constructs with empty stages array (falls back to activeStates + terminalStates)", () => {
    const machine = new StateMachine({
      stages: [],
      activeStates: ["Ready"],
      terminalStates: ["Closed"],
    });

    expect(machine.isKnownState("Ready")).toBe(true);
    expect(machine.isKnownState("Closed")).toBe(true);
  });

  it("constructs with empty transitions object (falls back to default transitions)", () => {
    const machine = new StateMachine({
      stages: ["open", "done"],
      terminalStates: ["done"],
      transitions: {},
    });

    // Empty transitions → defaults apply
    expect(machine.canTransition("open", "done")).toBe(true);
    expect(machine.canTransition("done", "open")).toBe(false);
  });
});
