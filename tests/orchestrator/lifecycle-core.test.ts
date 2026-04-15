import { describe, expect, it, vi } from "vitest";

import {
  attemptToCompletedView,
  planRunningEntryReconciliation,
  projectQueueAndDetailViews,
  seedCompletedClaimsFromAttempts,
} from "../../src/orchestrator/core/lifecycle-state.js";
import type { AttemptRecord, Issue, ServiceConfig } from "../../src/core/types.js";
import { createIssue, createModelSelection, createRunningEntry } from "./issue-test-factories.js";

function createConfig(): ServiceConfig {
  return {
    tracker: {
      kind: "linear",
      apiKey: "linear-token",
      endpoint: "https://api.linear.app/graphql",
      projectSlug: "EXAMPLE",
      activeStates: ["Todo", "In Progress"],
      terminalStates: ["Done", "Canceled"],
    },
    polling: { intervalMs: 30000 },
    workspace: {
      root: "/tmp/risoluto",
      hooks: {
        afterCreate: null,
        beforeRun: null,
        afterRun: null,
        beforeRemove: null,
        timeoutMs: 1000,
      },
    },
    agent: {
      maxConcurrentAgents: 2,
      maxConcurrentAgentsByState: {},
      maxTurns: 2,
      maxRetryBackoffMs: 300000,
    },
    codex: {
      command: "codex app-server",
      model: "gpt-5.4",
      reasoningEffort: "high",
      approvalPolicy: "never",
      threadSandbox: "danger-full-access",
      turnSandboxPolicy: { type: "dangerFullAccess" },
      readTimeoutMs: 1000,
      turnTimeoutMs: 10000,
      drainTimeoutMs: 0,
      startupTimeoutMs: 5000,
      stallTimeoutMs: 10000,
      auth: {
        mode: "api_key",
        sourceHome: "/tmp/unused-codex-home",
      },
      provider: null,
      sandbox: {
        image: "risoluto-codex:latest",
        network: "",
        security: { noNewPrivileges: true, dropCapabilities: true, gvisor: false, seccompProfile: "" },
        resources: { memory: "4g", memoryReservation: "1g", memorySwap: "4g", cpus: "2.0", tmpfsSize: "512m" },
        extraMounts: [],
        envPassthrough: [],
        logs: { driver: "json-file", maxSize: "50m", maxFile: 3 },
        egressAllowlist: [],
      },
    },
    server: { port: 4000 },
  };
}

function createAttempt(overrides: Partial<AttemptRecord> = {}): AttemptRecord {
  return {
    attemptId: "attempt-1",
    issueId: "issue-1",
    issueIdentifier: "MT-1",
    title: "Issue 1",
    workspaceKey: "ws-1",
    workspacePath: "/tmp/ws/MT-1",
    status: "completed",
    attemptNumber: 1,
    startedAt: "2026-04-15T10:00:00Z",
    endedAt: "2026-04-15T10:30:00Z",
    model: "gpt-5.4",
    reasoningEffort: "high",
    modelSource: "default",
    threadId: null,
    turnId: null,
    turnCount: 3,
    errorCode: null,
    errorMessage: null,
    tokenUsage: null,
    pullRequestUrl: null,
    ...overrides,
  };
}

