import { describe, expect, it, vi } from "vitest";
import type { Request } from "express";

import {
  handleListAutomations,
  handleListAutomationRuns,
  handleRunAutomation,
} from "../../src/http/automations-handler.js";
import { AutomationStore } from "../../src/persistence/sqlite/automation-store.js";
import { makeMockResponse } from "../helpers.js";

function makeRequest(input: { params?: Record<string, string>; query?: Record<string, unknown> }): Request {
  return {
    params: input.params ?? {},
    query: input.query ?? {},
  } as unknown as Request;
}

describe("automation handlers", () => {
  it("lists configured automations from the scheduler", async () => {
    const res = makeMockResponse();

    await handleListAutomations(
      {
        scheduler: {
          listAutomations: () => [
            {
              name: "nightly-report",
              schedule: "0 2 * * *",
              mode: "report",
              enabled: true,
              repoUrl: "https://github.com/acme/app",
              valid: true,
              nextRun: "2026-04-05T00:00:00.000Z",
              lastError: null,
            },
          ],
          runNow: vi.fn(),
        } as never,
      },
      makeRequest({}),
      res,
    );

    expect(res._status).toBe(200);
    expect((res._body as { automations: unknown[] }).automations).toHaveLength(1);
  });

  it("lists persisted automation runs", async () => {
    const store = AutomationStore.create(null);
    const created = await store.createRun({
      automationName: "nightly-report",
      mode: "report",
      trigger: "schedule",
      repoUrl: "https://github.com/acme/app",
      startedAt: "2026-04-04T11:00:00.000Z",
    });
    await store.finishRun(created.id, {
      status: "completed",
      output: "ok",
      details: null,
      issueId: null,
      issueIdentifier: null,
      issueUrl: null,
      error: null,
      finishedAt: "2026-04-04T11:01:00.000Z",
    });
    const res = makeMockResponse();

    await handleListAutomationRuns({ automationStore: store }, makeRequest({ query: { limit: "10" } }), res);

    expect(res._status).toBe(200);
    expect((res._body as { runs: unknown[] }).runs).toHaveLength(1);
  });

  it("runs an automation immediately through the scheduler", async () => {
    const res = makeMockResponse();
    const runNow = vi.fn().mockResolvedValue({
      id: "run-1",
      automationName: "nightly-report",
      mode: "report",
      trigger: "manual",
      repoUrl: "https://github.com/acme/app",
      status: "completed",
      output: "ok",
      details: null,
      issueId: null,
      issueIdentifier: null,
      issueUrl: null,
      error: null,
      startedAt: "2026-04-04T11:00:00.000Z",
      finishedAt: "2026-04-04T11:01:00.000Z",
    });

    await handleRunAutomation(
      {
        scheduler: {
          listAutomations: vi.fn(),
          runNow,
        } as never,
      },
      makeRequest({ params: { automation_name: "nightly-report" } }),
      res,
    );

    expect(runNow).toHaveBeenCalledWith("nightly-report");
    expect(res._status).toBe(202);
  });
});
