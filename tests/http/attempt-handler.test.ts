import { describe, expect, it, vi } from "vitest";
import type { Request } from "express";

import { handleAttemptDetail } from "../../src/http/attempt-handler.js";
import { makeMockResponse } from "../helpers.js";

function makeOrchestrator() {
  return {
    getAttemptDetail: vi.fn(),
  };
}

function makeRequest(attemptId: string): Request {
  return { params: { attempt_id: attemptId } } as unknown as Request;
}

describe("handleAttemptDetail", () => {
  it("returns 200 with attempt data when found", () => {
    const orchestrator = makeOrchestrator();
    const detail = {
      attemptId: "att-1",
      issueIdentifier: "MT-42",
      startedAt: "2024-06-01T00:00:00Z",
      status: "completed",
    };
    orchestrator.getAttemptDetail.mockReturnValue(detail);

    const response = makeMockResponse();
    handleAttemptDetail(orchestrator as never, makeRequest("att-1"), response);

    expect(orchestrator.getAttemptDetail).toHaveBeenCalledWith("att-1");
    expect(response._status).toBe(200);
    expect(response._body).toEqual(detail);
  });

  it("returns 404 with error when attempt is not found", () => {
    const orchestrator = makeOrchestrator();
    orchestrator.getAttemptDetail.mockReturnValue(null);

    const response = makeMockResponse();
    handleAttemptDetail(orchestrator as never, makeRequest("missing"), response);

    expect(orchestrator.getAttemptDetail).toHaveBeenCalledWith("missing");
    expect(response._status).toBe(404);
    expect(response._body).toEqual({
      error: {
        code: "not_found",
        message: "Unknown attempt identifier",
      },
    });
  });

  it("coerces numeric attempt_id param to string", () => {
    const orchestrator = makeOrchestrator();
    orchestrator.getAttemptDetail.mockReturnValue(null);

    const request = { params: { attempt_id: 123 } } as unknown as Request;
    const response = makeMockResponse();
    handleAttemptDetail(orchestrator as never, request, response);

    expect(orchestrator.getAttemptDetail).toHaveBeenCalledWith("123");
  });
});
