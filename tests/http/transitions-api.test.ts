import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request } from "express";

import { makeMockResponse } from "../helpers.js";
import { handleGetTransitions } from "../../src/http/transitions-api.js";

const machineMocks = vi.hoisted(() => ({
  constructedWith: vi.fn(),
  getStages: vi.fn(),
  canTransition: vi.fn(),
}));

vi.mock("../../src/state/machine.js", () => ({
  StateMachine: class MockStateMachine {
    constructor(config: unknown) {
      machineMocks.constructedWith(config);
    }

    getStages(): TestStage[] {
      return machineMocks.getStages();
    }

    canTransition(from: string, to: string): boolean {
      return machineMocks.canTransition(from, to);
    }
  },
}));

type TransitionsDeps = Parameters<typeof handleGetTransitions>[0];
type TestStage = { key: string; terminal: boolean };

function makeRequest(): Request {
  const req: Partial<Request> = { get: vi.fn() };
  return req as Request;
}

function makeDeps(configStore?: { getConfig: () => unknown }): TransitionsDeps {
  if (configStore) {
    return {
      orchestrator: {} as TransitionsDeps["orchestrator"],
      configStore: configStore as TransitionsDeps["configStore"],
    };
  }
  return { orchestrator: {} as TransitionsDeps["orchestrator"] };
}

function setMockMachine(stages: TestStage[], allowedTransitions: Record<string, string[]>): void {
  machineMocks.getStages.mockReturnValue(stages);
  machineMocks.canTransition.mockImplementation((from: string, to: string) => {
    return allowedTransitions[from]?.includes(to) ?? false;
  });
}

describe("handleGetTransitions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    machineMocks.constructedWith.mockReset();
    machineMocks.getStages.mockReset();
    machineMocks.canTransition.mockReset();
  });

  it("returns empty transitions when configStore is not configured", () => {
    const res = makeMockResponse();

    handleGetTransitions(makeDeps(), makeRequest(), res);

    expect(res._status).toBe(200);
    expect(res._body).toEqual({ transitions: {} });
    expect(machineMocks.constructedWith).not.toHaveBeenCalled();
  });

  it("builds transitions from tracker activeStates and terminalStates when stateMachine config is absent", () => {
    const res = makeMockResponse();
    const config = {
      tracker: {
        activeStates: ["Todo", "In Progress"],
        terminalStates: ["Done", "Canceled"],
      },
      stateMachine: null,
    };
    const configStore = {
      getConfig: vi.fn().mockReturnValue(config),
    };

    setMockMachine(
      [
        { key: "todo", terminal: false },
        { key: "in progress", terminal: false },
        { key: "done", terminal: true },
      ],
      {
        todo: ["todo", "in progress"],
        "in progress": ["todo", "in progress", "done"],
        done: ["done"],
      },
    );

    handleGetTransitions(makeDeps(configStore), makeRequest(), res);

    expect(configStore.getConfig).toHaveBeenCalledTimes(1);
    expect(machineMocks.constructedWith).toHaveBeenCalledWith({
      activeStates: ["Todo", "In Progress"],
      terminalStates: ["Done", "Canceled"],
    });
    expect(res._body).toEqual({
      transitions: {
        todo: ["todo", "in progress"],
        "in progress": ["todo", "in progress", "done"],
        done: ["done"],
      },
    });
  });

  it("builds transitions from stateMachine config when present", () => {
    const res = makeMockResponse();
    const config = {
      tracker: {
        activeStates: ["Backlog", "Working"],
        terminalStates: ["Done"],
      },
      stateMachine: {
        stages: [
          { name: "Backlog", kind: "backlog" as const },
          { name: "Working", kind: "active" as const },
          { name: "Done", kind: "terminal" as const },
        ],
        transitions: {
          Backlog: ["Backlog", "Working"],
          Working: ["Working", "Done"],
          Done: ["Done"],
        },
      },
    };
    const configStore = {
      getConfig: vi.fn().mockReturnValue(config),
    };

    setMockMachine(
      [
        { key: "backlog", terminal: false },
        { key: "working", terminal: false },
        { key: "done", terminal: true },
      ],
      {
        backlog: ["backlog", "working"],
        working: ["working", "done"],
        done: ["done"],
      },
    );

    handleGetTransitions(makeDeps(configStore), makeRequest(), res);

    expect(machineMocks.constructedWith).toHaveBeenCalledWith({
      stages: [
        { key: "Backlog", terminal: false },
        { key: "Working", terminal: false },
        { key: "Done", terminal: true },
      ],
      transitions: {
        Backlog: ["Backlog", "Working"],
        Working: ["Working", "Done"],
        Done: ["Done"],
      },
      activeStates: ["Backlog", "Working"],
      terminalStates: ["Done"],
    });
    expect(res._body).toEqual({
      transitions: {
        backlog: ["backlog", "working"],
        working: ["working", "done"],
        done: ["done"],
      },
    });
  });
});
