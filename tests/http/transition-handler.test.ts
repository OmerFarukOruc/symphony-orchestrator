import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const stateMachineMock = vi.hoisted(() => {
  let nextResult: { ok: boolean; reason?: string } = { ok: true };
  const instances: Array<{ config: unknown; assertTransition: ReturnType<typeof vi.fn> }> = [];

  class MockStateMachine {
    readonly assertTransition = vi.fn((_from: string, _to: string) => nextResult);

    constructor(config: unknown) {
      instances.push({ config, assertTransition: this.assertTransition });
    }
  }

  return {
    StateMachine: MockStateMachine,
    instances,
    reset() {
      nextResult = { ok: true };
      instances.length = 0;
    },
    setNextResult(result: { ok: boolean; reason?: string }) {
      nextResult = result;
    },
  };
});

vi.mock("../../src/state/machine.js", () => ({
  StateMachine: stateMachineMock.StateMachine,
}));

import { handleTransition } from "../../src/http/transition-handler.js";

function makeRequest(body: Record<string, unknown> = {}, params: Record<string, string> = {}): Request {
  return { body, params, get: vi.fn() } as unknown as Request;
}

function makeResponse(): Response & { _status: number; _body: unknown } {
  const res = {
    _status: 200,
    _body: null as unknown,
    status(code: number) {
      res._status = code;
      return res;
    },
    json(data: unknown) {
      res._body = data;
      return res;
    },
  };
  return res as unknown as Response & { _status: number; _body: unknown };
}

function makeOrchestrator(detail: Record<string, unknown> | null = null) {
  return {
    getIssueDetail: vi.fn().mockReturnValue(detail),
    requestRefresh: vi.fn().mockReturnValue({ queued: true, coalesced: false, requestedAt: "" }),
  };
}

function makeTracker(stateId: string | null = "state-uuid-123", success = true) {
  return {
    resolveStateId: vi.fn().mockResolvedValue(stateId),
    transitionIssue: vi.fn().mockResolvedValue({ success }),
  };
}

function makeConfigStore(overrides: Record<string, unknown> = {}) {
  return {
    getConfig: vi.fn().mockReturnValue({
      tracker: { activeStates: ["Todo", "In Progress"], terminalStates: ["Done"] },
      stateMachine: null,
      ...overrides,
    }),
  };
}

