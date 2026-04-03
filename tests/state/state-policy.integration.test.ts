/**
 * Integration tests for src/state/policy.ts — pure-function policy helpers.
 *
 * No server or I/O needed. Tests validate state classification, stage listing,
 * normalization, and WeakMap cache correctness across tracker-based and
 * stateMachine-based ServiceConfig shapes.
 */

import { describe, expect, it } from "vitest";

import type { ServiceConfig } from "../../src/core/types.js";
import {
  isActiveState,
  isGateState,
  isTerminalState,
  isTodoState,
  listWorkflowStages,
  normalizeStateKey,
  normalizeStateList,
} from "../../src/state/policy.js";

// ---------------------------------------------------------------------------
// Config factories
// ---------------------------------------------------------------------------

function makeTrackerConfig(
  overrides: Partial<Pick<ServiceConfig["tracker"], "activeStates" | "terminalStates">> = {},
): ServiceConfig {
  return {
    tracker: {
      kind: "linear",
      apiKey: "linear-token",
      endpoint: "https://api.linear.app/graphql",
      projectSlug: "INT",
      activeStates: ["Backlog", "Todo", "In Progress"],
      terminalStates: ["Done", "Canceled"],
      ...overrides,
    },
    polling: { intervalMs: 30000 },
    workspace: {
      root: "/tmp/risoluto-integ",
      strategy: "directory",
      branchPrefix: "risoluto/",
      hooks: { afterCreate: null, beforeRun: null, afterRun: null, beforeRemove: null, timeoutMs: 5000 },
    },
    agent: {
      maxConcurrentAgents: 1,
      maxConcurrentAgentsByState: {},
      maxTurns: 10,
      maxRetryBackoffMs: 300000,
      maxContinuationAttempts: 3,
      successState: null,
      stallTimeoutMs: 60000,
    },
    codex: {
      command: "codex app-server",
      model: "gpt-5.4",
      reasoningEffort: null,
      approvalPolicy: "never",
      threadSandbox: "danger-full-access",
      personality: "",
      turnSandboxPolicy: { type: "dangerFullAccess" },
      selfReview: false,
      readTimeoutMs: 1000,
      turnTimeoutMs: 10000,
      drainTimeoutMs: 0,
      startupTimeoutMs: 5000,
      stallTimeoutMs: 10000,
      structuredOutput: false,
      auth: { mode: "api_key", sourceHome: "/tmp/unused-codex-home" },
      provider: null,
      sandbox: {
        image: "risoluto-codex:latest",
        network: "",
        security: { noNewPrivileges: true, dropCapabilities: true, gvisor: false, seccompProfile: "" },
        resources: {
          memory: "4g",
          memoryReservation: "1g",
          memorySwap: "4g",
          cpus: "2.0",
          tmpfsSize: "512m",
        },
        extraMounts: [],
        envPassthrough: [],
        logs: { driver: "json-file", maxSize: "50m", maxFile: 3 },
        egressAllowlist: [],
      },
    },
    server: { port: 4000 },
  };
}

function makeStateMachineConfig(): ServiceConfig {
  return {
    ...makeTrackerConfig(),
    stateMachine: {
      stages: [
        { name: "Backlog", kind: "backlog" },
        { name: "Todo", kind: "todo" },
        { name: "In Progress", kind: "active" },
        { name: "Review Gate", kind: "gate" },
        { name: "Done", kind: "terminal" },
        { name: "Canceled", kind: "terminal" },
      ],
      transitions: {
        Backlog: ["Todo"],
        Todo: ["In Progress"],
        "In Progress": ["Review Gate"],
        "Review Gate": ["Done", "In Progress"],
        Done: [],
        Canceled: [],
      },
    },
  };
}

// ---------------------------------------------------------------------------
// normalizeStateList
// ---------------------------------------------------------------------------

