import { describe, expect, it, vi } from "vitest";
import type { FastifyReply, FastifyRequest } from "fastify";

import { handleTransition } from "../../src/http/transition-handler.js";

function makeRequest(
  body: Record<string, unknown> = {},
  params: Record<string, string> = {},
): FastifyRequest<{ Params: { issue_identifier: string }; Body: Record<string, unknown> }> {
  return { body, params, headers: {} } as unknown as FastifyRequest<{
    Params: { issue_identifier: string };
    Body: Record<string, unknown>;
  }>;
}

function makeReply(): FastifyReply & { _status: number; _body: unknown } {
  const reply = {
    _status: 200,
    _body: null as unknown,
    status(code: number) {
      reply._status = code;
      return reply;
    },
    send(data: unknown) {
      reply._body = data;
      return reply;
    },
  };
  return reply as unknown as FastifyReply & { _status: number; _body: unknown };
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
  it("returns 400 when target_state is missing", async () => {
    const reply = makeReply();
    await handleTransition(
      { orchestrator: makeOrchestrator() as never },
      makeRequest({}, { issue_identifier: "MT-1" }),
      reply,
    );
    expect(reply._status).toBe(400);
    expect((reply._body as Record<string, unknown>).error).toEqual(
      expect.objectContaining({ code: "missing_target_state" }),
    );
  });

  it("returns 400 when target_state is empty string", async () => {
    const reply = makeReply();
    await handleTransition(
      { orchestrator: makeOrchestrator() as never },
      makeRequest({ target_state: "   " }, { issue_identifier: "MT-1" }),
      reply,
    );
    expect(reply._status).toBe(400);
  });

  it("returns 404 when issue is not found", async () => {
    const reply = makeReply();
    await handleTransition(
      { orchestrator: makeOrchestrator(null) as never },
      makeRequest({ target_state: "In Progress" }, { issue_identifier: "MT-UNKNOWN" }),
      reply,
    );
    expect(reply._status).toBe(404);
  });

  it("returns 422 when transition is invalid", async () => {
    const reply = makeReply();
    const orchestrator = makeOrchestrator({ issueId: "issue-uuid", state: "Done" });
    const configStore = makeConfigStore();
    await handleTransition(
      { orchestrator: orchestrator as never, configStore: configStore as never },
      makeRequest({ target_state: "todo" }, { issue_identifier: "MT-1" }),
      reply,
    );
    expect(reply._status).toBe(422);
    expect((reply._body as Record<string, unknown>).ok).toBe(false);
  });

  it("returns 200 on successful transition", async () => {
    const reply = makeReply();
    const orchestrator = makeOrchestrator({ issueId: "issue-uuid", state: "Todo" });
    const linearClient = makeLinearClient();
    const configStore = makeConfigStore();
    await handleTransition(
      { orchestrator: orchestrator as never, linearClient: linearClient as never, configStore: configStore as never },
      makeRequest({ target_state: "in progress" }, { issue_identifier: "MT-1" }),
      reply,
    );
    expect(reply._status).toBe(200);
    const body = reply._body as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.from).toBe("Todo");
    expect(body.to).toBe("in progress");
  });

  it("calls orchestrator.requestRefresh after successful transition", async () => {
    const reply = makeReply();
    const orchestrator = makeOrchestrator({ issueId: "issue-uuid", state: "Todo" });
    const linearClient = makeLinearClient();
    const configStore = makeConfigStore();
    await handleTransition(
      { orchestrator: orchestrator as never, linearClient: linearClient as never, configStore: configStore as never },
      makeRequest({ target_state: "in progress" }, { issue_identifier: "MT-1" }),
      reply,
    );
    expect(orchestrator.requestRefresh).toHaveBeenCalledWith("manual-transition");
  });

  it("returns 503 when linearClient is not configured", async () => {
    const reply = makeReply();
    const orchestrator = makeOrchestrator({ issueId: "issue-uuid", state: "Todo" });
    await handleTransition(
      { orchestrator: orchestrator as never },
      makeRequest({ target_state: "in progress" }, { issue_identifier: "MT-1" }),
      reply,
    );
    expect(reply._status).toBe(503);
  });
});
