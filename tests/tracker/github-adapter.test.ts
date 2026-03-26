import { describe, expect, it, vi, beforeEach } from "vitest";

import { GitHubTrackerAdapter } from "../../src/tracker/github-adapter.js";
import type { GitHubIssuesClient } from "../../src/github/issues-client.js";
import type { ServiceConfig } from "../../src/core/types.js";
import type { RawGitHubIssue } from "../../src/github/issues-client.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function createConfig(): ServiceConfig {
  return {
    tracker: {
      kind: "github",
      apiKey: "",
      endpoint: "https://api.github.com",
      projectSlug: null,
      owner: "acme",
      repo: "awesome",
      activeStates: ["in-progress"],
      terminalStates: ["done"],
    },
    github: { token: "gh-token", apiBaseUrl: "https://api.github.com" },
    polling: { intervalMs: 1000 },
    workspace: {
      root: "/tmp/symphony",
      strategy: "directory",
      branchPrefix: "symphony/",
      hooks: { afterCreate: null, beforeRun: null, afterRun: null, beforeRemove: null, timeoutMs: 1000 },
    },
    agent: {
      maxConcurrentAgents: 1,
      maxConcurrentAgentsByState: {},
      maxTurns: 2,
      maxRetryBackoffMs: 10000,
      maxContinuationAttempts: 1,
      successState: null,
      stallTimeoutMs: 0,
    },
    codex: {
      command: "codex app-server",
      model: "gpt-5.4",
      reasoningEffort: "high",
      approvalPolicy: "never",
      threadSandbox: "danger-full-access",
      turnSandboxPolicy: { type: "dangerFullAccess" },
      readTimeoutMs: 1000,
      turnTimeoutMs: 1000,
      drainTimeoutMs: 0,
      startupTimeoutMs: 0,
      stallTimeoutMs: 0,
      auth: { mode: "api_key", sourceHome: "/tmp/auth" },
      provider: null,
      sandbox: {
        image: "symphony-codex:latest",
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
    repos: [],
  } as unknown as ServiceConfig;
}

function makeRawIssue(overrides: Partial<RawGitHubIssue> = {}): RawGitHubIssue {
  return {
    number: 7,
    title: "Sample issue",
    body: "Body text",
    state: "open",
    labels: [{ name: "in-progress" }],
    html_url: "https://github.com/acme/awesome/issues/7",
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-02T00:00:00Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock client factory
// ---------------------------------------------------------------------------

function createMockClient(): GitHubIssuesClient {
  return {
    fetchOpenIssues: vi.fn().mockResolvedValue([]),
    fetchIssuesByNumbers: vi.fn().mockResolvedValue([]),
    addLabel: vi.fn().mockResolvedValue(undefined),
    removeLabel: vi.fn().mockResolvedValue(undefined),
    closeIssue: vi.fn().mockResolvedValue(undefined),
    reopenIssue: vi.fn().mockResolvedValue(undefined),
    createComment: vi.fn().mockResolvedValue(undefined),
    withRetry: vi.fn().mockImplementation((_op: string, fn: () => Promise<void>) => fn()),
  } as unknown as GitHubIssuesClient;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GitHubTrackerAdapter", () => {
  let client: GitHubIssuesClient;
  let adapter: GitHubTrackerAdapter;

  beforeEach(() => {
    client = createMockClient();
    adapter = new GitHubTrackerAdapter(client, createConfig);
  });

  describe("fetchCandidateIssues", () => {
    it("returns normalized issues from fetchOpenIssues", async () => {
      vi.mocked(client.fetchOpenIssues).mockResolvedValue([makeRawIssue()]);

      const issues = await adapter.fetchCandidateIssues();

      expect(issues).toHaveLength(1);
      expect(issues[0].id).toBe("7");
      expect(issues[0].identifier).toBe("acme/awesome#7");
      expect(issues[0].state).toBe("in-progress");
    });

    it("returns empty array when no open issues", async () => {
      vi.mocked(client.fetchOpenIssues).mockResolvedValue([]);

      const issues = await adapter.fetchCandidateIssues();

      expect(issues).toHaveLength(0);
    });
  });

  describe("fetchIssueStatesByIds", () => {
    it("fetches issues by number and normalizes them", async () => {
      vi.mocked(client.fetchIssuesByNumbers).mockResolvedValue([makeRawIssue({ number: 7 })]);

      const issues = await adapter.fetchIssueStatesByIds(["7"]);

      expect(client.fetchIssuesByNumbers).toHaveBeenCalledWith([7]);
      expect(issues).toHaveLength(1);
      expect(issues[0].id).toBe("7");
    });

    it("filters out non-numeric ids", async () => {
      vi.mocked(client.fetchIssuesByNumbers).mockResolvedValue([]);

      await adapter.fetchIssueStatesByIds(["not-a-number", "7"]);

      expect(client.fetchIssuesByNumbers).toHaveBeenCalledWith([7]);
    });
  });

  describe("fetchIssuesByStates", () => {
    it("calls fetchOpenIssues with the given state labels", async () => {
      vi.mocked(client.fetchOpenIssues).mockResolvedValue([makeRawIssue()]);

      await adapter.fetchIssuesByStates(["in-progress"]);

      expect(client.fetchOpenIssues).toHaveBeenCalledWith(["in-progress"]);
    });
  });

  describe("resolveStateId", () => {
    it("returns the label name as-is", async () => {
      const result = await adapter.resolveStateId("in-progress");
      expect(result).toBe("in-progress");
    });

    it("returns null for an empty string", async () => {
      const result = await adapter.resolveStateId("");
      expect(result).toBeNull();
    });
  });

  describe("createComment", () => {
    it("delegates to client.createComment via withRetry", async () => {
      await adapter.createComment("7", "Hello world");

      expect(client.withRetry).toHaveBeenCalledWith("createComment", expect.any(Function));
    });
  });

  describe("transitionIssue", () => {
    it("returns { success: true } on successful state update", async () => {
      const result = await adapter.transitionIssue("7", "done");

      expect(result).toEqual({ success: true });
    });

    it("returns { success: false } when an error is thrown", async () => {
      vi.mocked(client.withRetry).mockRejectedValue(new Error("API error"));

      const result = await adapter.transitionIssue("7", "done");

      expect(result).toEqual({ success: false });
    });
  });

  describe("updateIssueState", () => {
    it("adds the new state label", async () => {
      await adapter.updateIssueState("7", "in-progress");

      expect(client.withRetry).toHaveBeenCalledWith("addLabel", expect.any(Function));
    });

    it("closes the issue when transitioning to a terminal state", async () => {
      // Capture which operations are called
      const ops: string[] = [];
      vi.mocked(client.withRetry).mockImplementation((op: string, fn: () => Promise<void>) => {
        ops.push(op);
        return fn();
      });

      await adapter.updateIssueState("7", "done");

      expect(ops).toContain("addLabel");
      expect(ops).toContain("closeIssue");
    });

    it("reopens the issue when transitioning to an active state", async () => {
      const ops: string[] = [];
      vi.mocked(client.withRetry).mockImplementation((op: string, fn: () => Promise<void>) => {
        ops.push(op);
        return fn();
      });

      await adapter.updateIssueState("7", "in-progress");

      expect(ops).toContain("addLabel");
      expect(ops).toContain("reopenIssue");
    });
  });
});
