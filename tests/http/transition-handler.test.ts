import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

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

function makeLinearClient(stateId: string | null = "state-uuid-123") {
  return {
    resolveStateId: vi.fn().mockResolvedValue(stateId),
    runGraphQL: vi.fn().mockResolvedValue({
      data: {
        issueUpdate: {
          success: true,
          issue: { id: "issue-uuid", identifier: "MT-1", state: { name: "In Progress" } },
        },
      },
    }),
  };
}

function makeConfigStore() {
  return {
    getConfig: vi.fn().mockReturnValue({
      tracker: { activeStates: ["Todo", "In Progress"], terminalStates: ["Done"] },
      stateMachine: null,
    }),
  };
}

describe("handleTransition", () => {
  // NOTE: Body validation (missing/empty target_state) is now handled by the
  // validateBody() middleware. Those cases are covered in
  // tests/http/validation.test.ts and tests/http/server.test.ts.

  it("returns 404 when issue is not found", async () => {
    const res = makeResponse();
    await handleTransition(
      { orchestrator: makeOrchestrator(null) as never },
      makeRequest({ target_state: "In Progress" }, { issue_identifier: "MT-UNKNOWN" }),
      res,
    );
    expect(res._status).toBe(404);
  });

  it("returns 422 when transition is invalid", async () => {
    const res = makeResponse();
    const orchestrator = makeOrchestrator({ issueId: "issue-uuid", state: "Done" });
    const configStore = makeConfigStore();
    await handleTransition(
      { orchestrator: orchestrator as never, configStore: configStore as never },
      makeRequest({ target_state: "todo" }, { issue_identifier: "MT-1" }),
      res,
    );
    expect(res._status).toBe(422);
    expect((res._body as Record<string, unknown>).ok).toBe(false);
  });

  it("returns 200 on successful transition", async () => {
    const res = makeResponse();
    const orchestrator = makeOrchestrator({ issueId: "issue-uuid", state: "Todo" });
    const linearClient = makeLinearClient();
    const configStore = makeConfigStore();
    await handleTransition(
      { orchestrator: orchestrator as never, linearClient: linearClient as never, configStore: configStore as never },
      makeRequest({ target_state: "in progress" }, { issue_identifier: "MT-1" }),
      res,
    );
    expect(res._status).toBe(200);
    const body = res._body as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.from).toBe("Todo");
    expect(body.to).toBe("in progress");
  });

  it("calls orchestrator.requestRefresh after successful transition", async () => {
    const res = makeResponse();
    const orchestrator = makeOrchestrator({ issueId: "issue-uuid", state: "Todo" });
    const linearClient = makeLinearClient();
    const configStore = makeConfigStore();
    await handleTransition(
      { orchestrator: orchestrator as never, linearClient: linearClient as never, configStore: configStore as never },
      makeRequest({ target_state: "in progress" }, { issue_identifier: "MT-1" }),
      res,
    );
    expect(orchestrator.requestRefresh).toHaveBeenCalledWith("manual-transition");
  });

  it("returns 503 when linearClient is not configured", async () => {
    const res = makeResponse();
    const orchestrator = makeOrchestrator({ issueId: "issue-uuid", state: "Todo" });
    await handleTransition(
      { orchestrator: orchestrator as never },
      makeRequest({ target_state: "in progress" }, { issue_identifier: "MT-1" }),
      res,
    );
    expect(res._status).toBe(503);
  });
});
