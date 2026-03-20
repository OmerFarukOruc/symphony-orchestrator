import { describe, it, expect, vi } from "vitest";
import { DispatchClient } from "../../src/dispatch/client.js";
import type { ServiceConfig, Issue, ModelSelection, Workspace, RunOutcome } from "../../src/core/types.js";

// Mock the codex runtime config module
vi.mock("../../src/codex/runtime-config.js", () => ({
  prepareCodexRuntimeConfig: vi.fn().mockResolvedValue({
    configToml: 'model = "test-model"\n',
    authJsonBase64: null,
  }),
  getRequiredProviderEnvNames: vi.fn().mockReturnValue(["OPENAI_API_KEY"]),
}));

describe("DispatchClient", () => {
  const mockConfig = {
    tracker: {
      kind: "linear",
      apiKey: "test",
      endpoint: "https://api.linear.app",
      projectSlug: "test",
      activeStates: [],
      terminalStates: [],
    },
    polling: { intervalMs: 30000 },
    workspace: {
      root: "/tmp/workspaces",
      hooks: { afterCreate: null, beforeRun: null, afterRun: null, beforeRemove: null, timeoutMs: 30000 },
    },
    agent: { maxConcurrentAgents: 3, maxConcurrentAgentsByState: {}, maxTurns: 50, maxRetryBackoffMs: 60000 },
    codex: {
      command: "codex",
      model: "test-model",
      reasoningEffort: null,
      approvalPolicy: "suggest",
      threadSandbox: "none",
      turnSandboxPolicy: { type: "none" },
      readTimeoutMs: 30000,
      turnTimeoutMs: 300000,
      drainTimeoutMs: 5000,
      startupTimeoutMs: 60000,
      stallTimeoutMs: 60000,
      auth: { mode: "api_key", sourceHome: "/tmp" },
      provider: null,
      sandbox: {
        image: "test",
        network: "none",
        security: { noNewPrivileges: true, dropCapabilities: true, gvisor: false, seccompProfile: "" },
        resources: { memory: "1g", memoryReservation: "512m", memorySwap: "2g", cpus: "1", tmpfsSize: "100m" },
        extraMounts: [],
        envPassthrough: [],
        logs: { driver: "json-file", maxSize: "10m", maxFile: 3 },
        egressAllowlist: [],
      },
    },
    server: { port: 4000 },
  } as ServiceConfig;

  const mockIssue: Issue = {
    id: "test-id",
    identifier: "TEST-1",
    title: "Test Issue",
    description: "Test description",
    priority: 1,
    state: "active",
    branchName: null,
    url: "https://linear.app/test/TEST-1",
    labels: [],
    blockedBy: [],
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
  };

  const mockModelSelection: ModelSelection = {
    model: "test-model",
    reasoningEffort: null,
    source: "default",
  };

  const mockWorkspace: Workspace = {
    path: "/tmp/workspaces/TEST-1",
    workspaceKey: "TEST-1",
    createdNow: false,
  };

  const createMockLogger = () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  });

  it("POSTs to dispatch URL with correct headers", async () => {
    const mockOutcome: RunOutcome = {
      kind: "normal",
      errorCode: null,
      errorMessage: null,
      threadId: "thread-1",
      turnId: "turn-1",
      turnCount: 1,
    };

    // Mock fetch
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: () => ({
          read: vi
            .fn()
            .mockResolvedValueOnce({
              done: false,
              value: new TextEncoder().encode(
                'data: {"type":"outcome","payload":{"kind":"normal","errorCode":null,"errorMessage":null,"threadId":"thread-1","turnId":"turn-1","turnCount":1}}\n\n',
              ),
            })
            .mockResolvedValueOnce({ done: true }),
          releaseLock: vi.fn(),
        }),
      },
    });

    vi.stubGlobal("fetch", mockFetch);

    const client = new DispatchClient({
      dispatchUrl: "http://test:9100/dispatch",
      secret: "test-secret",
      getConfig: () => mockConfig,
      logger: createMockLogger() as unknown as ReturnType<typeof import("../../src/core/logger.js").createLogger>,
    });

    const events: unknown[] = [];
    const outcome = await client.runAttempt({
      issue: mockIssue,
      attempt: 1,
      modelSelection: mockModelSelection,
      promptTemplate: "Test prompt",
      workspace: mockWorkspace,
      signal: new AbortController().signal,
      onEvent: (event) => events.push(event),
    });

    expect(outcome).toEqual(mockOutcome);
    expect(mockFetch).toHaveBeenCalledWith(
      "http://test:9100/dispatch",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-secret",
          "Content-Type": "application/json",
        }),
      }),
    );
  });

  it("throws error when dispatch request fails", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Internal Server Error"),
    });

    vi.stubGlobal("fetch", mockFetch);

    const client = new DispatchClient({
      dispatchUrl: "http://test:9100/dispatch",
      secret: "test-secret",
      getConfig: () => mockConfig,
      logger: createMockLogger() as unknown as ReturnType<typeof import("../../src/core/logger.js").createLogger>,
    });

    await expect(
      client.runAttempt({
        issue: mockIssue,
        attempt: 1,
        modelSelection: mockModelSelection,
        promptTemplate: "Test prompt",
        workspace: mockWorkspace,
        signal: new AbortController().signal,
        onEvent: vi.fn(),
      }),
    ).rejects.toThrow("Dispatch request failed: 500");
  });
});
