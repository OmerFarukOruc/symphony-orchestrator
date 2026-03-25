import { describe, expect, it, vi } from "vitest";
import type { FastifyReply, FastifyRequest } from "fastify";

import { handleModelUpdate } from "../../src/http/model-handler.js";

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

function makeOrchestrator(updateResult: unknown = null) {
  return {
    updateIssueModelSelection: vi.fn().mockResolvedValue(updateResult),
  };
}

describe("handleModelUpdate", () => {
  it("returns 400 when model is missing", async () => {
    const reply = makeReply();
    await handleModelUpdate(makeOrchestrator() as never, makeRequest({}, { issue_identifier: "MT-1" }), reply);
    expect(reply._status).toBe(400);
    expect((reply._body as Record<string, unknown>).error).toEqual(expect.objectContaining({ code: "invalid_model" }));
  });

  it("returns 400 when model is empty string", async () => {
    const reply = makeReply();
    await handleModelUpdate(
      makeOrchestrator() as never,
      makeRequest({ model: "   " }, { issue_identifier: "MT-1" }),
      reply,
    );
    expect(reply._status).toBe(400);
  });

  it("returns 400 for invalid reasoning_effort", async () => {
    const reply = makeReply();
    await handleModelUpdate(
      makeOrchestrator() as never,
      makeRequest({ model: "gpt-4o", reasoning_effort: "invalid" }, { issue_identifier: "MT-1" }),
      reply,
    );
    expect(reply._status).toBe(400);
    expect((reply._body as Record<string, { code: string }>).error.code).toBe("invalid_reasoning_effort");
  });

  it("returns 400 for non-string reasoning_effort", async () => {
    const reply = makeReply();
    await handleModelUpdate(
      makeOrchestrator() as never,
      makeRequest({ model: "gpt-4o", reasoning_effort: 42 }, { issue_identifier: "MT-1" }),
      reply,
    );
    expect(reply._status).toBe(400);
  });

  it("returns 404 when orchestrator returns null", async () => {
    const reply = makeReply();
    await handleModelUpdate(
      makeOrchestrator(null) as never,
      makeRequest({ model: "gpt-4o" }, { issue_identifier: "MT-1" }),
      reply,
    );
    expect(reply._status).toBe(404);
  });

  it("returns 202 with correct shape on success", async () => {
    const reply = makeReply();
    await handleModelUpdate(
      makeOrchestrator({
        updated: true,
        restarted: false,
        appliesNextAttempt: true,
        selection: { model: "gpt-4o", reasoningEffort: "high", source: "override" },
      }) as never,
      makeRequest({ model: "gpt-4o", reasoning_effort: "high" }, { issue_identifier: "MT-1" }),
      reply,
    );
    expect(reply._status).toBe(202);
    const body = reply._body as Record<string, unknown>;
    expect(body.updated).toBe(true);
    expect(body.restarted).toBe(false);
    expect(body.applies_next_attempt).toBe(true);
    expect(body.selection).toEqual({
      model: "gpt-4o",
      reasoning_effort: "high",
      source: "override",
    });
  });

  it("accepts reasoningEffort (camelCase) alternative key", async () => {
    const reply = makeReply();
    const orch = makeOrchestrator({
      updated: true,
      restarted: false,
      appliesNextAttempt: false,
      selection: { model: "gpt-4o", reasoningEffort: "medium", source: "override" },
    });
    await handleModelUpdate(
      orch as never,
      makeRequest({ model: "gpt-4o", reasoningEffort: "medium" }, { issue_identifier: "MT-1" }),
      reply,
    );
    expect(reply._status).toBe(202);
  });

  it("passes null reasoning_effort when not provided", async () => {
    const orch = makeOrchestrator({
      updated: true,
      restarted: false,
      appliesNextAttempt: false,
      selection: { model: "gpt-4o", reasoningEffort: null, source: "override" },
    });
    const reply = makeReply();
    await handleModelUpdate(orch as never, makeRequest({ model: "gpt-4o" }, { issue_identifier: "MT-1" }), reply);
    expect(reply._status).toBe(202);
    expect(orch.updateIssueModelSelection).toHaveBeenCalledWith(expect.objectContaining({ reasoningEffort: null }));
  });

  it("accepts valid effort values: none, minimal, low, medium, high, xhigh", async () => {
    for (const effort of ["none", "minimal", "low", "medium", "high", "xhigh"]) {
      const reply = makeReply();
      await handleModelUpdate(
        makeOrchestrator({
          updated: true,
          restarted: false,
          appliesNextAttempt: false,
          selection: { model: "gpt-4o", reasoningEffort: effort, source: "override" },
        }) as never,
        makeRequest({ model: "gpt-4o", reasoning_effort: effort }, { issue_identifier: "MT-1" }),
        reply,
      );
      expect(reply._status).toBe(202);
    }
  });
});
