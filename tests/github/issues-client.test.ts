import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GitHubIssuesClient, GitHubIssuesClientError, normalizeGitHubIssue } from "../../src/github/issues-client.js";
import { createJsonResponse, createMockLogger } from "../helpers.js";
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
      terminalStates: ["done", "cancelled"],
    },
    github: { token: "gh-token", apiBaseUrl: "https://api.github.com" },
    polling: { intervalMs: 1000 },
    workspace: {
      root: "/tmp/risoluto",
      strategy: "directory",
      branchPrefix: "risoluto/",
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
    repos: [],
  } as unknown as ServiceConfig;
}

function makeRawIssue(overrides: Partial<RawGitHubIssue> = {}): RawGitHubIssue {
  return {
    number: 42,
    title: "Fix the bug",
    body: "Details here",
    state: "open",
    labels: [{ name: "in-progress" }],
    html_url: "https://github.com/acme/awesome/issues/42",
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-02T00:00:00Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// normalizeGitHubIssue unit tests
// ---------------------------------------------------------------------------

describe("normalizeGitHubIssue", () => {
  const active = ["in-progress", "review"];
  const terminal = ["done", "cancelled"];

  it("maps an active state label correctly", () => {
    const raw = makeRawIssue({ labels: [{ name: "in-progress" }] });
    const issue = normalizeGitHubIssue(raw, "acme", "awesome", active, terminal);
    expect(issue.state).toBe("in-progress");
    expect(issue.id).toBe("42");
    expect(issue.identifier).toBe("acme/awesome#42");
    expect(issue.title).toBe("Fix the bug");
    expect(issue.url).toBe("https://github.com/acme/awesome/issues/42");
  });

  it("maps a terminal state label correctly", () => {
    const raw = makeRawIssue({ labels: [{ name: "done" }] });
    const issue = normalizeGitHubIssue(raw, "acme", "awesome", active, terminal);
    expect(issue.state).toBe("done");
  });

  it("falls back to 'open' when no state label matches", () => {
    const raw = makeRawIssue({ labels: [{ name: "bug" }, { name: "feature" }] });
    const issue = normalizeGitHubIssue(raw, "acme", "awesome", active, terminal);
    expect(issue.state).toBe("open");
  });

  it("includes all labels in the labels array", () => {
    const raw = makeRawIssue({ labels: [{ name: "bug" }, { name: "in-progress" }] });
    const issue = normalizeGitHubIssue(raw, "acme", "awesome", active, terminal);
    expect(issue.labels).toEqual(["bug", "in-progress"]);
  });

  it("sets priority to null and blockedBy to empty array", () => {
    const raw = makeRawIssue();
    const issue = normalizeGitHubIssue(raw, "acme", "awesome", active, terminal);
    expect(issue.priority).toBeNull();
    expect(issue.blockedBy).toEqual([]);
  });

  it("sets branchName to null", () => {
    const raw = makeRawIssue();
    const issue = normalizeGitHubIssue(raw, "acme", "awesome", active, terminal);
    expect(issue.branchName).toBeNull();
  });

  it("handles null body gracefully", () => {
    const raw = makeRawIssue({ body: null });
    const issue = normalizeGitHubIssue(raw, "acme", "awesome", active, terminal);
    expect(issue.description).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// GitHubIssuesClient tests
// ---------------------------------------------------------------------------

describe("GitHubIssuesClient", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function createClient(): GitHubIssuesClient {
    const logger = createMockLogger();
    return new GitHubIssuesClient(() => createConfig(), logger);
  }

  it("fetchOpenIssues calls the correct URL", async () => {
    const issues = [makeRawIssue()];
    fetchMock.mockResolvedValue(createJsonResponse(200, issues));

    const client = createClient();
    const result = await client.fetchOpenIssues();

    expect(fetchMock).toHaveBeenCalledOnce();
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("/repos/acme/awesome/issues");
    expect(url).toContain("state=open");
    expect(result).toHaveLength(1);
    expect(result[0].number).toBe(42);
  });

  it("fetchOpenIssues includes labels param when provided", async () => {
    fetchMock.mockResolvedValue(createJsonResponse(200, []));

    const client = createClient();
    await client.fetchOpenIssues(["in-progress", "review"]);

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("labels=");
  });

  it("throws GitHubIssuesClientError on HTTP error", async () => {
    fetchMock.mockResolvedValue(createJsonResponse(401, { message: "Unauthorized" }));

    const client = createClient();
    await expect(client.fetchOpenIssues()).rejects.toThrow(GitHubIssuesClientError);
  });

  it("throws GitHubIssuesClientError with github_http_error code on non-ok response", async () => {
    fetchMock.mockResolvedValue(createJsonResponse(403, { message: "Forbidden" }));

    const client = createClient();
    try {
      await client.fetchOpenIssues();
    } catch (error) {
      expect(error).toBeInstanceOf(GitHubIssuesClientError);
      expect((error as GitHubIssuesClientError).code).toBe("github_http_error");
    }
  });

  it("throws GitHubIssuesClientError with github_transport_error on network failure", async () => {
    fetchMock.mockRejectedValue(new Error("network unreachable"));

    const client = createClient();
    try {
      await client.fetchOpenIssues();
    } catch (error) {
      expect(error).toBeInstanceOf(GitHubIssuesClientError);
      expect((error as GitHubIssuesClientError).code).toBe("github_transport_error");
    }
  });

  it("fetchIssuesByNumbers fetches each issue in parallel", async () => {
    const issue1 = makeRawIssue({ number: 1 });
    const issue2 = makeRawIssue({ number: 2 });
    fetchMock
      .mockResolvedValueOnce(createJsonResponse(200, issue1))
      .mockResolvedValueOnce(createJsonResponse(200, issue2));

    const client = createClient();
    const result = await client.fetchIssuesByNumbers([1, 2]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(2);
  });
});
