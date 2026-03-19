import { describe, expect, it, vi } from "vitest";

import { fetchCandidateIssues, fetchIssueStatesByIds, fetchIssuesByStates } from "../../src/linear/issue-pagination.js";
import { LinearClientError } from "../../src/linear/errors.js";
import type { Issue, ServiceConfig } from "../../src/core/types.js";

function makeConfig(overrides: Partial<ServiceConfig["tracker"]> = {}): ServiceConfig {
  return {
    tracker: {
      kind: "linear",
      apiKey: "key",
      endpoint: "https://api.linear.app/graphql",
      projectSlug: "PROJ",
      activeStates: ["In Progress"],
      terminalStates: ["Done"],
      ...overrides,
    },
    polling: { intervalMs: 30000 },
    workspace: {
      root: "/tmp",
      hooks: { afterCreate: null, beforeRun: null, afterRun: null, beforeRemove: null, timeoutMs: 1000 },
    },
    agent: { maxConcurrentAgents: 1, maxConcurrentAgentsByState: {}, maxTurns: 10, maxRetryBackoffMs: 300000 },
    codex: {
      command: "codex",
      model: "gpt-4o",
      reasoningEffort: null,
      approvalPolicy: "never",
      threadSandbox: "danger-full-access",
      turnSandboxPolicy: { type: "dangerFullAccess" },
      readTimeoutMs: 1000,
      turnTimeoutMs: 10000,
      drainTimeoutMs: 0,
      startupTimeoutMs: 5000,
      stallTimeoutMs: 10000,
      auth: { mode: "api_key", sourceHome: "/tmp" },
      provider: null,
      sandbox: {
        image: "img",
        network: "",
        security: { noNewPrivileges: true, dropCapabilities: true, gvisor: false, seccompProfile: "" },
        resources: { memory: "4g", memoryReservation: "1g", memorySwap: "4g", cpus: "2", tmpfsSize: "512m" },
        extraMounts: [],
        envPassthrough: [],
        logs: { driver: "json-file", maxSize: "50m", maxFile: 3 },
        egressAllowlist: [],
      },
    },
    server: { port: 4000 },
  } as unknown as ServiceConfig;
}

function makeIssueNode(id: string): unknown {
  return {
    id,
    identifier: `MT-${id}`,
    title: `Issue ${id}`,
    description: null,
    priority: 1,
    branchName: null,
    url: null,
    createdAt: null,
    updatedAt: null,
    state: { name: "In Progress" },
    labels: { nodes: [] },
    inverseRelations: { nodes: [] },
  };
}

function fakeNormalizeIssue(node: unknown): Issue {
  const n = node as Record<string, unknown>;
  return {
    id: n.id as string,
    identifier: n.identifier as string,
    title: n.title as string,
    description: null,
    priority: 1,
    state: "In Progress",
    branchName: null,
    url: null,
    labels: [],
    blockedBy: [],
    createdAt: null,
    updatedAt: null,
  };
}