describe("lifecycle core", () => {
  describe("planRunningEntryReconciliation", () => {
    it("marks terminal issues for stop and cleanup", () => {
      const config = createConfig();
      const entry = createRunningEntry({ issue: createIssue({ id: "issue-1", state: "In Progress" }) });
      const latestIssue = createIssue({ id: "issue-1", state: "Done" });

      const [plan] = planRunningEntryReconciliation(
        new Map([[entry.issue.id, entry]]),
        new Map([[latestIssue.id, latestIssue]]),
        config,
      );

      expect(plan).toMatchObject({
        issueId: "issue-1",
        latestIssue,
        issueChanged: true,
        nextStatus: "stopping",
        abortReason: "terminal",
        cleanupOnExit: true,
      });
    });

    it("marks inactive issues for stop without forcing cleanup", () => {
      const config = createConfig();
      const entry = createRunningEntry({
        issue: createIssue({ id: "issue-1", state: "In Progress" }),
        cleanupOnExit: false,
      });
      const latestIssue = createIssue({ id: "issue-1", state: "Backlog" });

      const [plan] = planRunningEntryReconciliation(
        new Map([[entry.issue.id, entry]]),
        new Map([[latestIssue.id, latestIssue]]),
        config,
      );

      expect(plan).toMatchObject({
        nextStatus: "stopping",
        abortReason: "inactive",
        cleanupOnExit: false,
      });
    });

    it("keeps active issues running when nothing changed", () => {
      const config = createConfig();
      const issue = createIssue({ id: "issue-1", state: "In Progress" });
      const entry = createRunningEntry({ issue });

      const [plan] = planRunningEntryReconciliation(
        new Map([[entry.issue.id, entry]]),
        new Map([[issue.id, issue]]),
        config,
      );

      expect(plan).toMatchObject({
        latestIssue: issue,
        issueChanged: false,
        nextStatus: "running",
        abortReason: null,
        cleanupOnExit: false,
      });
    });
  });

  describe("projectQueueAndDetailViews", () => {
    it("sorts queued issues, emits queue events only for newly visible issues, and projects detail views", () => {
      const issues: Issue[] = [
        createIssue({ id: "issue-2", identifier: "MT-2", priority: 2, createdAt: "2026-04-15T12:00:00Z" }),
        createIssue({ id: "issue-1", identifier: "MT-1", priority: 1, createdAt: "2026-04-15T11:00:00Z" }),
        createIssue({ id: "issue-3", identifier: "MT-3", priority: 3, createdAt: "2026-04-15T13:00:00Z" }),
      ];
      const resolveModelSelection = vi.fn().mockReturnValue(createModelSelection());

      const result = projectQueueAndDetailViews({
        issues,
        canDispatchIssue: (issue) => issue.identifier !== "MT-3",
        resolveModelSelection,
        previousQueuedIssueIds: new Set(["issue-2"]),
      });

      expect(result.queuedViews.map((view) => view.identifier)).toEqual(["MT-1", "MT-2"]);
      expect(result.queuedEvents.map((event) => event.issueIdentifier)).toEqual(["MT-1"]);
      expect([...result.detailViews.keys()]).toEqual(["MT-1", "MT-2", "MT-3"]);
      expect(resolveModelSelection).toHaveBeenCalledTimes(5);
    });
  });

  describe("seedCompletedClaimsFromAttempts", () => {
    it("keeps only the latest attempt per issue and seeds claims for completed attempts", () => {
      const attempts = [
        createAttempt({
          attemptId: "attempt-old",
          startedAt: "2026-04-15T09:00:00Z",
          status: "failed",
          errorCode: "turn_failed",
          errorMessage: "old",
        }),
        createAttempt({
          attemptId: "attempt-new",
          startedAt: "2026-04-15T10:00:00Z",
          endedAt: "2026-04-15T10:10:00Z",
          status: "completed",
        }),
        createAttempt({
          attemptId: "attempt-2",
          issueId: "issue-2",
          issueIdentifier: "MT-2",
          title: "Issue 2",
          startedAt: "2026-04-15T10:05:00Z",
          endedAt: "2026-04-15T10:15:00Z",
          status: "cancelled",
          errorCode: "cancelled",
          errorMessage: "stopped",
        }),
      ];

      const result = seedCompletedClaimsFromAttempts(attempts);

      expect([...result.claimedIssueIds]).toEqual(["issue-1"]);
      expect([...result.completedViews.keys()]).toEqual(["MT-1", "MT-2"]);
      expect(result.completedViews.get("MT-2")).toMatchObject({
        status: "cancelled",
        state: "Canceled",
        message: "stopped",
      });
      expect(result.seededCount).toBe(2);
    });

    it("converts completed attempts into completed views with normalized state labels", () => {
      const view = attemptToCompletedView(
        createAttempt({
          status: "failed",
          errorCode: "turn_failed",
          errorMessage: "nope",
        }),
      );

      expect(view).toMatchObject({
        status: "failed",
        state: "Canceled",
        error: "turn_failed",
        message: "nope",
      });
    });
  });
});
