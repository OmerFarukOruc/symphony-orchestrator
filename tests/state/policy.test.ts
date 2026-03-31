import { describe, expect, it } from "vitest";

import {
  listWorkflowStages,
  isActiveState,
  isGateState,
  isTerminalState,
  isTodoState,
  normalizeStateList,
  normalizeStateKey,
} from "../../src/state/policy.js";
import type { ServiceConfig } from "../../src/core/types.js";

function createConfig(overrides: Partial<ServiceConfig["tracker"]> = {}): ServiceConfig {
  return {
    tracker: {
      kind: "linear",
      apiKey: "linear-token",
      endpoint: "https://api.linear.app/graphql",
      projectSlug: "EXAMPLE",
      activeStates: ["Todo", "In Progress"],
      terminalStates: ["Done", "Cancelled", "Duplicate"],
      ...overrides,
    },
    polling: { intervalMs: 30000 },
    workspace: {
      root: "/tmp/risoluto",
      hooks: {
        afterCreate: null,
        beforeRun: null,
        afterRun: null,
        beforeRemove: null,
        timeoutMs: 1000,
      },
    },
    agent: {
      maxConcurrentAgents: 1,
      maxConcurrentAgentsByState: {},
      maxTurns: 1,
      maxRetryBackoffMs: 300000,
    },
    codex: {
      command: "codex app-server",
      model: "gpt-5.4",
      reasoningEffort: "high",
      approvalPolicy: "never",
      threadSandbox: "danger-full-access",
      turnSandboxPolicy: { type: "dangerFullAccess" },
      readTimeoutMs: 1000,
      turnTimeoutMs: 10000,
      drainTimeoutMs: 0,
      startupTimeoutMs: 5000,
      stallTimeoutMs: 10000,
      auth: {
        mode: "api_key",
        sourceHome: "/tmp/unused-codex-home",
      },
      provider: null,
      sandbox: {
        image: "risoluto-codex:latest",
        network: "",
        security: { noNewPrivileges: true, dropCapabilities: true, gvisor: false, seccompProfile: "" },
        resources: { memory: "4g", memoryReservation: "1g", memorySwap: "4g", cpus: "2.0", tmpfsSize: "512m" },
        extraMounts: [],
        envPassthrough: [],
        logs: { driver: "json-file", maxSize: "50m", maxFile: 3 },
        egressAllowlist: [],
      },
    },
    server: { port: 4000 },
  };
}

function createStateMachineConfig(): ServiceConfig {
  const base = createConfig();
  return {
    ...base,
    stateMachine: {
      stages: [
        { name: "Backlog", kind: "backlog" },
        { name: "Todo", kind: "todo" },
        { name: "In Progress", kind: "active" },
        { name: "Gate Review", kind: "gate" },
        { name: "Done", kind: "terminal" },
      ],
      transitions: {},
    },
  } as unknown as ServiceConfig;
}

describe("normalizeStateList", () => {
  it("lowercases and deduplicates states", () => {
    const result = normalizeStateList(["In Progress", "in progress", "TODO", "Done"]);
    expect(result).toEqual(["in progress", "todo", "done"]);
  });

  it("trims whitespace", () => {
    const result = normalizeStateList(["  In Progress  ", "Done "]);
    expect(result).toEqual(["in progress", "done"]);
  });

  it("filters out empty strings", () => {
    const result = normalizeStateList(["", "Done", "  "]);
    expect(result).toEqual(["done"]);
  });

  it("returns empty array for empty input", () => {
    expect(normalizeStateList([])).toEqual([]);
  });
});

describe("normalizeStateKey", () => {
  it("lowercases and trims state name", () => {
    expect(normalizeStateKey("In Progress")).toBe("in progress");
    expect(normalizeStateKey("  Done  ")).toBe("done");
  });
});

describe("isActiveState", () => {
  it("returns true for configured active states (case-insensitive)", () => {
    const config = createConfig();
    expect(isActiveState("In Progress", config)).toBe(true);
    expect(isActiveState("in progress", config)).toBe(true);
    expect(isActiveState("IN PROGRESS", config)).toBe(true);
    expect(isActiveState("Todo", config)).toBe(true);
    expect(isActiveState("todo", config)).toBe(true);
  });

  it("returns false for terminal states", () => {
    const config = createConfig();
    expect(isActiveState("Done", config)).toBe(false);
    expect(isActiveState("Cancelled", config)).toBe(false);
  });

  it("returns false for unknown states", () => {
    const config = createConfig();
    expect(isActiveState("Backlog", config)).toBe(false);
    expect(isActiveState("Unknown", config)).toBe(false);
  });

  it("uses state machine when configured", () => {
    const config = createStateMachineConfig();
    expect(isActiveState("In Progress", config)).toBe(true);
    expect(isActiveState("Todo", config)).toBe(true);
    expect(isActiveState("Done", config)).toBe(false);
    expect(isActiveState("Backlog", config)).toBe(false); // backlog is not active
    expect(isActiveState("Gate Review", config)).toBe(false); // gate is not active
  });
});

