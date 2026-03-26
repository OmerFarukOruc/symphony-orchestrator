import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

import { handleModelUpdate } from "../../src/http/model-handler.js";

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

function makeOrchestrator(updateResult: unknown = null) {
  return {
    updateIssueModelSelection: vi.fn().mockResolvedValue(updateResult),
  };
}

describe("handleModelUpdate", () => {
  // NOTE: Body validation (missing model, invalid reasoning_effort, etc.) is now
  // handled by the validateBody() middleware. Those cases are covered in
  // tests/http/validation.test.ts and tests/http/server.test.ts.

  it("returns 404 when orchestrator returns null", async () => {
    const res = makeResponse();
    await handleModelUpdate(
      makeOrchestrator(null) as never,
      makeRequest({ model: "gpt-4o" }, { issue_identifier: "MT-1" }),
      res,
    );
    expect(res._status).toBe(404);
  });

  it("returns 202 with correct shape on success", async () => {
    const res = makeResponse();
    await handleModelUpdate(
      makeOrchestrator({
        updated: true,
        restarted: false,
        appliesNextAttempt: true,
        selection: { model: "gpt-4o", reasoningEffort: "high", source: "override" },
      }) as never,
      makeRequest({ model: "gpt-4o", reasoning_effort: "high" }, { issue_identifier: "MT-1" }),
      res,
    );
    expect(res._status).toBe(202);
    const body = res._body as Record<string, unknown>;
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
    const res = makeResponse();
    const orch = makeOrchestrator({
      updated: true,
      restarted: false,
      appliesNextAttempt: false,
      selection: { model: "gpt-4o", reasoningEffort: "medium", source: "override" },
    });
    await handleModelUpdate(
      orch as never,
      makeRequest({ model: "gpt-4o", reasoningEffort: "medium" }, { issue_identifier: "MT-1" }),
      res,
    );
    expect(res._status).toBe(202);
  });

  it("passes null reasoning_effort when not provided", async () => {
    const orch = makeOrchestrator({
      updated: true,
      restarted: false,
      appliesNextAttempt: false,
      selection: { model: "gpt-4o", reasoningEffort: null, source: "override" },
    });
    const res = makeResponse();
    await handleModelUpdate(orch as never, makeRequest({ model: "gpt-4o" }, { issue_identifier: "MT-1" }), res);
    expect(res._status).toBe(202);
    expect(orch.updateIssueModelSelection).toHaveBeenCalledWith(expect.objectContaining({ reasoningEffort: null }));
  });

  it("accepts valid effort values: none, minimal, low, medium, high, xhigh", async () => {
    for (const effort of ["none", "minimal", "low", "medium", "high", "xhigh"]) {
      const res = makeResponse();
      await handleModelUpdate(
        makeOrchestrator({
          updated: true,
          restarted: false,
          appliesNextAttempt: false,
          selection: { model: "gpt-4o", reasoningEffort: effort, source: "override" },
        }) as never,
        makeRequest({ model: "gpt-4o", reasoning_effort: effort }, { issue_identifier: "MT-1" }),
        res,
      );
      expect(res._status).toBe(202);
    }
  });
});
