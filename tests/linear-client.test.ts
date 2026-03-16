import { afterEach, describe, expect, it, vi } from "vitest";

import { LinearClient } from "../src/linear-client.js";
import { createLogger } from "../src/logger.js";
import type { ServiceConfig } from "../src/types.js";

function createConfig(): ServiceConfig {
  return {
    tracker: {
      kind: "linear",
      apiKey: "linear-token",
      projectSlug: "EXAMPLE",
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
      maxTurns: 2,
      maxRetryBackoffMs: 120000,
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

describe("LinearClient", () => {
  it("normalizes issues and lowercases labels", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: {
          issues: {
            nodes: [
              {
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
              },
            ],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      }),
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
});
