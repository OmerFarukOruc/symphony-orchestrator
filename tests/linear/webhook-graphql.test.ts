import { afterEach, describe, expect, it, vi } from "vitest";
import { LinearClient, LinearClientError } from "../../src/linear/client.js";
import { createMockLogger } from "../helpers.js";
import type { ServiceConfig, SymphonyLogger } from "../../src/core/types.js";

function createConfig(): ServiceConfig {
  return {
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
  };
}

function makeClient(fetchMock: ReturnType<typeof vi.fn>): LinearClient {
  vi.stubGlobal("fetch", fetchMock);
  return new LinearClient(() => createConfig(), createMockLogger());
}

function makeClientWithLogger(fetchMock: ReturnType<typeof vi.fn>, logger: SymphonyLogger): LinearClient {
  vi.stubGlobal("fetch", fetchMock);
  return new LinearClient(() => createConfig(), logger);
}

function okResponse(data: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ data }),
  });
}

function getRequestBody(fetchMock: ReturnType<typeof vi.fn>, callIndex: number): Record<string, unknown> {
  const calls = fetchMock.mock.calls as Array<[string, { body?: unknown }] | []>;
  return JSON.parse(String(calls[callIndex]?.[1]?.body ?? "{}")) as Record<string, unknown>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LinearClient.listWebhooks", () => {
  it("returns parsed webhook objects from GraphQL response", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      okResponse({
        webhooks: {
          nodes: [
            {
              id: "wh-1",
              url: "https://example.com/webhook",
              enabled: true,
              label: "Symphony",
              teamId: "team-1",
              resourceTypes: ["Issue", "Comment"],
              secret: "sec-abc",
              createdAt: "2026-03-30T00:00:00Z",
              updatedAt: "2026-03-30T01:00:00Z",
            },
            {
              id: "wh-2",
              url: "https://example.com/webhook2",
              enabled: false,
              label: null,
              teamId: null,
              resourceTypes: ["Issue"],
              secret: null,
              createdAt: "2026-03-29T00:00:00Z",
              updatedAt: "2026-03-29T01:00:00Z",
            },
          ],
        },
      }),
    );
    const client = makeClient(fetchMock);
    const webhooks = await client.listWebhooks();

    expect(webhooks).toEqual([
      {
        id: "wh-1",
        url: "https://example.com/webhook",
        enabled: true,
        label: "Symphony",
        teamId: "team-1",
        resourceTypes: ["Issue", "Comment"],
        secret: "sec-abc",
      },
      {
        id: "wh-2",
        url: "https://example.com/webhook2",
        enabled: false,
        label: null,
        teamId: null,
        resourceTypes: ["Issue"],
        secret: null,
      },
    ]);

    const body = getRequestBody(fetchMock, 0);
    expect(body.query).toContain("SymphonyWebhooks");
  });

  it("handles empty nodes array", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(okResponse({ webhooks: { nodes: [] } }));
    const client = makeClient(fetchMock);
    const webhooks = await client.listWebhooks();
    expect(webhooks).toEqual([]);
  });

  it("handles missing/null fields gracefully", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      okResponse({
        webhooks: {
          nodes: [
            {
              id: null,
              url: null,
              enabled: null,
              label: null,
              teamId: null,
              resourceTypes: null,
              secret: null,
            },
          ],
        },
      }),
    );
    const client = makeClient(fetchMock);
    const webhooks = await client.listWebhooks();

    expect(webhooks).toEqual([
      {
        id: "",
        url: "",
        enabled: false,
        label: null,
        teamId: null,
        resourceTypes: [],
        secret: null,
      },
    ]);
  });
});

