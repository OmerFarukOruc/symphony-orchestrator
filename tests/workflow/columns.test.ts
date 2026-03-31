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
    polling: { intervalMs: 30000 },
    workspace: {
      root: "/tmp/workspaces",
      hooks: {
        afterCreate: null,
        beforeRun: null,
        afterRun: null,
        beforeRemove: null,
        timeoutMs: 60000,
      },
      strategy: "directory",
      branchPrefix: "risoluto/",
    },
    agent: {
      maxConcurrentAgents: 2,
      maxConcurrentAgentsByState: {},
      maxTurns: 10,
      maxRetryBackoffMs: 300000,
      maxContinuationAttempts: 3,
      successState: null,
      stallTimeoutMs: 600000,
    },
    codex: {
      command: "codex",
      model: "gpt-4",
      reasoningEffort: "medium",
      auth: { mode: "api_key", sourceHome: "" },
      provider: null,
      sandbox: null,
    } as ServiceConfig["codex"],
    server: { port: 4000 },
    ...overrides,
  };
}

describe("buildWorkflowColumns", () => {
  describe("column structure from config", () => {
    it("creates columns for all active and terminal states", () => {
      const config = makeConfig();
      const columns = buildWorkflowColumns(config, {
        running: [],
        retrying: [],
      });

      expect(columns).toHaveLength(4);
      expect(columns.map((col) => col.key)).toEqual(["todo", "in progress", "done", "canceled"]);
    });

    it("sets correct kind and terminal flags", () => {
      const config = makeConfig();
      const columns = buildWorkflowColumns(config, {
        running: [],
        retrying: [],
      });

      const todoColumn = columns.find((col) => col.key === "todo");
      expect(todoColumn?.kind).toBe("todo");
      expect(todoColumn?.terminal).toBe(false);

      const doneColumn = columns.find((col) => col.key === "done");
      expect(doneColumn?.kind).toBe("terminal");
      expect(doneColumn?.terminal).toBe(true);
    });

    it("initializes all columns with zero counts and empty issue arrays", () => {
      const config = makeConfig();
      const columns = buildWorkflowColumns(config, {
        running: [],
        retrying: [],
      });

      for (const column of columns) {
        expect(column.count).toBe(0);
        expect(column.issues).toEqual([]);
      }
    });
  });

  describe("issue placement", () => {
    it("places issues into the correct column by normalized state", () => {
      const config = makeConfig();
      const running = [makeIssueView({ issueId: "r1", identifier: "T-1", state: "In Progress" })];
      const queued = [makeIssueView({ issueId: "q1", identifier: "T-2", state: "Todo" })];

      const columns = buildWorkflowColumns(config, {
        running,
        retrying: [],
        queued,
      });

      const inProgressCol = columns.find((col) => col.key === "in progress");
      expect(inProgressCol?.count).toBe(1);
      expect(inProgressCol?.issues).toHaveLength(1);
      expect(inProgressCol?.issues[0].identifier).toBe("T-1");

      const todoCol = columns.find((col) => col.key === "todo");
      expect(todoCol?.count).toBe(1);
      expect(todoCol?.issues[0].identifier).toBe("T-2");
    });

    it("places completed issues into terminal columns", () => {
      const config = makeConfig();
      const completed = [makeIssueView({ issueId: "c1", identifier: "T-3", state: "Done" })];

      const columns = buildWorkflowColumns(config, {
        running: [],
        retrying: [],
        completed,
      });

      const doneCol = columns.find((col) => col.key === "done");
      expect(doneCol?.count).toBe(1);
      expect(doneCol?.issues[0].identifier).toBe("T-3");
    });
  });

  describe("deduplication", () => {
    it("deduplicates issues with the same identifier across groups", () => {
      const config = makeConfig();
      const issue = makeIssueView({ issueId: "dup-1", identifier: "T-1", state: "In Progress" });

      const columns = buildWorkflowColumns(config, {
        running: [issue],
        retrying: [{ ...issue }],
        queued: [{ ...issue, state: "Todo" }],
      });

      const totalIssues = columns.reduce((sum, col) => sum + col.count, 0);
      expect(totalIssues).toBe(1);
    });

    it("deduplicates by issueId when identifier is empty", () => {
      const config = makeConfig();
      const issue = makeIssueView({
        issueId: "dup-id",
        identifier: "",
        state: "Todo",
      });

      const columns = buildWorkflowColumns(config, {
        running: [issue],
        retrying: [{ ...issue }],
      });

      const totalIssues = columns.reduce((sum, col) => sum + col.count, 0);
      expect(totalIssues).toBe(1);
    });

    it("skips issues with no identifier and no issueId", () => {
      const config = makeConfig();
      const issue = makeIssueView({
        issueId: "",
        identifier: "",
        state: "Todo",
      });

      const columns = buildWorkflowColumns(config, {
        running: [issue],
        retrying: [],
      });

      const totalIssues = columns.reduce((sum, col) => sum + col.count, 0);
      expect(totalIssues).toBe(0);
    });
  });

  describe("other bucket handling", () => {
    it("creates an 'other' column for issues with unknown states", () => {
      const config = makeConfig();
      const running = [makeIssueView({ issueId: "o1", identifier: "T-1", state: "Unknown State" })];

      const columns = buildWorkflowColumns(config, {
        running,
        retrying: [],
      });

      const otherCol = columns.find((col) => col.key === "other");
      expect(otherCol).toMatchObject({
        key: "other",
        label: "Other",
        kind: "other",
        terminal: false,
        count: 1,
      });
      expect(otherCol?.issues[0].identifier).toBe("T-1");
    });

    it("does not create 'other' column when all issues map to known states", () => {
      const config = makeConfig();
      const running = [makeIssueView({ issueId: "k1", identifier: "T-1", state: "Todo" })];

      const columns = buildWorkflowColumns(config, {
        running,
        retrying: [],
      });

      const otherCol = columns.find((col) => col.key === "other");
      expect(otherCol).toBeUndefined();
    });

    it("places 'other' column at the end", () => {
      const config = makeConfig();
      const running = [
        makeIssueView({ issueId: "k1", identifier: "T-1", state: "Todo" }),
        makeIssueView({ issueId: "o1", identifier: "T-2", state: "Weird State" }),
      ];

      const columns = buildWorkflowColumns(config, {
        running,
        retrying: [],
      });

      const lastColumn = columns.at(-1);
      expect(lastColumn?.key).toBe("other");
    });
  });

  describe("state machine config", () => {
    it("uses stateMachine stages when configured", () => {
      const config = makeConfig({
        stateMachine: {
          stages: [
            { name: "Backlog", kind: "backlog" },
            { name: "Ready", kind: "todo" },
            { name: "Working", kind: "active" },
            { name: "Review", kind: "gate" },
            { name: "Shipped", kind: "terminal" },
          ],
          transitions: {},
        },
      });

      const columns = buildWorkflowColumns(config, {
        running: [],
        retrying: [],
      });

      expect(columns.map((col) => col.key)).toEqual(["backlog", "ready", "working", "review", "shipped"]);

      const backlogCol = columns.find((col) => col.key === "backlog");
      expect(backlogCol?.kind).toBe("backlog");
      expect(backlogCol?.terminal).toBe(false);

      const shippedCol = columns.find((col) => col.key === "shipped");
      expect(shippedCol?.kind).toBe("terminal");
      expect(shippedCol?.terminal).toBe(true);
    });
  });
});
