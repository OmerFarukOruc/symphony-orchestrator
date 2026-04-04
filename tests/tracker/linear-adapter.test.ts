import { describe, expect, it, vi, beforeEach } from "vitest";

import { LinearTrackerAdapter } from "../../src/tracker/linear-adapter.js";
import type { LinearClient } from "../../src/linear/client.js";
import type { Issue } from "../../src/core/types.js";

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
    createComment: vi.fn<(id: string, body: string) => Promise<void>>().mockResolvedValue(undefined),
    createIssue: vi.fn().mockResolvedValue({
      issueId: "issue-created",
      identifier: "NIN-77",
      url: "https://linear.app/team/issue/NIN-77",
    }),
    runGraphQL: vi.fn().mockResolvedValue({ data: { issueUpdate: { success: true } } }),
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
    it("returns { success: true } when GraphQL mutation succeeds", async () => {
      vi.mocked(client.runGraphQL).mockResolvedValue({
        data: { issueUpdate: { success: true } },
      });

      const result = await adapter.transitionIssue("issue-abc", "state-done");

      expect(result).toEqual({ success: true });
      expect(client.runGraphQL).toHaveBeenCalledOnce();
    });

    it("returns { success: false } when mutation reports failure", async () => {
      vi.mocked(client.runGraphQL).mockResolvedValue({
        data: { issueUpdate: { success: false } },
      });

      const result = await adapter.transitionIssue("issue-abc", "state-done");

      expect(result).toEqual({ success: false });
    });

    it("returns { success: false } when response data is missing", async () => {
      vi.mocked(client.runGraphQL).mockResolvedValue({ data: {} });

      const result = await adapter.transitionIssue("issue-abc", "state-done");

      expect(result).toEqual({ success: false });
    });

    it("passes correct mutation variables to runGraphQL", async () => {
      await adapter.transitionIssue("issue-xyz", "state-123");

      expect(client.runGraphQL).toHaveBeenCalledWith(expect.any(String), {
        issueId: "issue-xyz",
        stateId: "state-123",
      });
    });
  });
});
