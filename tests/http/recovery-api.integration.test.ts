import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RecoveryReport } from "../../src/orchestrator/recovery-types.js";
import { buildStubOrchestrator, startTestServer, type TestServerResult } from "../helpers/http-server-harness.js";

function makeRecoveryReport(overrides: Partial<RecoveryReport> = {}): RecoveryReport {
  return {
    generatedAt: "2026-04-03T18:30:00.000Z",
    dryRun: false,
    totalScanned: 2,
    resumed: ["attempt-1"],
    cleanedUp: ["attempt-2"],
    escalated: [],
    skipped: [],
    errors: [],
    results: [
      {
        attemptId: "attempt-1",
        issueId: "issue-1",
        issueIdentifier: "NIN-42",
        persistedStatus: "running",
        attemptNumber: 2,
        threadId: "thread-123",
        workspacePath: "/tmp/workspace-1",
        workspaceExists: true,
        workerAlive: false,
        containerNames: [],
        action: "resume",
        reason: "Workspace and thread id are intact; resume is possible",
        success: true,
        autoCommitSha: null,
        workspacePreserved: false,
        error: null,
      },
      {
        attemptId: "attempt-2",
        issueId: "issue-2",
        issueIdentifier: "NIN-77",
        persistedStatus: "running",
        attemptNumber: 1,
        threadId: null,
        workspacePath: "/tmp/workspace-2",
        workspaceExists: false,
        workerAlive: false,
        containerNames: [],
        action: "cleanup",
        reason: "Workspace is missing",
        success: true,
        autoCommitSha: null,
        workspacePreserved: false,
        error: null,
      },
    ],
    durationMs: 37,
    ...overrides,
  };
}

describe("GET /api/v1/recovery", () => {
  let ctx: TestServerResult;

  afterEach(async () => {
    await ctx?.teardown();
  });

  describe("when the orchestrator has a recovery report", () => {
    beforeEach(async () => {
      const orchestrator = buildStubOrchestrator({
        getRecoveryReport: vi.fn().mockReturnValue(makeRecoveryReport()),
      });
      ctx = await startTestServer({ orchestrator });
    });

    it("returns the latest startup recovery report", async () => {
      const response = await fetch(`${ctx.baseUrl}/api/v1/recovery`);
      expect(response.status).toBe(200);

      const body = (await response.json()) as RecoveryReport;
      expect(body).toMatchObject({
        generatedAt: "2026-04-03T18:30:00.000Z",
        totalScanned: 2,
        resumed: ["attempt-1"],
        cleanedUp: ["attempt-2"],
        escalated: [],
        durationMs: 37,
      });
      expect(body.results).toHaveLength(2);
      expect(body.results[0]).toMatchObject({
        attemptId: "attempt-1",
        action: "resume",
        success: true,
      });
    });
  });

  describe("when the orchestrator has not run startup recovery yet", () => {
    beforeEach(async () => {
      ctx = await startTestServer();
    });

    it("returns the empty recovery report shape", async () => {
      const response = await fetch(`${ctx.baseUrl}/api/v1/recovery`);
      expect(response.status).toBe(200);

      const body = (await response.json()) as RecoveryReport | Record<string, unknown>;
      expect(body).toMatchObject({
        generatedAt: null,
        dryRun: false,
        totalScanned: 0,
        resumed: [],
        cleanedUp: [],
        escalated: [],
        skipped: [],
        errors: [],
        results: [],
        durationMs: 0,
      });
    });
  });
});
