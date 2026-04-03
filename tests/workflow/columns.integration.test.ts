import { describe, expect, it } from "vitest";

import { buildWorkflowColumns } from "../../src/workflow/columns.js";
import type { RuntimeIssueView, ServiceConfig } from "../../src/core/types.js";

function makeIssueView(overrides: Partial<RuntimeIssueView>): RuntimeIssueView {
  return {
    issueId: "issue-1",
    identifier: "TEST-1",
    title: "Test issue",
    state: "Todo",
    workspaceKey: null,
    message: null,
    status: "queued",
    updatedAt: "2025-01-01T00:00:00Z",
    attempt: null,
    error: null,
    ...overrides,
  };
}

function makeConfig(overrides?: Partial<ServiceConfig>): ServiceConfig {
  return {
    tracker: {
      kind: "linear",
      apiKey: "test-key",
      endpoint: "https://api.linear.app/graphql",
      projectSlug: "TEST",
      activeStates: ["Todo", "In Progress"],
      terminalStates: ["Done", "Canceled"],
    },
    polling: { intervalMs: 30_000 },
    workspace: {
      root: "/tmp/workspaces",
      hooks: {
        afterCreate: null,
        beforeRun: null,
        afterRun: null,
        beforeRemove: null,
        timeoutMs: 60_000,
      },
      strategy: "directory",
      branchPrefix: "risoluto/",
    },
    agent: {
      maxConcurrentAgents: 2,
      maxConcurrentAgentsByState: {},
      maxTurns: 10,
      maxRetryBackoffMs: 300_000,
      maxContinuationAttempts: 3,
      successState: null,
      stallTimeoutMs: 600_000,
    },
    codex: {
      command: "codex",
      model: "gpt-4",
      reasoningEffort: "medium",
      auth: { mode: "api_key", sourceHome: "" },
      provider: null,
      sandbox: null,
    } as ServiceConfig["codex"],
    server: { port: 4_000 },
    ...overrides,
  };
}

describe("workflow columns integration", () => {
  it("creates columns for active and terminal states in order", () => {
    const columns = buildWorkflowColumns(makeConfig(), {
      running: [],
      retrying: [],
    });

    expect(columns.map((column) => column.key)).toEqual(["todo", "in progress", "done", "canceled"]);
    expect(columns.find((column) => column.key === "done")).toMatchObject({
      kind: "terminal",
      terminal: true,
      count: 0,
    });
  });

  it("places issues into normalized columns and creates an other bucket for unknown states", () => {
    const columns = buildWorkflowColumns(makeConfig(), {
      running: [makeIssueView({ issueId: "r1", identifier: "T-1", state: "In Progress" })],
      retrying: [],
      queued: [makeIssueView({ issueId: "q1", identifier: "T-2", state: "Todo" })],
      completed: [makeIssueView({ issueId: "u1", identifier: "T-3", state: "Unknown State" })],
    });

    expect(columns.find((column) => column.key === "in progress")?.count).toBe(1);
    expect(columns.find((column) => column.key === "todo")?.count).toBe(1);
    expect(columns.find((column) => column.key === "other")).toMatchObject({
      key: "other",
      count: 1,
    });
  });

  it("deduplicates issues across groups by identifier and then by issueId", () => {
    const duplicate = makeIssueView({ issueId: "dup-1", identifier: "T-1", state: "In Progress" });
    const idOnlyDuplicate = makeIssueView({ issueId: "dup-id", identifier: "", state: "Todo" });

    const columns = buildWorkflowColumns(makeConfig(), {
      running: [duplicate, idOnlyDuplicate],
      retrying: [{ ...duplicate }, { ...idOnlyDuplicate }],
      queued: [{ ...duplicate, state: "Todo" }],
    });

    expect(columns.reduce((total, column) => total + column.count, 0)).toBe(2);
  });
});