describe("LinearClient.createWebhook", () => {
  it("calls mutation with correct variables and returns id + secret", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      okResponse({
        webhookCreate: {
          success: true,
          webhook: {
            id: "wh-new",
            url: "https://example.com/hook",
            enabled: true,
            label: "Symphony",
            secret: "generated-secret",
            resourceTypes: ["Issue"],
            createdAt: "2026-03-30T00:00:00Z",
          },
        },
      }),
    );
    const client = makeClient(fetchMock);
    const result = await client.createWebhook({
      url: "https://example.com/hook",
      resourceTypes: ["Issue"],
      label: "Symphony",
      secret: "my-secret",
      teamId: "team-1",
    });

    expect(result).toEqual({ id: "wh-new", secret: "generated-secret" });

    const body = getRequestBody(fetchMock, 0);
    expect(body.query).toContain("SymphonyWebhookCreate");
    expect(body.variables).toEqual({
      url: "https://example.com/hook",
      teamId: "team-1",
      resourceTypes: ["Issue"],
      label: "Symphony",
      secret: "my-secret",
    });
  });

  it("retries on failure (3 attempts)", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("network error"))
      .mockRejectedValueOnce(new Error("network error again"))
      .mockResolvedValueOnce(
        okResponse({
          webhookCreate: {
            success: true,
            webhook: { id: "wh-retry", secret: "s" },
          },
        }),
      );
    const client = makeClient(fetchMock);
    const result = await client.createWebhook({
      url: "https://example.com/hook",
      resourceTypes: ["Issue"],
    });

    expect(result).toEqual({ id: "wh-retry", secret: "s" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("returns null secret when not provided in response", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      okResponse({
        webhookCreate: {
          success: true,
          webhook: { id: "wh-no-secret", secret: null },
        },
      }),
    );
    const client = makeClient(fetchMock);
    const result = await client.createWebhook({
      url: "https://example.com/hook",
      resourceTypes: ["Issue"],
    });

    expect(result.secret).toBeNull();
  });

  it("defaults optional fields to null in variables", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      okResponse({
        webhookCreate: {
          success: true,
          webhook: { id: "wh-defaults", secret: null },
        },
      }),
    );
    const client = makeClient(fetchMock);
    await client.createWebhook({
      url: "https://example.com/hook",
      resourceTypes: ["Issue"],
    });

    const body = getRequestBody(fetchMock, 0);
    expect(body.variables).toEqual({
      url: "https://example.com/hook",
      teamId: null,
      resourceTypes: ["Issue"],
      label: null,
      secret: null,
    });
  });
});

describe("LinearClient.updateWebhook", () => {
  it("calls mutation with id + input fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okResponse({
        webhookUpdate: {
          success: true,
          webhook: { id: "wh-1", url: "https://new.example.com", enabled: true },
        },
      }),
    );
    const client = makeClient(fetchMock);
    await client.updateWebhook("wh-1", {
      url: "https://new.example.com",
      label: "Updated",
      resourceTypes: ["Issue", "Comment"],
    });

    const body = getRequestBody(fetchMock, 0);
    expect(body.query).toContain("SymphonyWebhookUpdate");
    expect(body.variables).toEqual({
      id: "wh-1",
      url: "https://new.example.com",
      label: "Updated",
      resourceTypes: ["Issue", "Comment"],
    });
  });

  it("can re-enable a disabled webhook", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okResponse({
        webhookUpdate: {
          success: true,
          webhook: { id: "wh-1", enabled: true },
        },
      }),
    );
    const client = makeClient(fetchMock);
    await client.updateWebhook("wh-1", { enabled: true });

    const body = getRequestBody(fetchMock, 0);
    expect(body.variables).toEqual({ id: "wh-1", enabled: true });
  });
});

describe("LinearClient.deleteWebhook", () => {
  it("calls mutation with id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse({ webhookDelete: { success: true } }));
    const client = makeClient(fetchMock);
    await client.deleteWebhook("wh-1");

    const body = getRequestBody(fetchMock, 0);
    expect(body.query).toContain("SymphonyWebhookDelete");
    expect(body.variables).toEqual({ id: "wh-1" });
  });

  it("retries on failure", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("network error"))
      .mockResolvedValueOnce(okResponse({ webhookDelete: { success: true } }));
    const client = makeClient(fetchMock);
    await expect(client.deleteWebhook("wh-1")).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("webhook GraphQL error paths", () => {
  it("listWebhooks throws LinearClientError on GraphQL errors", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          data: null,
          errors: [{ message: "Unauthorized" }],
        }),
    });
    const client = makeClient(fetchMock);
    await expect(client.listWebhooks()).rejects.toBeInstanceOf(LinearClientError);
    await expect(
      makeClient(
        vi.fn().mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ data: null, errors: [{ message: "err" }] }),
        }),
      ).listWebhooks(),
    ).rejects.toMatchObject({ code: "linear_graphql_error" });
  });

  it("createWebhook throws after max retries on persistent failure", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("always fails"));
    const client = makeClient(fetchMock);
    await expect(client.createWebhook({ url: "https://example.com", resourceTypes: ["Issue"] })).rejects.toBeInstanceOf(
      LinearClientError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("updateWebhook swallows errors after max retries (non-fatal)", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("always fails"));
    const logger = createMockLogger();
    const client = makeClientWithLogger(fetchMock, logger);
    await expect(client.updateWebhook("wh-1", { enabled: true })).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ operation: "updateWebhook", attempt: 3 }),
      "linear write-back failed after max retries (non-fatal)",
    );
  });

  it("deleteWebhook swallows errors after max retries (non-fatal)", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("always fails"));
    const client = makeClient(fetchMock);
    await expect(client.deleteWebhook("wh-1")).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