describe("handleTransition", () => {
  beforeEach(() => {
    stateMachineMock.reset();
  });

  it("returns the full not-found error payload when issue is missing", async () => {
    const res = makeResponse();

    await handleTransition(
      { orchestrator: makeOrchestrator(null) as never },
      makeRequest({ target_state: "In Progress" }, { issue_identifier: "MT-UNKNOWN" }),
      res,
    );

    expect(res._status).toBe(404);
    expect(res._body).toEqual({
      error: {
        code: "not_found",
        message: "Unknown issue identifier",
      },
    });
  });

  it("returns the assertion reason when the transition is invalid", async () => {
    const res = makeResponse();
    const orchestrator = makeOrchestrator({ issueId: "issue-uuid", state: "Done" });
    const configStore = makeConfigStore();
    stateMachineMock.setNextResult({ ok: false, reason: "transition not allowed" });

    await handleTransition(
      { orchestrator: orchestrator as never, configStore: configStore as never },
      makeRequest({ target_state: "todo" }, { issue_identifier: "MT-1" }),
      res,
    );

    expect(res._status).toBe(422);
    expect(res._body).toEqual({ ok: false, reason: "transition not allowed" });
    expect(stateMachineMock.instances[0]?.assertTransition).toHaveBeenCalledWith("Done", "todo");
  });

  it("constructs a custom state machine with mapped terminal flags when config declares one", async () => {
    const res = makeResponse();
    const orchestrator = makeOrchestrator({ issueId: "issue-uuid", state: "Todo" });
    const tracker = makeTracker();
    const configStore = makeConfigStore({
      stateMachine: {
        stages: [
          { name: "Todo", kind: "active" },
          { name: "Done", kind: "terminal" },
        ],
        transitions: [{ from: "Todo", to: "Done" }],
      },
    });

    await handleTransition(
      { orchestrator: orchestrator as never, tracker: tracker as never, configStore: configStore as never },
      makeRequest({ target_state: "Done" }, { issue_identifier: "MT-1" }),
      res,
    );

    expect(stateMachineMock.instances[0]?.config).toEqual({
      stages: [
        { key: "Todo", terminal: false },
        { key: "Done", terminal: true },
      ],
      transitions: [{ from: "Todo", to: "Done" }],
      activeStates: ["Todo", "In Progress"],
      terminalStates: ["Done"],
    });
  });

  it("constructs the fallback state machine config when no custom state machine exists", async () => {
    const res = makeResponse();
    const orchestrator = makeOrchestrator({ issueId: "issue-uuid", state: "Todo" });
    const tracker = makeTracker();
    const configStore = makeConfigStore();

    await handleTransition(
      { orchestrator: orchestrator as never, tracker: tracker as never, configStore: configStore as never },
      makeRequest({ target_state: "in progress" }, { issue_identifier: "MT-1" }),
      res,
    );

    expect(stateMachineMock.instances[0]?.config).toEqual({
      activeStates: ["Todo", "In Progress"],
      terminalStates: ["Done"],
    });
  });

  it("returns 200 on successful transition", async () => {
    const res = makeResponse();
    const orchestrator = makeOrchestrator({ issueId: "issue-uuid", state: "Todo" });
    const tracker = makeTracker();
    const configStore = makeConfigStore();

    await handleTransition(
      { orchestrator: orchestrator as never, tracker: tracker as never, configStore: configStore as never },
      makeRequest({ target_state: "in progress" }, { issue_identifier: "MT-1" }),
      res,
    );

    expect(res._status).toBe(200);
    expect(res._body).toEqual({ ok: true, from: "Todo", to: "in progress" });
    expect(tracker.resolveStateId).toHaveBeenCalledWith("in progress");
    expect(tracker.transitionIssue).toHaveBeenCalledWith("issue-uuid", "state-uuid-123");
  });

  it("calls orchestrator.requestRefresh after a successful transition", async () => {
    const res = makeResponse();
    const orchestrator = makeOrchestrator({ issueId: "issue-uuid", state: "Todo" });
    const tracker = makeTracker();
    const configStore = makeConfigStore();

    await handleTransition(
      { orchestrator: orchestrator as never, tracker: tracker as never, configStore: configStore as never },
      makeRequest({ target_state: "in progress" }, { issue_identifier: "MT-1" }),
      res,
    );

    expect(orchestrator.requestRefresh).toHaveBeenCalledWith("manual-transition");
  });

  it("returns the full unavailable error payload when tracker is not configured", async () => {
    const res = makeResponse();
    const orchestrator = makeOrchestrator({ issueId: "issue-uuid", state: "Todo" });

    await handleTransition(
      { orchestrator: orchestrator as never },
      makeRequest({ target_state: "in progress" }, { issue_identifier: "MT-1" }),
      res,
    );

    expect(res._status).toBe(503);
    expect(res._body).toEqual({
      error: {
        code: "unavailable",
        message: "Tracker not configured",
      },
    });
  });

  it("returns the exact not-found reason when tracker state resolution fails", async () => {
    const res = makeResponse();
    const orchestrator = makeOrchestrator({ issueId: "issue-uuid", state: "Todo" });
    const tracker = makeTracker(null);
    const configStore = makeConfigStore();

    await handleTransition(
      { orchestrator: orchestrator as never, tracker: tracker as never, configStore: configStore as never },
      makeRequest({ target_state: "blocked" }, { issue_identifier: "MT-1" }),
      res,
    );

    expect(res._status).toBe(422);
    expect(res._body).toEqual({ ok: false, reason: "No tracker state found matching: blocked" });
  });

  it("returns the exact failure payload when the tracker transition fails", async () => {
    const res = makeResponse();
    const orchestrator = makeOrchestrator({ issueId: "issue-uuid", state: "Todo" });
    const tracker = makeTracker("state-uuid-123", false);
    const configStore = makeConfigStore();

    await handleTransition(
      { orchestrator: orchestrator as never, tracker: tracker as never, configStore: configStore as never },
      makeRequest({ target_state: "in progress" }, { issue_identifier: "MT-1" }),
      res,
    );

    expect(res._status).toBe(422);
    expect(res._body).toEqual({ ok: false, reason: "Issue state transition failed" });
    expect(orchestrator.requestRefresh).not.toHaveBeenCalled();
  });
});