describe("normalizeStateList", () => {
  it("deduplicates entries case-insensitively", () => {
    const result = normalizeStateList(["In Progress", "in progress", "IN PROGRESS"]);
    expect(result).toEqual(["in progress"]);
  });

  it("trims leading and trailing whitespace", () => {
    const result = normalizeStateList(["  Done  ", " Canceled "]);
    expect(result).toEqual(["done", "canceled"]);
  });

  it("removes empty strings and whitespace-only entries", () => {
    const result = normalizeStateList(["", "  ", "Done"]);
    expect(result).toEqual(["done"]);
  });
});

// ---------------------------------------------------------------------------
// normalizeStateKey
// ---------------------------------------------------------------------------

describe("normalizeStateKey", () => {
  it("lowercases and trims a state name", () => {
    expect(normalizeStateKey("  In Progress  ")).toBe("in progress");
    expect(normalizeStateKey("DONE")).toBe("done");
  });
});

// ---------------------------------------------------------------------------
// Tracker-based config (no stateMachine)
// ---------------------------------------------------------------------------

describe("isTerminalState (tracker config)", () => {
  it("returns true for a state in terminalStates", () => {
    expect(isTerminalState("Done", makeTrackerConfig())).toBe(true);
  });

  it("returns false for a state in activeStates", () => {
    expect(isTerminalState("In Progress", makeTrackerConfig())).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isTerminalState("done", makeTrackerConfig())).toBe(true);
    expect(isTerminalState("CANCELED", makeTrackerConfig())).toBe(true);
  });
});

describe("isActiveState (tracker config)", () => {
  it("returns true for a state in activeStates", () => {
    expect(isActiveState("In Progress", makeTrackerConfig())).toBe(true);
  });

  it("returns false for a terminal state", () => {
    expect(isActiveState("Done", makeTrackerConfig())).toBe(false);
  });
});

describe("isGateState (tracker config)", () => {
  it("returns false for any state when no stateMachine is configured", () => {
    const config = makeTrackerConfig();
    expect(isGateState("In Progress", config)).toBe(false);
    expect(isGateState("Review Gate", config)).toBe(false);
    expect(isGateState("Done", config)).toBe(false);
  });
});

describe("isTodoState (no config arg)", () => {
  it("returns true for 'todo' (case-insensitive)", () => {
    expect(isTodoState("todo")).toBe(true);
    expect(isTodoState("Todo")).toBe(true);
    expect(isTodoState("TODO")).toBe(true);
  });

  it("returns false for non-todo states", () => {
    expect(isTodoState("in progress")).toBe(false);
    expect(isTodoState("done")).toBe(false);
  });
});