function makeSinglePageResponse(nodes: unknown[]): {
  data: { issues: { nodes: unknown[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } };
} {
  return {
    data: {
      issues: {
        nodes,
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    },
  };
}

function makePagedResponse(
  nodes: unknown[],
  endCursor: string,
): { data: { issues: { nodes: unknown[]; pageInfo: { hasNextPage: boolean; endCursor: string } } } } {
  return {
    data: {
      issues: {
        nodes,
        pageInfo: { hasNextPage: true, endCursor },
      },
    },
  };
}

describe("fetchCandidateIssues", () => {
  it("fetches a single page of issues", async () => {
    const nodes = [makeIssueNode("1"), makeIssueNode("2")];
    const runGraphQL = vi.fn().mockResolvedValue(makeSinglePageResponse(nodes));
    const deps = { runGraphQL, getConfig: () => makeConfig() };
    const issues = await fetchCandidateIssues(deps, () => "query", fakeNormalizeIssue);
    expect(issues).toHaveLength(2);
    expect(issues[0].id).toBe("1");
    expect(issues[1].id).toBe("2");
  });

  it("fetches multiple pages until exhausted", async () => {
    const runGraphQL = vi
      .fn()
      .mockResolvedValueOnce(makePagedResponse([makeIssueNode("1")], "cursor-1"))
      .mockResolvedValueOnce(makePagedResponse([makeIssueNode("2")], "cursor-2"))
      .mockResolvedValueOnce(makeSinglePageResponse([makeIssueNode("3")]));
    const deps = { runGraphQL, getConfig: () => makeConfig() };
    const issues = await fetchCandidateIssues(deps, () => "query", fakeNormalizeIssue);
    expect(issues).toHaveLength(3);
    expect(runGraphQL).toHaveBeenCalledTimes(3);
  });

  it("throws LinearClientError when data is missing", async () => {
    const runGraphQL = vi.fn().mockResolvedValue({});
    const deps = { runGraphQL, getConfig: () => makeConfig() };
    await expect(fetchCandidateIssues(deps, () => "query", fakeNormalizeIssue)).rejects.toThrow(LinearClientError);
  });

  it("throws LinearClientError when issues is missing", async () => {
    const runGraphQL = vi.fn().mockResolvedValue({ data: {} });
    const deps = { runGraphQL, getConfig: () => makeConfig() };
    await expect(fetchCandidateIssues(deps, () => "query", fakeNormalizeIssue)).rejects.toThrow(LinearClientError);
  });

  it("throws LinearClientError when nodes is not an array", async () => {
    const runGraphQL = vi.fn().mockResolvedValue({
      data: { issues: { nodes: "not-array", pageInfo: { hasNextPage: false, endCursor: null } } },
    });
    const deps = { runGraphQL, getConfig: () => makeConfig() };
    await expect(fetchCandidateIssues(deps, () => "query", fakeNormalizeIssue)).rejects.toThrow(LinearClientError);
  });

  it("throws LinearClientError when hasNextPage=true but endCursor is null", async () => {
    const runGraphQL = vi.fn().mockResolvedValue({
      data: {
        issues: {
          nodes: [makeIssueNode("1")],
          pageInfo: { hasNextPage: true, endCursor: null },
        },
      },
    });
    const deps = { runGraphQL, getConfig: () => makeConfig() };
    await expect(fetchCandidateIssues(deps, () => "query", fakeNormalizeIssue)).rejects.toThrow(LinearClientError);
  });
});

describe("fetchIssueStatesByIds", () => {
  it("returns empty array for empty ids", async () => {
    const runGraphQL = vi.fn();
    const deps = { runGraphQL, getConfig: () => makeConfig() };
    const result = await fetchIssueStatesByIds(deps, [], 50, () => "query", fakeNormalizeIssue);
    expect(result).toEqual([]);
    expect(runGraphQL).not.toHaveBeenCalled();
  });

  it("fetches ids in chunks", async () => {
    const runGraphQL = vi
      .fn()
      .mockResolvedValueOnce(makeSinglePageResponse([makeIssueNode("1"), makeIssueNode("2")]))
      .mockResolvedValueOnce(makeSinglePageResponse([makeIssueNode("3")]));
    const deps = { runGraphQL, getConfig: () => makeConfig() };
    const issues = await fetchIssueStatesByIds(deps, ["1", "2", "3"], 2, () => "query", fakeNormalizeIssue);
    expect(issues).toHaveLength(3);
    expect(runGraphQL).toHaveBeenCalledTimes(2);
    // First call with first 2 IDs
    expect(runGraphQL.mock.calls[0][1]).toMatchObject({ ids: ["1", "2"] });
    // Second call with remaining ID
    expect(runGraphQL.mock.calls[1][1]).toMatchObject({ ids: ["3"] });
  });
});

describe("fetchIssuesByStates", () => {
  it("returns empty array for empty states", async () => {
    const runGraphQL = vi.fn();
    const deps = { runGraphQL, getConfig: () => makeConfig() };
    const result = await fetchIssuesByStates(deps, [], () => "query", fakeNormalizeIssue);
    expect(result).toEqual([]);
    expect(runGraphQL).not.toHaveBeenCalled();
  });

  it("fetches issues for given states", async () => {
    const nodes = [makeIssueNode("5"), makeIssueNode("6")];
    const runGraphQL = vi.fn().mockResolvedValue(makeSinglePageResponse(nodes));
    const deps = { runGraphQL, getConfig: () => makeConfig() };
    const issues = await fetchIssuesByStates(deps, ["Done"], () => "query", fakeNormalizeIssue);
    expect(issues).toHaveLength(2);
    expect(runGraphQL).toHaveBeenCalledWith("query", { states: ["Done"], after: null });
  });
});
