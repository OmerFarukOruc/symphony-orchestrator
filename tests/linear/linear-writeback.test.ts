import { describe, expect, it, vi } from "vitest";
import { LinearClient } from "../../src/linear/client.js";
import { createMockLogger } from "../helpers.js";

function makeClient(fetchMock: ReturnType<typeof vi.fn>): LinearClient {
  vi.stubGlobal("fetch", fetchMock);
  return new LinearClient(
    () => ({
      tracker: {
        kind: "linear",
        apiKey: "test-key",
        endpoint: "https://api.linear.app/graphql",
        projectSlug: null,
        activeStates: ["In Progress"],
        terminalStates: ["Done"],
      },
      polling: { intervalMs: 30000 },
      workspace: {
        root: "/tmp",
        hooks: { afterCreate: null, beforeRun: null, afterRun: null, beforeRemove: null, timeoutMs: 1000 },
      },
      agent: {
        maxConcurrentAgents: 2,
        maxConcurrentAgentsByState: {},
        maxTurns: 2,
        maxRetryBackoffMs: 300000,
        maxContinuationAttempts: 5,
        successState: "Done",
        stallTimeoutMs: 1200000,
      },
      codex: {
        command: "codex",
        model: "gpt-5.4",
        reasoningEffort: "high",
        approvalPolicy: "never",
        threadSandbox: "danger-full-access",
        turnSandboxPolicy: { type: "dangerFullAccess" },
        readTimeoutMs: 1000,
        turnTimeoutMs: 10000,
        drainTimeoutMs: 0,
        startupTimeoutMs: 5000,
        stallTimeoutMs: 300000,
        auth: { mode: "api_key", sourceHome: "/tmp" },
        provider: null,
        sandbox: {
          image: "node:22",
          network: "none",
          security: { noNewPrivileges: true, dropCapabilities: true, gvisor: false, seccompProfile: "" },
          resources: { memory: "1g", memoryReservation: "512m", memorySwap: "2g", cpus: "1", tmpfsSize: "100m" },
          extraMounts: [],
          envPassthrough: [],
          logs: { driver: "json-file", maxSize: "50m", maxFile: 3 },
          egressAllowlist: [],
        },
      },
      server: { port: 4000 },
    }),
    createMockLogger(),
  );
}

function okResponse(data: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ data }),
  });
}

describe("LinearClient.resolveStateId", () => {
  it("returns the state id for a matching state name (case-insensitive)", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      okResponse({
        workflowStates: {
          nodes: [
            { id: "state-done", name: "Done" },
            { id: "state-progress", name: "In Progress" },
          ],
        },
      }),
    );
    const client = makeClient(fetchMock);
    const id = await client.resolveStateId("done");
    expect(id).toBe("state-done");
  });

  it("returns null when state name not found", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(okResponse({ workflowStates: { nodes: [{ id: "state-done", name: "Done" }] } }));
    const client = makeClient(fetchMock);
    const id = await client.resolveStateId("nonexistent");
    expect(id).toBeNull();
  });
});

describe("LinearClient.updateIssueState", () => {
  it("calls the issueUpdate mutation with the correct variables", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okResponse({
        issueUpdate: { success: true, issue: { id: "issue-1", identifier: "MT-1", state: { name: "Done" } } },
      }),
    );
    const client = makeClient(fetchMock);
    await client.updateIssueState("issue-1", "state-done");

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as {
      variables: { issueId: string; stateId: string };
    };
    expect(body.variables.issueId).toBe("issue-1");
    expect(body.variables.stateId).toBe("state-done");
  });

  it("retries on failure and succeeds on second attempt", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("network error"))
      .mockResolvedValueOnce(okResponse({ issueUpdate: { success: true } }));
    const client = makeClient(fetchMock);
    await expect(client.updateIssueState("issue-1", "state-done")).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("swallows errors after max retries (non-blocking)", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("always fails"));
    const client = makeClient(fetchMock);
    await expect(client.updateIssueState("issue-1", "state-done")).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not retry when Linear returns an unconfirmed issueUpdate payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse({ issueUpdate: { success: false } }));
    const client = makeClient(fetchMock);

    await expect(client.updateIssueState("issue-1", "state-done")).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("LinearClient.updateIssueStateStrict", () => {
  it("retries and succeeds on second attempt", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("network error"))
      .mockResolvedValueOnce(okResponse({ issueUpdate: { success: true } }));
    const client = makeClient(fetchMock);
    await expect(client.updateIssueStateStrict("issue-1", "state-done")).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("re-throws after max retries so callers can report failure", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("always fails"));
    const client = makeClient(fetchMock);
    await expect(client.updateIssueStateStrict("issue-1", "state-done")).rejects.toThrow(
      /linear graphql request failed during transport/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("re-throws when Linear returns an unconfirmed issueUpdate payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse({ issueUpdate: { success: false } }));
    const client = makeClient(fetchMock);

    await expect(client.updateIssueStateStrict("issue-1", "state-done")).rejects.toThrow(
      /linear issue transition was not confirmed/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("LinearClient.createComment", () => {
  it("calls the commentCreate mutation with the correct variables", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(okResponse({ commentCreate: { success: true, comment: { id: "comment-1" } } }));
    const client = makeClient(fetchMock);
    await client.createComment("issue-1", "Agent completed ✓");

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as {
      variables: { issueId: string; body: string };
    };
    expect(body.variables.issueId).toBe("issue-1");
    expect(body.variables.body).toBe("Agent completed ✓");
  });

  it("swallows errors after max retries (non-blocking)", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("always fails"));
    const client = makeClient(fetchMock);
    await expect(client.createComment("issue-1", "hello")).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
