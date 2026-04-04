import { describe, expect, it, vi } from "vitest";
import type { Request } from "express";

import { handleTriggerDispatch, type TriggerHandlerDeps } from "../../src/http/trigger-handler.js";
import { createMockLogger, makeMockResponse } from "../helpers.js";

function makeDeps(overrides: Partial<TriggerHandlerDeps> = {}): TriggerHandlerDeps {
  return {
    configStore: {
      getConfig: () =>
        ({
          triggers: {
            apiKey: "trigger-secret",
            allowedActions: ["create_issue", "re_poll", "refresh_issue"],
            githubSecret: null,
            rateLimitPerMinute: 30,
          },
        }) as ReturnType<NonNullable<TriggerHandlerDeps["configStore"]>["getConfig"]>,
    },
    tracker: {
      createIssue: vi.fn().mockResolvedValue({
        issueId: "issue-1",
        identifier: "ENG-1",
        url: "https://tracker.example/issues/ENG-1",
      }),
    } as TriggerHandlerDeps["tracker"],
    orchestrator: {
      requestRefresh: vi.fn().mockReturnValue({
        queued: true,
        coalesced: false,
      }),
      requestTargetedRefresh: vi.fn(),
    },
    webhookInbox: {
      insertVerified: vi.fn().mockResolvedValue({ isNew: true }),
    },
    logger: createMockLogger(),
    ...overrides,
  };
}

function makeRequest(input: { headers?: Record<string, string>; body?: Record<string, unknown> }): Request {
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(input.headers ?? {})) {
    headers[key.toLowerCase()] = value;
  }
  return {
    body: input.body ?? {},
    get: vi.fn((name: string) => headers[name.toLowerCase()]),
  } as unknown as Request;
}

describe("handleTriggerDispatch", () => {
  it("rejects requests with an invalid API key", async () => {
    const deps = makeDeps();
    const req = makeRequest({
      headers: { "x-risoluto-trigger-key": "wrong" },
      body: { action: "re_poll" },
    });
    const res = makeMockResponse();

    await handleTriggerDispatch(deps, req, res);

    expect(res._status).toBe(401);
  });

  it("dispatches re_poll via the orchestrator", async () => {
    const deps = makeDeps();
    const req = makeRequest({
      headers: { "x-risoluto-trigger-key": "trigger-secret" },
      body: { action: "re_poll" },
    });
    const res = makeMockResponse();

    await handleTriggerDispatch(deps, req, res);

    expect(deps.orchestrator.requestRefresh).toHaveBeenCalledWith("trigger:re_poll");
    expect(res._status).toBe(202);
  });

  it("requests a targeted refresh when refresh_issue includes issue identity", async () => {
    const deps = makeDeps();
    const req = makeRequest({
      headers: { authorization: "Bearer trigger-secret" },
      body: { action: "refresh_issue", issue_id: "issue-2", issue_identifier: "ENG-2" },
    });
    const res = makeMockResponse();

    await handleTriggerDispatch(deps, req, res);

    expect(deps.orchestrator.requestTargetedRefresh).toHaveBeenCalledWith("issue-2", "ENG-2", "trigger:refresh_issue");
    expect(res._status).toBe(202);
  });

  it("creates a tracker issue for create_issue actions", async () => {
    const deps = makeDeps();
    const req = makeRequest({
      headers: { "x-risoluto-trigger-key": "trigger-secret" },
      body: {
        action: "create_issue",
        title: "Investigate failing deploy",
        description: "Production deploy is red",
        state_name: "Backlog",
      },
    });
    const res = makeMockResponse();

    await handleTriggerDispatch(deps, req, res);

    expect(deps.tracker?.createIssue).toHaveBeenCalledWith({
      title: "Investigate failing deploy",
      description: "Production deploy is red",
      stateName: "Backlog",
    });
    expect(deps.orchestrator.requestTargetedRefresh).toHaveBeenCalledWith("issue-1", "ENG-1", "trigger:create_issue");
    expect(res._status).toBe(202);
  });

  it("returns a duplicate response when the idempotency key was already processed", async () => {
    const deps = makeDeps({
      webhookInbox: {
        insertVerified: vi.fn().mockResolvedValue({ isNew: false }),
      },
    });
    const req = makeRequest({
      headers: {
        "x-risoluto-trigger-key": "trigger-secret",
        "idempotency-key": "dup-1",
      },
      body: { action: "re_poll" },
    });
    const res = makeMockResponse();

    await handleTriggerDispatch(deps, req, res);

    expect(res._status).toBe(200);
    expect(res._body).toMatchObject({ ok: true, duplicate: true });
    expect(deps.orchestrator.requestRefresh).not.toHaveBeenCalled();
  });

  it("returns 403 when the action is outside the allowlist", async () => {
    const deps = makeDeps({
      configStore: {
        getConfig: () =>
          ({
            triggers: {
              apiKey: "trigger-secret",
              allowedActions: ["re_poll"],
              githubSecret: null,
              rateLimitPerMinute: 30,
            },
          }) as ReturnType<NonNullable<TriggerHandlerDeps["configStore"]>["getConfig"]>,
      },
    });
    const req = makeRequest({
      headers: { "x-risoluto-trigger-key": "trigger-secret" },
      body: { action: "create_issue", title: "Blocked job" },
    });
    const res = makeMockResponse();

    await handleTriggerDispatch(deps, req, res);

    expect(res._status).toBe(403);
  });
});
