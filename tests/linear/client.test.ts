import { afterEach, describe, expect, it, vi } from "vitest";

import { LinearClient, LinearClientError } from "../../src/linear/client.js";
import { createLogger } from "../../src/core/logger.js";
import type { PlannedIssue } from "../../src/planning/skill.js";
import type { ServiceConfig } from "../../src/core/types.js";

function createConfig(): ServiceConfig {
  return {
    tracker: {
      kind: "linear",
      apiKey: "linear-token",
      endpoint: "https://api.linear.app/graphql",
      projectSlug: "EXAMPLE",
      activeStates: ["In Progress"],
      terminalStates: ["Done", "Completed", "Canceled", "Cancelled", "Duplicate"],
    },
    polling: { intervalMs: 30000 },
    workspace: {
      root: "/tmp/symphony",
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
      stallTimeoutMs: 10000,
    },
    server: { port: 4000 },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function issueNode(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: "issue-1",
    identifier: "MT-42",
    title: "Fix orchestration",
    description: "details",
    priority: 2,
    branchName: "feature/mt-42",
    url: "https://linear.app/issue/MT-42",
    createdAt: "2026-03-15T00:00:00Z",
    updatedAt: "2026-03-16T00:00:00Z",
    state: { name: "In Progress" },
    labels: { nodes: [{ name: "Bug" }, { name: "Backend" }] },
    inverseRelations: {
      nodes: [
        {
          id: "rel-1",
          issue: { id: "issue-1", identifier: "MT-42", state: { name: "In Progress" } },
          relatedIssue: { id: "blk-1", identifier: "MT-40", state: { name: "Done" } },
        },
      ],
    },
    ...overrides,
  };
}

function issuesPayload(options?: {
  hasNextPage?: boolean;
  endCursor?: string | null;
  nodes?: unknown[];
}): Record<string, unknown> {
  return {
    data: {
      issues: {
        nodes: options?.nodes ?? [issueNode()],
        pageInfo: {
          hasNextPage: options?.hasNextPage ?? false,
          endCursor: options?.endCursor ?? null,
        },
      },
    },
  };
}

describe("LinearClient", () => {
  it("normalizes issues and lowercases labels", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => issuesPayload(),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new LinearClient(() => createConfig(), createLogger());
    const issues = await client.fetchCandidateIssues();

    expect(issues).toEqual([
      expect.objectContaining({
        id: "issue-1",
        identifier: "MT-42",
        labels: ["bug", "backend"],
        blockedBy: [{ id: "blk-1", identifier: "MT-40", state: "Done" }],
      }),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws linear_transport_error when fetch rejects", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("network down");
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new LinearClient(() => createConfig(), createLogger());
    await expect(client.fetchCandidateIssues()).rejects.toMatchObject({
      code: "linear_transport_error",
    });
    await expect(client.fetchCandidateIssues()).rejects.toBeInstanceOf(LinearClientError);
  });

  it("throws linear_http_error for non-200 response statuses", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
      json: async () => ({
        errors: [{ message: "upstream outage" }],
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new LinearClient(() => createConfig(), createLogger());
    await expect(client.fetchCandidateIssues()).rejects.toMatchObject({
      code: "linear_http_error",
    });
  });

  it("throws linear_graphql_error when a 200 payload includes errors", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        data: null,
        errors: [{ message: "Field 'issues' not found", locations: [{ line: 2, column: 3 }] }],
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new LinearClient(() => createConfig(), createLogger());
    await expect(client.fetchCandidateIssues()).rejects.toMatchObject({
      code: "linear_graphql_error",
    });
  });

  it("throws linear_unknown_payload for unexpected body shape", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        data: {
          notIssues: {
            nodes: [],
          },
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new LinearClient(() => createConfig(), createLogger());
    await expect(client.fetchCandidateIssues()).rejects.toMatchObject({
      code: "linear_unknown_payload",
    });
  });

  it("throws linear_unknown_payload when response is not valid json", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => {
        throw new SyntaxError("Unexpected token < in JSON");
      },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new LinearClient(() => createConfig(), createLogger());
    await expect(client.fetchCandidateIssues()).rejects.toMatchObject({
      code: "linear_unknown_payload",
    });
  });

  it("throws linear_missing_end_cursor when hasNextPage=true and endCursor is null", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => issuesPayload({ hasNextPage: true, endCursor: null }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new LinearClient(() => createConfig(), createLogger());
    await expect(client.fetchCandidateIssues()).rejects.toMatchObject({
      code: "linear_missing_end_cursor",
    });
  });

  it("uses the configured endpoint and active state variables for candidate queries", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => issuesPayload({ nodes: [] }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const config = createConfig();
    config.tracker.endpoint = "https://linear.example.test/graphql";
    config.tracker.activeStates = ["In Progress", "Review"];

    const client = new LinearClient(() => config, createLogger());
    await client.fetchCandidateIssues();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://linear.example.test/graphql",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"activeStates":["In Progress","Review"]'),
      }),
    );
  });

  it("creates Linear issues from a generated plan using the resolved project, team, and label ids", async () => {
    const issues: PlannedIssue[] = [
      {
        id: "PLAN-1",
        title: "Create backend slice",
        summary: "Implement the backend endpoint.",
        acceptanceCriteria: ["Adds an endpoint", "Covers the endpoint with tests"],
        dependencies: [],
        priority: "high",
        labels: ["backend", "api"],
      },
      {
        id: "PLAN-2",
        title: "Create frontend slice",
        summary: "Implement the frontend view.",
        acceptanceCriteria: ["Renders the endpoint output"],
        dependencies: ["PLAN-1"],
        priority: "medium",
        labels: ["frontend"],
      },
    ];

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          data: {
            projects: {
              nodes: [
                {
                  id: "project-1",
                  teams: {
                    nodes: [{ id: "team-1" }],
                  },
                },
              ],
            },
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          data: {
            issueLabels: {
              nodes: [
                { id: "label-1", name: "backend" },
                { id: "label-2", name: "api" },
                { id: "label-3", name: "frontend" },
              ],
            },
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          data: {
            issueCreate: {
              success: true,
              issue: {
                id: "issue-1",
                identifier: "ABC-101",
                url: "https://linear.example/ABC-101",
              },
            },
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          data: {
            issueCreate: {
              success: true,
              issue: {
                id: "issue-2",
                identifier: "ABC-102",
                url: "https://linear.example/ABC-102",
              },
            },
          },
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const client = new LinearClient(() => createConfig(), createLogger());
    await expect(client.createIssuesFromPlan(issues)).resolves.toEqual([
      { id: "issue-1", identifier: "ABC-101", url: "https://linear.example/ABC-101" },
      { id: "issue-2", identifier: "ABC-102", url: "https://linear.example/ABC-102" },
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(4);

    const projectLookupBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(projectLookupBody.query).toContain("query SymphonyPlanProject");
    expect(projectLookupBody.variables).toEqual({ projectSlug: "EXAMPLE" });

    const labelLookupBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(labelLookupBody.query).toContain("query SymphonyPlanLabels");
    expect(labelLookupBody.variables).toEqual({
      teamId: "team-1",
      names: ["backend", "api", "frontend"],
    });

    const firstCreateBody = JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body));
    expect(firstCreateBody.query).toContain("mutation SymphonyCreateIssue");
    expect(firstCreateBody.variables.input).toEqual(
      expect.objectContaining({
        teamId: "team-1",
        projectId: "project-1",
        title: "Create backend slice",
        priority: 1,
        labelIds: ["label-1", "label-2"],
      }),
    );
    expect(firstCreateBody.variables.input.description).toContain("Plan item: PLAN-1");

    const secondCreateBody = JSON.parse(String(fetchMock.mock.calls[3]?.[1]?.body));
    expect(secondCreateBody.variables.input).toEqual(
      expect.objectContaining({
        teamId: "team-1",
        projectId: "project-1",
        title: "Create frontend slice",
        priority: 2,
        labelIds: ["label-3"],
      }),
    );
    expect(secondCreateBody.variables.input.description).toContain("- ABC-101");
  });

  it("fails clearly when plan execution cannot resolve a unique team", async () => {
    const config = createConfig();
    config.tracker.projectSlug = null;
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        data: {
          teams: {
            nodes: [{ id: "team-1" }, { id: "team-2" }],
          },
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new LinearClient(() => config, createLogger());
    await expect(
      client.createIssuesFromPlan([
        {
          id: "PLAN-1",
          title: "One issue",
          summary: "One issue",
          acceptanceCriteria: [],
          dependencies: [],
          priority: "low",
          labels: [],
        },
      ]),
    ).rejects.toThrow("unable to resolve a unique Linear team without tracker.project_slug");
  });
});
