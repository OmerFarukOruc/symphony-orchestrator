import { describe, expect, it, vi, beforeEach } from "vitest";

import { LinearTrackerAdapter } from "../../src/tracker/linear-adapter.js";
import type { LinearClient } from "../../src/linear/client.js";
import type { Issue } from "../../src/core/types.js";
import { createMockLogger } from "../helpers.js";

// ---------------------------------------------------------------------------
// Mock factory
// ---------------------------------------------------------------------------

function createMockIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: "issue-abc",
    identifier: "NIN-42",
    title: "Sample issue",
    state: "In Progress",
    url: "https://linear.app/team/issue/NIN-42",
    priority: 2,
    branchName: "feature/NIN-42",
    ...overrides,
  };
}

function createMockClient(): LinearClient {
  return {
    fetchCandidateIssues: vi.fn<() => Promise<Issue[]>>().mockResolvedValue([]),
    fetchIssueStatesByIds: vi.fn<(ids: string[]) => Promise<Issue[]>>().mockResolvedValue([]),
    fetchIssuesByStates: vi.fn<(states: string[]) => Promise<Issue[]>>().mockResolvedValue([]),
    resolveStateId: vi.fn<(name: string) => Promise<string | null>>().mockResolvedValue(null),
    updateIssueState: vi.fn<(id: string, stateId: string) => Promise<void>>().mockResolvedValue(undefined),
    updateIssueStateStrict: vi.fn<(id: string, stateId: string) => Promise<void>>().mockResolvedValue(undefined),
    createComment: vi.fn<(id: string, body: string) => Promise<void>>().mockResolvedValue(undefined),
    createIssue: vi.fn().mockResolvedValue({
      issueId: "issue-created",
      identifier: "NIN-77",
      url: "https://linear.app/team/issue/NIN-77",
    }),
  } as unknown as LinearClient;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("LinearTrackerAdapter", () => {
  let client: LinearClient;
  let adapter: LinearTrackerAdapter;

  beforeEach(() => {
    client = createMockClient();
    adapter = new LinearTrackerAdapter(client);
  });

  describe("fetchCandidateIssues", () => {
    it("delegates to client.fetchCandidateIssues", async () => {
      const issues = [createMockIssue()];
      vi.mocked(client.fetchCandidateIssues).mockResolvedValue(issues);

      const result = await adapter.fetchCandidateIssues();

      expect(client.fetchCandidateIssues).toHaveBeenCalledOnce();
      expect(result).toBe(issues);
    });
  });

  describe("fetchIssueStatesByIds", () => {
    it("delegates to client.fetchIssueStatesByIds", async () => {
      const issues = [createMockIssue({ id: "a" }), createMockIssue({ id: "b" })];
      vi.mocked(client.fetchIssueStatesByIds).mockResolvedValue(issues);

      const result = await adapter.fetchIssueStatesByIds(["a", "b"]);

      expect(client.fetchIssueStatesByIds).toHaveBeenCalledWith(["a", "b"]);
      expect(result).toHaveLength(2);
    });
  });

  describe("fetchIssuesByStates", () => {
    it("delegates to client.fetchIssuesByStates", async () => {
      vi.mocked(client.fetchIssuesByStates).mockResolvedValue([createMockIssue()]);

      const result = await adapter.fetchIssuesByStates(["In Progress", "Done"]);

      expect(client.fetchIssuesByStates).toHaveBeenCalledWith(["In Progress", "Done"]);
      expect(result).toHaveLength(1);
    });
  });

  describe("resolveStateId", () => {
    it("delegates to client.resolveStateId", async () => {
      vi.mocked(client.resolveStateId).mockResolvedValue("state-123");

      const result = await adapter.resolveStateId("In Progress");

      expect(client.resolveStateId).toHaveBeenCalledWith("In Progress");
      expect(result).toBe("state-123");
    });

    it("returns null when state is not found", async () => {
      vi.mocked(client.resolveStateId).mockResolvedValue(null);

      const result = await adapter.resolveStateId("nonexistent");

      expect(result).toBeNull();
    });
  });

  describe("updateIssueState", () => {
    it("delegates to client.updateIssueState", async () => {
      await adapter.updateIssueState("issue-abc", "state-done");

      expect(client.updateIssueState).toHaveBeenCalledWith("issue-abc", "state-done");
    });
  });

  describe("createComment", () => {
    it("delegates to client.createComment", async () => {
      await adapter.createComment("issue-abc", "Agent completed the task.");

      expect(client.createComment).toHaveBeenCalledWith("issue-abc", "Agent completed the task.");
    });
  });

  describe("createIssue", () => {
    it("delegates to client.createIssue with normalized optional fields", async () => {
      const result = await adapter.createIssue({
        title: "Investigate scheduler drift",
        description: "Runs are being skipped",
        stateName: "Backlog",
      });

      expect(client.createIssue).toHaveBeenCalledWith({
        title: "Investigate scheduler drift",
        description: "Runs are being skipped",
        stateName: "Backlog",
      });
      expect(result).toEqual({
        issueId: "issue-created",
        identifier: "NIN-77",
        url: "https://linear.app/team/issue/NIN-77",
      });
    });
  });

  describe("transitionIssue", () => {
    it("returns { success: true } when updateIssueStateStrict resolves", async () => {
      const result = await adapter.transitionIssue("issue-abc", "state-done");

      expect(result).toEqual({ success: true });
      expect(client.updateIssueStateStrict).toHaveBeenCalledWith("issue-abc", "state-done");
    });

    it("returns { success: false } when updateIssueStateStrict throws", async () => {
      vi.mocked(client.updateIssueStateStrict).mockRejectedValue(new Error("Linear API error"));

      const result = await adapter.transitionIssue("issue-abc", "state-done");

      expect(result).toEqual({ success: false });
    });

    it("logs transition failures when a logger is provided", async () => {
      const logger = createMockLogger();
      const adapterWithLogger = new LinearTrackerAdapter(client, undefined, logger);
      vi.mocked(client.updateIssueStateStrict).mockRejectedValue(new Error("Linear API error"));

      await expect(adapterWithLogger.transitionIssue("issue-abc", "state-done")).resolves.toEqual({ success: false });
      expect(logger.warn).toHaveBeenCalledWith(
        { issueId: "issue-abc", stateId: "state-done", error: "Linear API error" },
        "linear tracker transition failed",
      );
    });

    it("returns { success: false } when Linear does not confirm the transition", async () => {
      vi.mocked(client.updateIssueStateStrict).mockRejectedValue(
        new Error("linear issue transition was not confirmed"),
      );

      const result = await adapter.transitionIssue("issue-abc", "state-done");

      expect(result).toEqual({ success: false });
    });

    it("passes correct issueId and stateId to updateIssueStateStrict", async () => {
      await adapter.transitionIssue("issue-xyz", "state-123");

      expect(client.updateIssueStateStrict).toHaveBeenCalledWith("issue-xyz", "state-123");
    });
  });
});