describe("isTerminalState", () => {
  it("returns true for configured terminal states (case-insensitive)", () => {
    const config = createConfig();
    expect(isTerminalState("Done", config)).toBe(true);
    expect(isTerminalState("done", config)).toBe(true);
    expect(isTerminalState("DONE", config)).toBe(true);
    expect(isTerminalState("Cancelled", config)).toBe(true);
    expect(isTerminalState("Duplicate", config)).toBe(true);
  });

  it("returns false for active states", () => {
    const config = createConfig();
    expect(isTerminalState("In Progress", config)).toBe(false);
    expect(isTerminalState("Todo", config)).toBe(false);
  });

  it("returns false for unknown states", () => {
    const config = createConfig();
    expect(isTerminalState("Backlog", config)).toBe(false);
    expect(isTerminalState("Random", config)).toBe(false);
  });

  it("uses state machine when configured", () => {
    const config = createStateMachineConfig();
    expect(isTerminalState("Done", config)).toBe(true);
    expect(isTerminalState("In Progress", config)).toBe(false);
    expect(isTerminalState("Backlog", config)).toBe(false);
  });
});

describe("isGateState", () => {
  it("returns false when no state machine is configured", () => {
    const config = createConfig();
    expect(isGateState("Gate Review", config)).toBe(false);
    expect(isGateState("In Progress", config)).toBe(false);
  });

  it("returns true for gate stages when state machine is configured", () => {
    const config = createStateMachineConfig();
    expect(isGateState("Gate Review", config)).toBe(true);
    expect(isGateState("gate review", config)).toBe(true);
  });

  it("returns false for non-gate stages when state machine is configured", () => {
    const config = createStateMachineConfig();
    expect(isGateState("In Progress", config)).toBe(false);
    expect(isGateState("Todo", config)).toBe(false);
    expect(isGateState("Done", config)).toBe(false);
    expect(isGateState("Backlog", config)).toBe(false);
  });
});

describe("isTodoState", () => {
  it("returns true for 'todo' by default (no config)", () => {
    expect(isTodoState("Todo")).toBe(true);
    expect(isTodoState("todo")).toBe(true);
    expect(isTodoState("TODO")).toBe(true);
  });

  it("returns false for non-todo states without config", () => {
    expect(isTodoState("In Progress")).toBe(false);
    expect(isTodoState("Done")).toBe(false);
  });

  it("uses state machine when configured", () => {
    const config = createStateMachineConfig();
    expect(isTodoState("Todo", config)).toBe(true);
    expect(isTodoState("In Progress", config)).toBe(false);
    expect(isTodoState("Backlog", config)).toBe(false);
  });
});

describe("listWorkflowStages", () => {
  it("includes every configured terminal state when no explicit state machine is present", () => {
    expect(listWorkflowStages(createConfig()).map((stage) => stage.label)).toEqual([
      "Todo",
      "In Progress",
      "Done",
      "Cancelled",
      "Duplicate",
    ]);
  });

  it("marks active states as non-terminal", () => {
    const stages = listWorkflowStages(createConfig());
    const todoStage = stages.find((s) => s.label === "Todo");
    const inProgressStage = stages.find((s) => s.label === "In Progress");
    expect(todoStage?.terminal).toBe(false);
    expect(inProgressStage?.terminal).toBe(false);
  });

  it("marks terminal states as terminal", () => {
    const stages = listWorkflowStages(createConfig());
    const doneStage = stages.find((s) => s.label === "Done");
    expect(doneStage?.terminal).toBe(true);
    expect(doneStage?.kind).toBe("terminal");
  });

  it("marks todo state with kind 'todo'", () => {
    const stages = listWorkflowStages(createConfig());
    const todoStage = stages.find((s) => s.label === "Todo");
    expect(todoStage?.kind).toBe("todo");
  });

  it("marks non-todo active states with kind 'active'", () => {
    const stages = listWorkflowStages(createConfig());
    const inProgressStage = stages.find((s) => s.label === "In Progress");
    expect(inProgressStage?.kind).toBe("active");
  });

  it("marks backlog state with kind 'backlog'", () => {
    const config = createConfig({ activeStates: ["Backlog", "Todo", "In Progress"] });
    const stages = listWorkflowStages(config);
    const backlogStage = stages.find((s) => s.label === "Backlog");
    expect(backlogStage?.kind).toBe("backlog");
    expect(backlogStage?.terminal).toBe(false);
  });

  it("deduplicates stages when same state appears in active and terminal", () => {
    const config = createConfig({
      activeStates: ["In Progress"],
      terminalStates: ["Done", "In Progress"], // duplicate!
    });
    const stages = listWorkflowStages(config);
    const inProgressStages = stages.filter((s) => s.label === "In Progress");
    expect(inProgressStages).toHaveLength(1);
  });

  it("uses state machine stages when configured", () => {
    const config = createStateMachineConfig();
    const stages = listWorkflowStages(config);
    expect(stages.map((s) => s.label)).toEqual(["Backlog", "Todo", "In Progress", "Gate Review", "Done"]);
    expect(stages.find((s) => s.label === "Backlog")?.kind).toBe("backlog");
    expect(stages.find((s) => s.label === "Gate Review")?.kind).toBe("gate");
    expect(stages.find((s) => s.label === "Gate Review")?.terminal).toBe(false);
    expect(stages.find((s) => s.label === "Done")?.terminal).toBe(true);
  });
});