describe("listWorkflowStages (tracker config)", () => {
  it("returns stages in order: activeStates then terminalStates", () => {
    const stages = listWorkflowStages(makeTrackerConfig());
    expect(stages.map((s) => s.label)).toEqual(["Backlog", "Todo", "In Progress", "Done", "Canceled"]);
  });

  it("assigns correct kinds to stages", () => {
    const stages = listWorkflowStages(makeTrackerConfig());
    const byLabel = Object.fromEntries(stages.map((s) => [s.label, s]));
    expect(byLabel["Backlog"].kind).toBe("backlog");
    expect(byLabel["Todo"].kind).toBe("todo");
    expect(byLabel["In Progress"].kind).toBe("active");
    expect(byLabel["Done"].kind).toBe("terminal");
    expect(byLabel["Canceled"].kind).toBe("terminal");
  });

  it("marks only terminal stages as terminal=true", () => {
    const stages = listWorkflowStages(makeTrackerConfig());
    const byLabel = Object.fromEntries(stages.map((s) => [s.label, s]));
    expect(byLabel["Backlog"].terminal).toBe(false);
    expect(byLabel["Todo"].terminal).toBe(false);
    expect(byLabel["In Progress"].terminal).toBe(false);
    expect(byLabel["Done"].terminal).toBe(true);
    expect(byLabel["Canceled"].terminal).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// StateMachine-based config
// ---------------------------------------------------------------------------

describe("isTerminalState (stateMachine config)", () => {
  it("returns true for a stage with kind terminal", () => {
    expect(isTerminalState("Done", makeStateMachineConfig())).toBe(true);
    expect(isTerminalState("Canceled", makeStateMachineConfig())).toBe(true);
  });

  it("returns false for active and gate stages", () => {
    expect(isTerminalState("In Progress", makeStateMachineConfig())).toBe(false);
    expect(isTerminalState("Review Gate", makeStateMachineConfig())).toBe(false);
  });
});

describe("isActiveState (stateMachine config)", () => {
  it("returns true for active and todo stage kinds", () => {
    expect(isActiveState("In Progress", makeStateMachineConfig())).toBe(true);
    expect(isActiveState("Todo", makeStateMachineConfig())).toBe(true);
  });

  it("returns false for backlog, gate, and terminal stages", () => {
    expect(isActiveState("Backlog", makeStateMachineConfig())).toBe(false);
    expect(isActiveState("Review Gate", makeStateMachineConfig())).toBe(false);
    expect(isActiveState("Done", makeStateMachineConfig())).toBe(false);
  });
});

describe("isGateState (stateMachine config)", () => {
  it("returns true only for stages with kind gate", () => {
    expect(isGateState("Review Gate", makeStateMachineConfig())).toBe(true);
    expect(isGateState("review gate", makeStateMachineConfig())).toBe(true);
  });

  it("returns false for non-gate stages", () => {
    expect(isGateState("In Progress", makeStateMachineConfig())).toBe(false);
    expect(isGateState("Done", makeStateMachineConfig())).toBe(false);
    expect(isGateState("Backlog", makeStateMachineConfig())).toBe(false);
  });
});

describe("isTodoState (stateMachine config)", () => {
  it("returns true for the stage with kind todo", () => {
    expect(isTodoState("Todo", makeStateMachineConfig())).toBe(true);
    expect(isTodoState("todo", makeStateMachineConfig())).toBe(true);
  });

  it("returns false for non-todo stages", () => {
    expect(isTodoState("In Progress", makeStateMachineConfig())).toBe(false);
    expect(isTodoState("Backlog", makeStateMachineConfig())).toBe(false);
    expect(isTodoState("Done", makeStateMachineConfig())).toBe(false);
  });
});

describe("listWorkflowStages (stateMachine config)", () => {
  it("returns stages in definition order from stateMachine", () => {
    const stages = listWorkflowStages(makeStateMachineConfig());
    expect(stages.map((s) => s.label)).toEqual(["Backlog", "Todo", "In Progress", "Review Gate", "Done", "Canceled"]);
  });

  it("assigns kind from stage definition", () => {
    const stages = listWorkflowStages(makeStateMachineConfig());
    const byLabel = Object.fromEntries(stages.map((s) => [s.label, s]));
    expect(byLabel["Backlog"].kind).toBe("backlog");
    expect(byLabel["Todo"].kind).toBe("todo");
    expect(byLabel["In Progress"].kind).toBe("active");
    expect(byLabel["Review Gate"].kind).toBe("gate");
    expect(byLabel["Done"].kind).toBe("terminal");
  });

  it("marks gate stages as terminal=false", () => {
    const stages = listWorkflowStages(makeStateMachineConfig());
    const gateStage = stages.find((s) => s.label === "Review Gate");
    expect(gateStage?.terminal).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// WeakMap caching behavior
// ---------------------------------------------------------------------------

describe("caching behavior", () => {
  it("returns consistent results across repeated calls with the same config object", () => {
    const config = makeTrackerConfig();
    // Call multiple times — the WeakMap cache should not break subsequent calls
    expect(isTerminalState("Done", config)).toBe(true);
    expect(isTerminalState("Done", config)).toBe(true);
    expect(isActiveState("In Progress", config)).toBe(true);
    expect(isActiveState("In Progress", config)).toBe(true);
  });

  it("returns consistent results for stateMachine config across repeated calls", () => {
    const config = makeStateMachineConfig();
    expect(isGateState("Review Gate", config)).toBe(true);
    expect(isGateState("Review Gate", config)).toBe(true);
    expect(isTerminalState("Done", config)).toBe(true);
    expect(isTerminalState("Done", config)).toBe(true);
  });
});
